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
 *   panel — a framed box with an optional `caption` header.
 *   box   — a plain framed box.
 */
import { registerCollection, webcomponent } from '../collections.js';

const GRAMMAR = {
    elements: {
        panel: webcomponent('panel', { subTags: '*' }),
        box: webcomponent('box', { subTags: '*' }),
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

    customElements.define('gnr-panel', GnrPanel);
    customElements.define('gnr-box', GnrBox);
}

registerCollection('layout', { grammar: GRAMMAR, defineComponents });
