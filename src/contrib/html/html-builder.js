// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * HtmlBuilder + HtmlRenderer — JS port of contrib/html (embryo slice).
 *
 * The grammar is a handful of tags in the `builder_grammar` shape
 * (`{tag: {subTags, meta}}`), so swapping it for the loader of
 * `html.json` later is a replacement, not a rewrite.
 *
 * `HtmlRenderer` overrides `renderedItem` of `RendererBase`. DIFF-PYTHON:
 * the Python `HtmlRenderer.rendered_item` emits a markup STRING; this one
 * emits a DOM `Element` (`document.createElement`) — the model of the
 * legacy `gnrdomsource.js`, the form reactivity needs. Everything else
 * (the walk, `_handleMeta`, `runtimeValues`, include_datapath ids and
 * `data-*-pointer` hooks) follows the Python architecture linearly.
 */
import { RendererBase } from '../../renderer/base.js';
import { BuilderBase } from '../../builder-base.js';
import { HTML5_GRAMMAR } from './html5-elements.js';

/** HTML5 void elements: rendered without children/closing tag. */
const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/** Root names that classify a kwarg as a CSS property (Genro-style inline
 *  styling): a kwarg is CSS if its name equals a root, or starts with a
 *  root + '_' (underscore→dash yields the property). Ported verbatim from
 *  the Python HtmlRenderer._STYLE_ROOTS. */
const STYLE_ROOTS = new Set([
    'width', 'height', 'top', 'left', 'right', 'bottom',
    'padding', 'margin', 'border', 'position', 'display',
    'overflow', 'float', 'clear', 'resize', 'z_index',
    'min_width', 'min_height', 'max_width', 'max_height',
    'color', 'background', 'font', 'text',
    'line_height', 'white_space', 'vertical_align',
    'flex', 'gap', 'row_gap', 'column_gap', 'grid',
    'align_content', 'justify_content', 'align_items', 'justify_items',
    'visibility', 'opacity', 'cursor',
]);

/** True if `name` matches a CSS root or a `root_*` form. */
function isStyleAttr(name) {
    if (STYLE_ROOTS.has(name)) {
        return true;
    }
    for (const root of STYLE_ROOTS) {
        if (name.startsWith(`${root}_`)) {
            return true;
        }
    }
    return false;
}

/** Parse a `style="k: v; k: v"` literal into an object (last wins). An
 *  entry without ':' is malformed CSS and throws. */
function parseStyleString(value) {
    const result = {};
    if (!value) {
        return result;
    }
    for (const raw of String(value).split(';')) {
        const entry = raw.trim();
        if (!entry) {
            continue;
        }
        const i = entry.indexOf(':');
        if (i === -1) {
            throw new Error(`malformed style declaration: ${entry}`);
        }
        result[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
    }
    return result;
}

export class HtmlBuilder extends BuilderBase {
    static _name = 'html';

    static _defaultRenderMode = 'html';

    static { this.defineGrammar(HTML5_GRAMMAR); }   // __init_subclass__ equivalent

    get renderer_html() {
        return new HtmlRenderer(this);
    }
}

export class HtmlRenderer extends RendererBase {
    /** Emit the DOM element for `node` (parity with rendered_item). */
    renderedItem(node, item, runtimeAttrs, { tag, includeDatapath = false }) {
        const el = document.createElement(tag);
        this._applyAttrs(el, runtimeAttrs);
        if (includeDatapath) {
            this._autoId(el, node, runtimeAttrs);
            this._datapathAttrs(el, node);
        }
        if (VOID_TAGS.has(tag)) {
            return el;
        }
        if (Array.isArray(item)) {
            for (const child of item) {
                el.appendChild(child);
            }
        } else if (item !== null && item !== undefined) {
            el.textContent = String(item);
        }
        return el;
    }

    /** Serialize the resolved attributes onto the element. */
    _applyAttrs(el, attrs) {
        for (const [name, value] of Object.entries(attrs)) {
            if (value === true) {
                el.setAttribute(name, '');
            } else if (value !== false && value !== null && value !== undefined) {
                el.setAttribute(name, String(value));
            }
        }
    }

    /** Emit the DOM id (target_id) for a node in reactive render mode. */
    _autoId(el, node, runtimeAttrs) {
        if ('id' in runtimeAttrs) {
            return;
        }
        const targetId = this.builder.targetId(node);
        if (targetId !== null) {
            el.id = targetId;
        }
    }

    /** Emit `data-<name>-pointer` write-back hooks for pointer attributes. */
    _datapathAttrs(el, node) {
        for (const [rawName, value] of Object.entries(node.getAttr() || {})) {
            if (!(typeof value === 'string' && value && (value[0] === '^' || value[0] === '='))) {
                continue;
            }
            const htmlName = this.adapt(rawName);
            el.setAttribute(`data-${htmlName}-pointer`, node.absDatapath(value));
        }
    }

    /** Collapse CSS roots, `style_*` escapes and an explicit `style` into a
     *  single `style` entry; plain HTML attributes (with the keyword-collision
     *  remap already applied upstream) pass through. Port of the Python
     *  HtmlRenderer.adapt_attrs. DIFF-PYTHON: the Genro CSS macros
     *  (rounded/gradient/shadow/…) and the retained `validate_*` families are
     *  later slices — not handled here. Units are the author's (write
     *  `width:'320px'`), as in the Python `_css_value`. */
    adaptAttrs(attrs) {
        const out = {};
        const styleAttrs = {};
        const dialectPrefix = `${this.builder.constructor._name}_`;
        for (const [rawName, value] of Object.entries(attrs)) {
            // dialect escape `html_<x>` → the literal HTML attribute <x>
            if (rawName.startsWith(dialectPrefix)) {
                out[this.adapt(rawName)] = value;
                continue;
            }
            if (this._isStyleContribution(rawName)) {
                styleAttrs[rawName] = value;
                continue;
            }
            out[rawName] = value;
        }
        const style = this._adaptStyle(styleAttrs);
        if (style) {
            out.style = style;
        }
        return out;
    }

    /** Whether `rawName` feeds the composed `style` entry (vs a plain attr). */
    _isStyleContribution(rawName) {
        if (rawName === 'style' || rawName.startsWith('style_')) {
            return true;
        }
        return isStyleAttr(rawName);
    }

    /** Compose the CSS `style` text: explicit `style` seeded first, then
     *  `style_<prop>` escapes and CSS roots (kwargs win on collision). */
    _adaptStyle(attrs) {
        const css = {};
        for (const [rawName, value] of Object.entries(attrs)) {
            if (rawName === 'style') {
                Object.assign(css, parseStyleString(value));
            } else if (rawName.startsWith('style_')) {
                css[rawName.slice('style_'.length).replace(/_/g, '-')] = this._cssValue(value);
            } else {
                css[rawName.replace(/_/g, '-')] = this._cssValue(value);
            }
        }
        return Object.entries(css).map(([k, v]) => `${k}: ${v}`).join('; ');
    }

    /** Render a CSS value verbatim (units are the author's). */
    _cssValue(value) {
        if (value === true) { return 'true'; }
        if (value === false) { return 'false'; }
        return String(value);
    }
}
