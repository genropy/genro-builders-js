# genro-dom-js

A JavaScript UI library where **the page is data, not code**.

You describe a page through a fluent, validated grammar; the result is not
DOM and not a component tree — it is a **Bag**: a plain, serializable,
hierarchical data structure (the "recipe"). A renderer walks the recipe and
builds real DOM. A reactive engine keeps the DOM alive: every change in the
datastore becomes a surgical patch on exactly the DOM nodes bound to it —
no virtual DOM, no re-render, no diffing.

genro-dom-js is the JavaScript counterpart of the Python
[genro-builders](https://github.com/softwellsrl/genro-builders) package.
Because the recipe is data, the *same* page can be authored in JS in the
browser or generated in Python on the server, serialized, and rendered by
this library — the renderer and the reactivity engine cannot tell the
difference.

## Status

**Alpha** — the core is implemented and tested (builder grammar, HTML and
SVG dialects, data + structural reactivity, two-way write-back, components
with per-row patching, layout containers, pluggable web-component widget
collections). The API may still change.

## A taste

```js
import { HtmlBuilder, Application } from 'genro-dom-js';

class Page extends HtmlBuilder {
    setup() {
        this.setData('form.name', 'World');
    }

    main(root) {
        const pane = root.div({ datapath: 'form' });
        pane.h1('Hello ').span('^.name');          // reads the datum, live
        pane.input({ value: '^.name' });           // writes it back on blur
    }
}

const genro = new Application(document.getElementById('root'), new Page('main'));
```

Type in the input, leave the field: the `<h1>` updates. Only that one text
node is touched. Change the datum from anywhere else —

```js
genro.live(() => genro.data.setItem('main.form.name', 'Genro'));
```

— and both the heading and the input reflect it.

## Core concepts

### Builder and grammar
A builder (e.g. `HtmlBuilder`) owns a **grammar**: the set of legal tags,
their attributes, and their nesting rules (full HTML5 and SVG grammars ship
in `contrib/`). Calls like `root.div(...)` are validated against the
grammar and append nodes to the **source Bag** — the recipe.

### Datastore and pointers
Data lives in a hierarchical datastore (a Bag). A node binds to it with a
**pointer**: `'^form.name'` means "render this datum and update me when it
changes". `datapath` on a container sets the base for the relative pointers
(`'^.name'`) of everything inside — bindings inherit down the tree.

### Reactivity: patches, not re-renders
There is no render loop to re-run. A data write inside `live()` is looked
up in the pointer map; only the bound nodes are re-rendered, and structural
changes (a node added/removed in the source) become `insert`/`remove`
patches. Inputs write back to the datastore (`updateOn: 'blur'` or
`'input'`), carrying their origin so they don't re-render on their own
change (anti-echo: focus and cursor survive).

### Components and iterate
A component is a named method that describes a block; `iterate` expands it
once per child of a collection, each block anchored to its row:

```js
class Page extends HtmlBuilder {
    static components = ['stateRow'];

    stateRow(root, { node_label }) {
        const row = root.div({ datapath: `.${node_label}` });
        row.span('^.name');
        row.span('^.capital');
    }

    main(root) {
        root.div().stateRow({ iterate: '^states' });
    }
}
```

Adding, removing or mutating a row in `^states` patches only the affected
row — down to the single cell.

### Data-elements: logic in the recipe
`dataSetter` seeds a value, `dataFormula` computes one (and recomputes when
an input changes), `dataController` runs side effects:

```js
body.dataFormula({
    destination: '.area', func: 'calcArea',
    base: '^.base', altezza: '^.altezza', _on_start: true,
});
```

### Extending the grammar
Two flavours of reusable structure:
- **`@container`** methods — run at call time, write real source nodes,
  return a fillable handle (`root.card('Title')`).
- **Web-component collections** — widget sets (`inputs`, `layout`,
  `colorpicker`) plugged in with `static wc_requires = ['inputs']`; their
  tags (`dateTextBox`, `panel`, `borderContainer`, `tabContainer`…) join
  the grammar and render as custom elements, with the same pointer binding
  and write-back as native tags.

## Running the examples

No build step — the library is plain ES modules. From the directory that
contains `genro-dom-js` and its sibling `genro-bag-js`:

```sh
python3 -m http.server 8010
# then open http://localhost:8010/genro-dom-js/examples/index.html
```

## Tests

```sh
npm install
npm test        # node --test on jsdom (real DOM)
```

## Dependencies

- [genro-bag-js](https://github.com/softwellsrl/genro-bag-js) — the Bag
  data container (the recipe, the datastore, and the event system).

## Coming from React or Vue?

- [genro-dom-js for React developers](docs/for-react-developers.md)
- [genro-dom-js for Vue developers](docs/for-vue-developers.md)

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

Copyright 2025 Softwell S.r.l.
