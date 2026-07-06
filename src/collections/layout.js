// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * layout — container web components. Unlike the input widgets (leaf, value),
 * these ACCEPT CHILDREN: the grammar opens sub_tags to `*`, and the custom
 * element projects the light-DOM children through a shadow `<slot>`.
 *
 * The renderer already appends the rendered children to the host (light
 * DOM); the slot shows them. Events from children bubble normally (they
 * live in the light DOM), so the write-back reaches them as usual.
 *
 *   panel  — a framed box with an optional `caption` header.
 *   box    — a plain framed box.
 *   borderContainer — CSS-grid layout, children go to named regions via
 *                     `slot` (top/left/right/bottom; unslotted → center);
 *                     a region child with `splitter` gets a drag-resize bar.
 *   tabContainer / tab — a tab shell whose selection lives IN THE DATA:
 *                     `value="^ui.tab"` (a pointer). A click sets the value
 *                     and re-emits `change` composed → the SAME write-back as
 *                     the input widgets (no data-set-pointer needed). The
 *                     shadow only draws the strip + shows the active pane;
 *                     the panes are slotted light-DOM (real, reactive) nodes.
 *
 * Ported from ws-web `widgets/containers.py` + `resources/lib/container.js`.
 * DIFF-WS-WEB: ws-web made these @container (real nodes, no shadow — an
 * iframe inside survives a morph); here they are web components (more
 * reusable/self-contained) with the invariant that CONTENT stays in the
 * light-DOM slot (still real, still patched by the reactive engine) and only
 * the chrome lives in the shadow.
 */
import { registerCollection, webcomponent } from '../collections.js';

const GRAMMAR = {
    elements: {
        panel: webcomponent('panel', { subTags: '*' }),
        box: webcomponent('box', { subTags: '*' }),
        borderContainer: webcomponent('borderContainer', { subTags: '*' }),
        tabContainer: webcomponent('tabContainer', { subTags: '*' }),
        tab: webcomponent('tab', { subTags: '*' }),
    },
};

const PANEL_CSS =
    ':host { display: block; margin: 8px 0; }'
    + '.p { border: 1px solid var(--panel-border, #ccc); border-radius: 6px; }'
    + '.hdr { background: var(--panel-hdr-bg, #f4f4f4); padding: 6px 10px;'
    + '  font-weight: 600; border-bottom: 1px solid var(--panel-border, #ccc);'
    + '  border-radius: 6px 6px 0 0; }'
    + '.hdr:empty { display: none; border-bottom: none; }'
    + '.body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }';

const BOX_CSS =
    ':host { display: block; margin: 8px 0; }'
    + '.b { border: 1px dashed var(--box-border, #bbb); border-radius: 6px;'
    + '  padding: 10px; display: flex; flex-direction: column; gap: 8px; }';

//: the two legacy designs (dijit BorderContainer): headline = top and bottom
//: span the full width; sidebar = left and right span the full height.
const BORDER_DESIGNS = {
    headline: '"top top top" "left center right" "bottom bottom bottom"',
    sidebar: '"left top right" "left center right" "left bottom right"',
};

const BORDER_CSS =
    ':host { display: grid; height: 100%; box-sizing: border-box;'
    + '  grid-template-rows: auto 1fr auto; grid-template-columns: auto 1fr auto; }'
    + '.region { position: relative; overflow: auto; min-width: 0; min-height: 0; }'
    + '.region.center { border: 0; }'
    + '.handle { position: absolute; z-index: 5; }'
    + '.handle.x { top: 0; bottom: 0; width: 6px; cursor: col-resize; }'
    + '.handle.y { left: 0; right: 0; height: 6px; cursor: row-resize; }'
    + '.handle:hover { background: var(--splitter-hover, rgba(74,144,217,.4)); }';

const TABS_CSS =
    ':host { display: flex; flex-direction: column; min-height: 0; }'
    + '.tabbar { display: flex; gap: 2px; border-bottom: 1px solid #c8c8c8; }'
    + '.tab { padding: .35rem .8rem; border: 1px solid #c8c8c8; border-bottom: none;'
    + '  background: #f4f4f4; cursor: pointer; border-radius: 5px 5px 0 0;'
    + '  font: inherit; }'
    + '.tab.active { background: #fff; font-weight: 600; margin-bottom: -1px; }'
    + '.panes { flex: 1; min-height: 0; overflow: auto; padding: 10px 2px; }';

function defineComponents() {
    if (typeof customElements === 'undefined' || customElements.get('gnr-panel')) {
        return;
    }

    class GnrPanel extends HTMLElement {
        static get observedAttributes() { return ['caption']; }

        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = PANEL_CSS;
            root.appendChild(style);
            const wrap = document.createElement('div');
            wrap.className = 'p';
            this._hdr = document.createElement('div');
            this._hdr.className = 'hdr';
            const body = document.createElement('div');
            body.className = 'body';
            body.appendChild(document.createElement('slot'));   // the children
            wrap.appendChild(this._hdr);
            wrap.appendChild(body);
            root.appendChild(wrap);
        }

        connectedCallback() { this._hdr.textContent = this.getAttribute('caption') || ''; }

        attributeChangedCallback(name, _old, fresh) {
            if (name === 'caption') { this._hdr.textContent = fresh || ''; }
        }
    }

    class GnrBox extends HTMLElement {
        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = BOX_CSS;
            root.appendChild(style);
            const wrap = document.createElement('div');
            wrap.className = 'b';
            wrap.appendChild(document.createElement('slot'));
            root.appendChild(wrap);
        }
    }

    class GnrBorderContainer extends HTMLElement {
        static get observedAttributes() { return ['design']; }

        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = BORDER_CSS;
            root.appendChild(style);
            this._cells = {};
            for (const name of ['top', 'left', 'center', 'right', 'bottom']) {
                const cell = document.createElement('div');
                cell.className = `region ${name}`;
                cell.style.gridArea = name;
                const slot = document.createElement('slot');
                if (name !== 'center') { slot.name = name; }   // center = default slot
                cell.appendChild(slot);
                this._cells[name] = cell;
                root.appendChild(cell);
            }
        }

        connectedCallback() {
            this._applyDesign();
            this._setupSplitters();
        }

        attributeChangedCallback(name) {
            if (name === 'design') { this._applyDesign(); }
        }

        _applyDesign() {
            const d = this.getAttribute('design') || 'headline';
            this.style.gridTemplateAreas = BORDER_DESIGNS[d] || BORDER_DESIGNS.headline;
        }

        _regionChild(name) {
            return Array.from(this.children).find(
                (c) => c.getAttribute && c.getAttribute('slot') === name,
            ) || null;
        }

        // A region child marked `splitter` gets a drag bar on its inner edge:
        // left/right resize width, top/bottom resize height (of the cell).
        _setupSplitters() {
            const axis = { left: 'x', right: 'x', top: 'y', bottom: 'y' };
            for (const name of ['left', 'right', 'top', 'bottom']) {
                const child = this._regionChild(name);
                const cell = this._cells[name];
                if (!child || !child.hasAttribute('splitter') || cell._handled) {
                    continue;
                }
                cell._handled = true;
                const bar = document.createElement('div');
                bar.className = `handle ${axis[name]}`;
                if (name === 'left') { bar.style.right = '0'; }
                if (name === 'right') { bar.style.left = '0'; }
                if (name === 'top') { bar.style.bottom = '0'; }
                if (name === 'bottom') { bar.style.top = '0'; }
                cell.appendChild(bar);
                bar.addEventListener('mousedown', (down) => {
                    down.preventDefault();
                    const r = cell.getBoundingClientRect();
                    const move = (ev) => {
                        if (name === 'left') { cell.style.width = `${Math.max(40, ev.clientX - r.left)}px`; }
                        else if (name === 'right') { cell.style.width = `${Math.max(40, r.right - ev.clientX)}px`; }
                        else if (name === 'top') { cell.style.height = `${Math.max(30, ev.clientY - r.top)}px`; }
                        else { cell.style.height = `${Math.max(30, r.bottom - ev.clientY)}px`; }
                    };
                    const up = () => {
                        window.removeEventListener('mousemove', move);
                        window.removeEventListener('mouseup', up);
                    };
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                });
            }
        }
    }

    class GnrTab extends HTMLElement {
        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = ':host { display: block; }';
            root.appendChild(style);
            root.appendChild(document.createElement('slot'));   // the pane content
        }
    }

    class GnrTabContainer extends HTMLElement {
        static get observedAttributes() { return ['value']; }

        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = TABS_CSS;
            root.appendChild(style);
            this._bar = document.createElement('div');
            this._bar.className = 'tabbar';
            const panes = document.createElement('div');
            panes.className = 'panes';
            panes.appendChild(document.createElement('slot'));
            root.appendChild(this._bar);
            root.appendChild(panes);
            this._value = null;
        }

        connectedCallback() {
            if (this.hasAttribute('value')) { this._value = this.getAttribute('value'); }
            this._rebuild();
            // A tab added/removed reactively rebuilds the strip (browser only;
            // MutationObserver is absent in some headless test setups).
            if (typeof MutationObserver !== 'undefined') {
                this._obs = new MutationObserver(() => this._rebuild());
                this._obs.observe(this, { childList: true });
            }
        }

        disconnectedCallback() {
            if (this._obs) { this._obs.disconnect(); }
        }

        attributeChangedCallback(name, _old, fresh) {
            if (name === 'value') { this._value = fresh; this._apply(); }
        }

        // The kernel's delegated listener reads `el.value` on change.
        get value() { return this._value; }

        set value(v) { this._value = v; this._apply(); }

        _tabs() {
            return Array.from(this.children).filter(
                (c) => c.tagName && c.tagName.toLowerCase() === 'gnr-tab',
            );
        }

        _rebuild() {
            const tabs = this._tabs();
            if ((this._value == null || this._value === '') && tabs.length) {
                this._value = tabs[0].getAttribute('key');
            }
            this._bar.replaceChildren();
            for (const t of tabs) {
                const key = t.getAttribute('key');
                const btn = document.createElement('button');
                btn.className = 'tab';
                btn.dataset.key = key;
                btn.textContent = t.getAttribute('label') || key;
                btn.addEventListener('click', () => {
                    this._value = key;
                    // Same lane as an input: re-emit `change` composed so the
                    // delegated write-back writes the bound pointer.
                    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    this._apply();
                });
                this._bar.appendChild(btn);
            }
            this._apply();
        }

        _apply() {
            for (const btn of Array.from(this._bar.children)) {
                btn.classList.toggle('active', btn.dataset.key === this._value);
            }
            for (const t of this._tabs()) {
                t.style.display = t.getAttribute('key') === this._value ? '' : 'none';
            }
        }
    }

    customElements.define('gnr-panel', GnrPanel);
    customElements.define('gnr-box', GnrBox);
    customElements.define('gnr-bordercontainer', GnrBorderContainer);
    customElements.define('gnr-tab', GnrTab);
    customElements.define('gnr-tabcontainer', GnrTabContainer);
}

registerCollection('layout', { grammar: GRAMMAR, defineComponents });
