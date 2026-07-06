// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Structural reactivity: a list whose items are added/removed at runtime,
// each mutation emitting an insert/remove patch (not a full re-render).
import { HtmlBuilder } from 'genro-dom-js';

export const title = 'List — structural insert/remove';

export class Page extends HtmlBuilder {
    setup() {
        this.setData('page.title', 'Lista reattiva');
    }

    main(root) {
        const pane = root.div({ datapath: 'page', node_id: 'page' });
        pane.h1('^.title');
        pane.p('Struttura reattiva: insert/remove come patch parziali.', { class_: 'note' });
        const ul = pane.ul({ node_id: 'list' });
        ul.li('alpha');
        ul.li('beta');
    }
}
