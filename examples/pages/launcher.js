// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Launcher: a page bar + a tabContainer. Click a page → open a tab whose
// content is that page served in an iframe (page.html?name=...).
//
// The structure (bar, tabs, panels, iframes) is built with the builder;
// opening a tab is an `insert` (structural reactivity). The tab SELECTION
// is UI state → it lives in the client: a small controller in activate()
// toggles panel visibility directly on the DOM (the data-widget pattern).
import { HtmlBuilder } from 'genro-dom-js';

export const title = 'Launcher — tabs con pagine in iframe';

// Pages that can be opened as tabs (not the launcher itself).
const SERVABLE = ['basic', 'list'];

export class Page extends HtmlBuilder {
    main(root) {
        const app = root.div({ node_id: 'launcher' });
        app.h3('Pagine — click per aprire in un tab');
        const bar = app.nav({ class_: 'pagebar' });
        SERVABLE.forEach((name) => bar.button(name, { 'data-page': name }));
        const tabs = app.div({ class_: 'tabs' });
        tabs.div({ class_: 'tabbar', node_id: 'tabbar' });
        tabs.div({ class_: 'tabpanels', node_id: 'tabpanels' });
    }
}

/** Client-side tabContainer controller (UI state lives here). */
export function activate(genro, page) {
    const root = genro.target.root;
    const openTabs = {};      // page name → tab id
    let counter = 0;

    function selectTab(tabId) {
        root.querySelectorAll('.panel').forEach((p) => {
            p.style.display = p.getAttribute('data-tab') === tabId ? '' : 'none';
        });
        root.querySelectorAll('.tab').forEach((t) => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
        });
    }

    function openTab(name) {
        let tabId = openTabs[name];
        if (!tabId) {
            counter += 1;
            tabId = String(counter);
            openTabs[name] = tabId;
            genro.live(() => {
                page.nodeById('tabbar').button(name, { 'data-tab': tabId, class_: 'tab' });
                page.nodeById('tabpanels')
                    .div({ 'data-tab': tabId, class_: 'panel' })
                    .iframe({ src: `page.html?name=${name}`, class_: 'frame' });
            });
        }
        selectTab(tabId);
    }

    root.addEventListener('click', (e) => {
        const pageBtn = e.target.closest('[data-page]');
        if (pageBtn) { openTab(pageBtn.getAttribute('data-page')); return; }
        const tab = e.target.closest('.tab[data-tab]');
        if (tab) { selectTab(tab.getAttribute('data-tab')); }
    });
}
