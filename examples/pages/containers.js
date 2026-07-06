// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// The three flavours of reusable structure side by side:
//  - @container (call-time): real HTML source, fillable handle
//  - container web component (slot): encapsulated custom element with children
//  - widget web components inside a container, with live write-back
import { HtmlBuilder } from 'genro-dom-js';
import '../../src/collections/layout.js';        // panel, box
import '../../src/collections/inputs.js';         // textBox, dateTextBox…

export const title = 'Container — @container (call-time) + web component (slot)';

export class Page extends HtmlBuilder {
    static wc_requires = ['layout', 'inputs'];

    static containers = ['card'];

    setup() {
        this.setData('f.name', 'Mario');
        this.setData('f.date', '2026-07-05');
    }

    // @container: runs now, writes real source, returns a fillable handle.
    card(pane, title) {
        const c = pane.div({ class_: 'card', style: 'border:1px solid #4a90d9;border-radius:6px;padding:10px;margin:8px 0' });
        c.h3(title);
        return c;
    }

    main(root) {
        const c = root.card('@container (call-time) — nodi HTML reali');
        c.p('Il body gira ora e scrive source; l\'handle è riempibile.', { class_: 'note' });

        const p = root.panel({ caption: 'Panel — web component con <slot>' });
        p.p('I figli finiscono nello slot del custom element; il write-back funziona.', { class_: 'note' });
        p.textBox({ value: '^f.name', lbl: 'Nome', updateOn: 'input' });
        p.dateTextBox({ value: '^f.date', lbl: 'Data', updateOn: 'input' });

        const b = root.box();
        b.span('Riflesso live → nome: ').span('^f.name');
        b.span(' · data: ').span('^f.date');
    }
}
