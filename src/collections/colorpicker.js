// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * colorpicker — a composite web-component widget (JS port of ws-web
 * resources/components/colorpicker). Same native contract as the inputs:
 * a `value` property + composed bubbling `input` events, shadow-DOM
 * <input type=color>. Plugged with `wc_requires = ['colorpicker']`.
 */
import { registerCollection, webcomponent } from '../collections.js';

const GRAMMAR = { elements: { colorpicker: webcomponent('colorpicker') } };

function defineComponents() {
    if (typeof customElements === 'undefined' || customElements.get('gnr-colorpicker')) {
        return;
    }

    class GnrColorpicker extends HTMLElement {
        static get observedAttributes() { return ['value']; }

        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = ':host { display: inline-block; }';
            root.appendChild(style);
            this._input = document.createElement('input');
            this._input.type = 'color';
            root.appendChild(this._input);
        }

        connectedCallback() {
            if (this.hasAttribute('value')) { this._input.value = this.getAttribute('value'); }
        }

        attributeChangedCallback(name, _old, fresh) {
            if (name === 'value') {
                const focused = this.shadowRoot && this.shadowRoot.activeElement === this._input;
                if (!focused && fresh != null) { this._input.value = fresh; }
            }
        }

        get value() { return this._input.value; }

        set value(v) { this._input.value = v; }
    }

    customElements.define('gnr-colorpicker', GnrColorpicker);
}

registerCollection('colorpicker', { grammar: GRAMMAR, defineComponents });
