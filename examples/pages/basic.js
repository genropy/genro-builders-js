// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// A reactive page: data seeded in setup(), read via ^pointer in main().
// The parallel of wspages/basics/basic.py — one class per file.
import { HtmlBuilder } from 'genro-dom-js';

export const title = 'Basic — data binding (^pointer)';

export class Page extends HtmlBuilder {
    setup() {
        this.setData('page.title', 'Titolo iniziale');
        this.setData('page.message', 'Questo testo arriva dal datastore.');
    }

    main(root) {
        const pane = root.div({ datapath: 'page', node_id: 'page' });
        pane.h1('^.title');
        pane.p('^.message', { class_: 'note' });
    }
}
