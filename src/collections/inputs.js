// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * inputs — text-like input widgets as web components (JS port of ws-web
 * resources/components/inputs). One shared base `GnrInput` (shadow-DOM
 * <input>) + one type per tag; checkbox is the special citizen (`checked`).
 *
 * Contract: a `value` property + composed bubbling `input` events. Shadow
 * retargeting makes the HOST the event target, so the kernel's delegated
 * listener (Application._enableInput) sees one element with id + value.
 * Anti-echo at the widget too: a focused inner input is sovereign — an
 * incoming value never overwrites what the user is typing.
 *
 * A page plugs this family with `wc_requires = ['inputs']`. The custom
 * elements are defined lazily (in defineComponents), so importing this
 * module needs no DOM.
 */
import { registerCollection, webcomponent } from '../collections.js';

const GRAMMAR = {
    elements: {
        textBox: webcomponent('textBox'),
        passwordbox: webcomponent('passwordbox'),
        numberTextBox: webcomponent('numberTextBox'),
        dateTextBox: webcomponent('dateTextBox'),
        timeTextBox: webcomponent('timeTextBox'),
        horizontalSlider: webcomponent('horizontalSlider'),
        checkbox: webcomponent('checkbox'),
    },
};

const CSS =
    ':host { display: inline-block; }'
    + '.labledBox { display: flex; gap: 4px; }'
    + '.labledBox_left { flex-direction: row; align-items: center; }'
    + '.labledBox_right { flex-direction: row-reverse; align-items: center; }'
    + '.labledBox_top { flex-direction: column; align-items: stretch; }'
    + '.labledBox_bottom { flex-direction: column-reverse; align-items: stretch; }'
    + '.labledBox_label { color: var(--gnrfieldlabel-color, #555);'
    + '  font-size: var(--form-label-font-size, 0.85em);'
    + '  font-weight: var(--formlet-label-font-weight, 600); white-space: nowrap; }'
    + '.labledBox_label:empty { display: none; }'
    + '.labledBox_content { flex: 1; min-width: 0; }'
    + 'input { font: inherit; box-sizing: border-box; width: 100%;'
    + '  background: var(--field-bg, #fff); border: 1px solid var(--field-border, #c8c8c8);'
    + '  border-radius: var(--form-field-radius, 3px); padding: 2px 5px; }'
    + 'input:focus { outline: none; border-color: var(--field-focus-border, #4a90d9); }'
    + '.gnr-checkbox-content { display: flex; align-items: center; gap: 6px; }'
    + '.gnr-checkbox-content input { width: auto; flex: none; }';

function defineComponents() {
    if (typeof customElements === 'undefined' || customElements.get('gnr-textbox')) {
        return;
    }

    class GnrInput extends HTMLElement {
        static get observedAttributes() {
            return ['value', 'placeholder', 'lbl', 'side', 'disabled', 'readonly'];
        }

        get inputType() { return 'text'; }

        _configure(_input) {}

        _buildContent(content) { content.appendChild(this._input); }

        constructor() {
            super();
            const root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = CSS;
            root.appendChild(style);

            this._box = document.createElement('div');
            this._box.className = 'labledBox labledBox_left';
            this._label = document.createElement('label');
            this._label.className = 'labledBox_label';
            this._label.htmlFor = 'f';
            this._content = document.createElement('div');
            this._content.className = 'labledBox_content';
            this._input = document.createElement('input');
            this._input.id = 'f';
            this._input.type = this.inputType;
            this._configure(this._input);
            this._buildContent(this._content);

            // `input` is composed and crosses the shadow on its own; `change`
            // is NOT composed, so re-emit it on the host so `updateOn:'blur'`
            // and the checkbox reach the kernel's delegated listener.
            this._input.addEventListener('change', () => {
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            });

            this._box.appendChild(this._label);
            this._box.appendChild(this._content);
            root.appendChild(this._box);
        }

        connectedCallback() {
            if (this.hasAttribute('value')) { this._input.value = this.getAttribute('value'); }
            if (this.hasAttribute('placeholder')) {
                this._input.placeholder = this.getAttribute('placeholder');
            }
            this._applyLbl();
            this._applySide();
            this._input.disabled = this.hasAttribute('disabled');
            this._input.readOnly = this.hasAttribute('readonly');
        }

        attributeChangedCallback(name, _old, fresh) {
            if (name === 'value') {
                // Focused inner input is sovereign: never overwrite typing.
                const focused = this.shadowRoot && this.shadowRoot.activeElement === this._input;
                if (!focused && this._input.value !== fresh) {
                    this._input.value = fresh == null ? '' : fresh;
                }
            } else if (name === 'placeholder') {
                this._input.placeholder = fresh == null ? '' : fresh;
            } else if (name === 'lbl') {
                this._applyLbl();
            } else if (name === 'side') {
                this._applySide();
            } else if (name === 'disabled') {
                this._input.disabled = fresh !== null;
            } else if (name === 'readonly') {
                this._input.readOnly = fresh !== null;
            }
        }

        _applyLbl() { this._label.textContent = this.getAttribute('lbl') || ''; }

        _applySide() {
            let side = this.getAttribute('side');
            if (!side) {
                const anc = this.closest('[data-label-side]');
                side = anc ? anc.getAttribute('data-label-side') : 'left';
            }
            this._box.className = `labledBox labledBox_${side}`;
        }

        get value() { return this._input.value; }

        set value(v) { this._input.value = v; }
    }

    class GnrTextBox extends GnrInput { get inputType() { return 'text'; } }
    class GnrPasswordbox extends GnrInput { get inputType() { return 'password'; } }
    class GnrNumberTextBox extends GnrInput { get inputType() { return 'number'; } }
    class GnrDateTextBox extends GnrInput { get inputType() { return 'date'; } }
    class GnrTimeTextBox extends GnrInput { get inputType() { return 'time'; } }
    class GnrHorizontalSlider extends GnrInput { get inputType() { return 'range'; } }

    class GnrCheckbox extends GnrInput {
        static get observedAttributes() {
            return ['checked', 'lbl', 'side', 'disabled', 'label'];
        }

        get inputType() { return 'checkbox'; }

        get type() { return 'checkbox'; }   // kernel reads el.checked

        _buildContent(content) {
            content.classList.add('gnr-checkbox-content');
            content.appendChild(this._input);
            this._caption = document.createElement('label');
            this._caption.htmlFor = 'f';
            this._caption.className = 'gnr-checkbox-caption';
            content.appendChild(this._caption);
        }

        connectedCallback() {
            this._applyLbl();
            this._applySide();
            this._input.disabled = this.hasAttribute('disabled');
            this._input.checked = GnrCheckbox.truthy(this.getAttribute('checked'));
            this._caption.textContent = this.getAttribute('label') || '';
        }

        attributeChangedCallback(name, _old, fresh) {
            if (name === 'checked') {
                const focused = this.shadowRoot && this.shadowRoot.activeElement === this._input;
                if (!focused) { this._input.checked = GnrCheckbox.truthy(fresh); }
            } else if (name === 'label') {
                if (this._caption) { this._caption.textContent = fresh || ''; }
            } else {
                super.attributeChangedCallback(name, _old, fresh);
            }
        }

        static truthy(v) {
            return v != null && v !== 'false' && v !== 'False' && v !== '0' && v !== 'None';
        }

        get checked() { return this._input.checked; }

        set checked(v) { this._input.checked = !!v; }
    }

    customElements.define('gnr-textbox', GnrTextBox);
    customElements.define('gnr-passwordbox', GnrPasswordbox);
    customElements.define('gnr-numbertextbox', GnrNumberTextBox);
    customElements.define('gnr-datetextbox', GnrDateTextBox);
    customElements.define('gnr-timetextbox', GnrTimeTextBox);
    customElements.define('gnr-horizontalslider', GnrHorizontalSlider);
    customElements.define('gnr-checkbox', GnrCheckbox);
}

registerCollection('inputs', { grammar: GRAMMAR, defineComponents });
