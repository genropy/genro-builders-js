// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * TargetWrapper — JS port of builder/target_wrapper.py.
 *
 * The render destination as an object. `full(document)` consumes a
 * total render; `partial(patches)` a batch of per-node patches when
 * `acceptsPartial` is true. `renderOpts` are the walk options the
 * destination dictates (a patch consumer needs the DOM ids, hence
 * `{includeDatapath: true}`).
 *
 * `DomTarget` is the browser destination: `full` replaces the children
 * of a root element with a freshly rendered fragment; `partial` applies
 * the patch ops (`replace`/`insert`/`remove`) by DOM id. Patch ids are
 * the `targetId` serials the reactive render emits as the element id.
 */

export class TargetWrapper {
    get acceptsPartial() {
        return false;
    }

    get renderOpts() {
        return {};
    }

    full(_document) {
        throw new Error(`${this.constructor.name} does not implement full()`);
    }

    partial(_patches) {
        throw new Error(
            `${this.constructor.name} declares acceptsPartial but does not `
            + 'implement partial()',
        );
    }
}

export class DomTarget extends TargetWrapper {
    /** @param {Element} rootElement host element for this render. */
    constructor(rootElement) {
        super();
        this.root = rootElement;
    }

    get acceptsPartial() {
        return true;
    }

    get renderOpts() {
        return { includeDatapath: true };
    }

    /** Replace the root's children with the rendered fragment. */
    full(document) {
        this.root.replaceChildren(document);
    }

    /** Locate an element by exact id. An attribute selector, dot-safe: a
     *  derived expansion id (`blk.r2.3`) is a valid id but not a valid
     *  `#id` selector, and jsdom's `CSS.escape` is a no-op — the attribute
     *  form works in both jsdom and browsers. */
    _byId(id) {
        return this.root.querySelector(`[id="${id.replace(/["\\]/g, '\\$&')}"]`);
    }

    /** Apply a batch of per-node patches to the live DOM. */
    partial(patches) {
        for (const patch of patches) {
            if (patch.op === 'insert') {
                // A null container id means the document root.
                const container = patch.id === null ? this.root : this._byId(patch.id);
                const before = patch.before ? this._byId(patch.before) : null;
                if (container) {
                    container.insertBefore(patch.node, before);
                }
                continue;
            }
            const el = this._byId(patch.id);
            if (patch.op === 'remove') {
                if (el) {
                    el.remove();
                }
            } else if (patch.op === 'replace') {
                if (el) {
                    el.replaceWith(patch.node);
                }
            } else if (patch.op === 'text') {
                // Value-only cell patch: a reader span's text content.
                if (el) {
                    el.textContent = patch.value;
                }
            } else if (patch.op === 'attr') {
                // Value-only cell patch: a bound input's attribute.
                if (el) {
                    el.setAttribute(patch.name, patch.value);
                }
            }
        }
    }
}
