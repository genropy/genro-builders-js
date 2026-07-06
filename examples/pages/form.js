// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Write-back with the updateOn option:
//  - default 'blur': writes when the field loses focus (tab / click-out);
//  - 'input': writes live, on each keystroke (search-as-you-type).
// Each input carries the origin as the write's reason → it does not
// re-render on its own change (anti-echo): focus/cursor survive.
import { HtmlBuilder } from 'genro-dom-js';

export const title = 'Form — write-back + updateOn (blur / input)';

export class Page extends HtmlBuilder {
    setup() {
        this.setData('form.name', '');
        this.setData('form.search', '');
    }

    main(root) {
        const d = root.div({ datapath: 'form', node_id: 'form' });

        d.h3('updateOn: "blur" (default) — scrive quando esci dal campo');
        d.input({ value: '^.name' });
        d.p('name = ', { class_: 'note' }).span('^.name');

        d.h3('updateOn: "input" — scrive a ogni tasto (live)');
        d.input({ value: '^.search', updateOn: 'input' });
        d.p('search = ', { class_: 'note' }).span('^.search');
    }
}
