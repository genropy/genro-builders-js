// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// @component + iterate: the body expands once per collection child, each
// block anchored to its row (datapath = anchor + node_label). Mutating the
// collection (add / remove / change a field) refreshes the blocks — the
// component's anchor subscription catches mutations no reader declared.
import { HtmlBuilder } from 'genro-builders-js';

export const title = 'Iterate — @component su una collezione';

let counter = 3;

export class Page extends HtmlBuilder {
    static components = ['stateRow'];

    stateRow(root, { node_label }) {
        const row = root.div({
            datapath: `.${node_label}`, class_: 'wcell',
            style: 'flex-direction:row;align-items:center;gap:10px',
        });
        row.span('^.name', { style: 'font-weight:600;min-width:140px' });
        row.span('^.capital', { class_: 'note' });
    }

    setup() {
        this.setData('states.QLD.name', 'Queensland');
        this.setData('states.QLD.capital', 'Brisbane');
        this.setData('states.VIC.name', 'Victoria');
        this.setData('states.VIC.capital', 'Melbourne');
        this.setData('states.NSW.name', 'New South Wales');
        this.setData('states.NSW.capital', 'Sydney');
    }

    main(root) {
        root.h3('Una riga per elemento della collezione ^states');
        const list = root.div({ node_id: 'list', class_: 'wgallery',
            style: 'flex-direction:column' });
        list.stateRow({ iterate: '^states' });
    }
}

/** Buttons: mutate the collection from outside (add / drop / rename). */
export function activate(genro) {
    const bar = document.createElement('div');
    bar.style.marginTop = '10px';
    const btn = (label, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.marginRight = '6px';
        b.addEventListener('click', fn);
        bar.appendChild(b);
    };
    btn('aggiungi stato', () => genro.live(() => {
        counter += 1;
        genro.data.setItem(`main.states.S${counter}.name`, `Stato ${counter}`);
        genro.data.setItem(`main.states.S${counter}.capital`, `Capitale ${counter}`);
    }));
    btn('rimuovi primo', () => genro.live(() => {
        const first = genro.data.getItem('main.states').getNodes()[0];
        if (first) { genro.data.pop(`main.states.${first.label}`); }
    }));
    btn('QLD → maiuscolo', () => genro.live(() => {
        genro.data.setItem('main.states.QLD.capital', 'BRISBANE');
    }));
    genro.target.root.appendChild(bar);
}
