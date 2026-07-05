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

/** HTML5 void elements: rendered without children/closing tag. */
const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

export class HtmlBuilder extends BuilderBase {
    static _name = 'html';

    static _defaultRenderMode = 'html';

    static SCHEMA = {
        body: { subTags: '*' },
        div: { subTags: '*' },
        h1: { subTags: '*' },
        h2: { subTags: '*' },
        h3: { subTags: '*' },
        p: { subTags: '*' },
        ul: { subTags: 'li' },
        li: { subTags: '*' },
        span: { subTags: '*' },
        a: { subTags: '*' },
        nav: { subTags: '*' },
        header: { subTags: '*' },
        section: { subTags: '*' },
        button: { subTags: '*' },
        iframe: { subTags: '' },
        input: {},
        br: {},
    };

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
}
