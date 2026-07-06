// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Gallery: every widget of the plugged collections, laid out in a flex
// grid. Each cell = title + widget (value/checked bound to a datum) + a
// live reader of that datum. Shows the whole family + write-back at once.
import { HtmlBuilder } from 'genro-builders-js';
import '../../src/collections/inputs.js';
import '../../src/collections/colorpicker.js';

export const title = 'Gallery — tutti i widget (flex grid)';

export class Page extends HtmlBuilder {
    static wc_requires = ['inputs', 'colorpicker'];

    setup() {
        this.setData('f.text', 'Mario');
        this.setData('f.pwd', 'secret');
        this.setData('f.num', 42);
        this.setData('f.date', '2026-07-05');
        this.setData('f.time', '09:30');
        this.setData('f.range', 60);
        this.setData('f.flag', true);
        this.setData('f.color', '#e74c3c');
    }

    main(root) {
        const grid = root.div({ datapath: 'f', node_id: 'f', class_: 'wgallery' });

        const cell = (name) => {
            const c = grid.div({ class_: 'wcell' });
            c.div(name, { class_: 'wcell-title' });
            return c;
        };
        const reader = (c, dp) => c.div({ class_: 'wcell-val' }).span('= ').span(dp);

        let c;
        c = cell('textBox'); c.textBox({ value: '^.text', updateOn: 'input' }); reader(c, '^.text');
        c = cell('passwordbox'); c.passwordbox({ value: '^.pwd', updateOn: 'input' }); reader(c, '^.pwd');
        c = cell('numberTextBox'); c.numberTextBox({ value: '^.num', updateOn: 'input' }); reader(c, '^.num');
        c = cell('dateTextBox'); c.dateTextBox({ value: '^.date', updateOn: 'input' }); reader(c, '^.date');
        c = cell('timeTextBox'); c.timeTextBox({ value: '^.time', updateOn: 'input' }); reader(c, '^.time');
        c = cell('horizontalSlider'); c.horizontalSlider({ value: '^.range', updateOn: 'input' }); reader(c, '^.range');
        c = cell('checkbox'); c.checkbox({ checked: '^.flag', label: 'Attivo' }); reader(c, '^.flag');
        c = cell('colorpicker'); c.colorpicker({ value: '^.color', updateOn: 'input' }); reader(c, '^.color');
    }
}
