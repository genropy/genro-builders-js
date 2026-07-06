// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Typed widgets as web components, plugged with `wc_requires`. Each tag
// projects to a native custom element (<gnr-datetextbox> …); value rides
// the pointer, the write-back + updateOn are the same as for a plain input.
import { HtmlBuilder } from 'genro-dom-js';
import '../../src/collections/inputs.js';        // registers 'inputs'
import '../../src/collections/colorpicker.js';   // registers 'colorpicker'

export const title = 'Widgets — web component (wc_requires)';

export class Page extends HtmlBuilder {
    static wc_requires = ['inputs', 'colorpicker'];

    setup() {
        this.setData('form.date', '2026-07-05');
        this.setData('form.qty', 3);
        this.setData('form.color', '#3498db');
    }

    main(root) {
        const d = root.div({ datapath: 'form', node_id: 'form' });
        d.h3('Widget tipizzati (web component) — wc_requires: inputs, colorpicker');
        d.dateTextBox({ value: '^.date', lbl: 'Data', updateOn: 'input' });
        d.numberTextBox({ value: '^.qty', lbl: 'Quantità', updateOn: 'input' });
        d.colorpicker({ value: '^.color' });
        d.p('Riflesso live dei dati:', { class_: 'note' });
        d.div().span('date = ').span('^.date');
        d.div().span('qty = ').span('^.qty');
        d.div().span('color = ').span('^.color');
    }
}
