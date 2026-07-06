// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * layout containers — borderContainer + tabContainer/tab (web components,
 * ported from ws-web widgets/containers.py).
 *
 * borderContainer: a CSS-grid shell, children routed to named regions via
 * `slot` (center = default slot); a region child marked `splitter` gets a
 * drag bar. tabContainer: the SELECTION LIVES IN THE DATA (`value` pointer);
 * a click re-emits `change` composed and rides the SAME write-back as the
 * input widgets. The panes are slotted light-DOM (real, reactive) nodes.
 *
 * Assertions are on the observable outcome (region cells, slot routing,
 * pane visibility, the datum the click writes), never on internals.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../src/collections/layout.js';   // registers 'layout'
import '../src/collections/inputs.js';   // registers 'inputs' (textBox in panes)
import { setupDom } from './dom.js';
import { HtmlBuilder } from '../src/contrib/html/html-builder.js';
import { Application } from '../src/application.js';

/** Mount on an in-document host so the custom elements upgrade/connect. */
function mountApp(PageClass) {
    setupDom();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const genro = new Application(host, new PageClass('main'));   // eslint-disable-line no-new
    return { genro, host };
}

class BorderPage extends HtmlBuilder {
    static wc_requires = ['layout'];

    main(root) {
        const bc = root.borderContainer({ design: 'sidebar' });
        bc.div({ slot: 'top' }).span('H');
        bc.div({ slot: 'left', splitter: true, style: 'width:120px' }).span('menu');
        bc.div().span('center content');            // no slot → default (center)
        bc.div({ slot: 'bottom' }).span('F');
    }
}

test('borderContainer builds the five region cells and applies the design', () => {
    const { host } = mountApp(BorderPage);
    const bc = host.querySelector('gnr-bordercontainer');
    assert.ok(bc, 'the border container rendered');
    const regions = bc.shadowRoot.querySelectorAll('.region');
    assert.equal(regions.length, 5);                 // top/left/center/right/bottom
    // the design placed the grid areas on the host
    assert.ok(bc.style.gridTemplateAreas, 'grid-template-areas set from design');
});

test('borderContainer routes children to named regions; center is the default slot', () => {
    const { host } = mountApp(BorderPage);
    const bc = host.querySelector('gnr-bordercontainer');
    const slotOf = (txt) => Array.from(bc.children)
        .find((c) => c.textContent.includes(txt))
        .getAttribute('slot');
    assert.equal(slotOf('H'), 'top');
    assert.equal(slotOf('menu'), 'left');
    assert.equal(slotOf('F'), 'bottom');
    assert.equal(slotOf('center content'), null);    // unslotted → center
});

test('a region child marked splitter gets a drag handle; others do not', () => {
    const { host } = mountApp(BorderPage);
    const bc = host.querySelector('gnr-bordercontainer');
    assert.ok(bc.shadowRoot.querySelector('.region.left .handle'), 'left has a splitter');
    assert.equal(bc.shadowRoot.querySelector('.region.top .handle'), null,
        'top (no splitter attr) has none');
});

class TabPage extends HtmlBuilder {
    static wc_requires = ['layout', 'inputs'];

    setup() {
        this.setData('ui.tab', 'one');
        this.setData('f.a', 'AAA');
        this.setData('f.b', 'BBB');
    }

    main(root) {
        const tc = root.tabContainer({ value: '^ui.tab' });
        tc.tab({ label: 'One', key: 'one' }).textBox({ value: '^f.a' });
        tc.tab({ label: 'Two', key: 'two' }).textBox({ value: '^f.b' });
        root.div({ class_: 'selbox' }).span('^ui.tab');   // independent reader of the selection
    }
}

const paneVis = (host) => Object.fromEntries(
    Array.from(host.querySelectorAll('gnr-tab'))
        .map((t) => [t.getAttribute('key'), t.style.display === 'none' ? 'hidden' : 'shown']),
);

test('tabContainer shows the selected pane; the strip has one button per tab', () => {
    const { host } = mountApp(TabPage);
    const tc = host.querySelector('gnr-tabcontainer');
    assert.equal(tc.shadowRoot.querySelectorAll('.tab').length, 2);
    assert.deepEqual(paneVis(host), { one: 'shown', two: 'hidden' });
});

test('selection is data-driven: changing the pointer switches the pane', () => {
    const { genro, host } = mountApp(TabPage);
    genro.live(() => genro.data.setItem('main.ui.tab', 'two'));
    assert.deepEqual(paneVis(host), { one: 'hidden', two: 'shown' });
    // the independent reader of ^ui.tab reflects it too
    assert.equal(host.querySelector('.selbox').textContent, 'two');
});

test('a tab click writes the bound pointer (write-back, no data-set-pointer)', () => {
    const { genro, host } = mountApp(TabPage);
    const tc = host.querySelector('gnr-tabcontainer');
    tc.shadowRoot.querySelector('.tab[data-key="two"]').click();
    assert.equal(genro.data.getItem('main.ui.tab'), 'two');   // the click mutated the datum
    assert.deepEqual(paneVis(host), { one: 'hidden', two: 'shown' });
});
