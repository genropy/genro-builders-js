# Claude Code Instructions - genro-dom-js

**Parent Document**: This project follows all policies from the central [meta-genro-modules CLAUDE.md](https://github.com/softwellsrl/meta-genro-modules/blob/main/CLAUDE.md)

## Project-Specific Context

### Current Status
- Development Status: Alpha
- Has Implementation: Yes (builder core, HTML dialect, data + structural
  reactivity, write-back; runs in the browser)

### Project Description

JavaScript port of **genro-builders** — the builder system for genro-bag.
A builder owns a grammar and produces a **source Bag** (the "recipe"); a
renderer walks it and, in the browser, builds real DOM nodes; reactivity
turns data/structure changes into per-node DOM patches. Depends on
`genro-bag-js` (Bag/BagNode) and, for typed transport, `genro-tytx`.

## Architecture (mirrors the current Python genro-builders)

```
genro-dom-js/
  src/
    index.js            # public API exports
    source-bag.js       # SourceBag / SourceBagNode (on bag-js) + grammar Proxy
                        #   + data-binding surface (absDatapath, SET/GET/PUT/FIRE)
    builder-base.js     # BuilderBase: grammar, bagCall/commandOnNode/setChild,
                        #   runtimeValues, targetId, source reactivity, render/renderNodes
    builder-handler.js  # BuilderHandler: mount, pointerMap, live(), _optimizeRender, flush
    renderer/base.js    # RendererBase: the universal walk (render/renderChildren/
                        #   renderedItem/_handleMeta/adaptAttrs/finalize)
    target-wrapper.js   # TargetWrapper + DomTarget (full → DOM, partial → patches)
    application.js      # Application (the `genro` object): data + builder + write-back
    contrib/html/       # HtmlBuilder (grammar) + HtmlRenderer (→ DOM)
    pointer.js, utils.js  # pointer helpers (isPointer, parsePointer, scanForPointers)
  tests/                # node --test on jsdom (real DOM)
  examples/             # interactive pages (index.html + pages/ + page.html)
```

## Python / legacy reference

Sources of truth (read before porting):
- **Python** genro-builders: `../genro-builders/` — the behavior, names, grammar.
- **legacy gnrjs** (in `../genro-app-js/legacy/`) — the oracle for the
  renderer→DOM model (`gnrdomsource.js`) and the reactivity anti-echo
  (the `reason`/`doTrigger: sourceNode` pattern, `if (kw.reason != this)`).

### Public API (JS)

| Symbol | Purpose |
|--------|---------|
| `BuilderBase` | grammar (`@element`-shaped SCHEMA) + node creation + data binding + render |
| `SourceBag` / `SourceBagNode` | builder-aware Bag/BagNode on genro-bag-js |
| `BuilderHandler` | mounts builders, owns the datastore, drives create/render + reactivity |
| `RendererBase` | the universal walk; dialects override `renderedItem` |
| `TargetWrapper` / `DomTarget` | render destination (`full`/`partial`) |
| `HtmlBuilder` / `HtmlRenderer` | HTML dialect (grammar + DOM renderer) |
| `Application` | the `genro` object: data + builder + write-back (`mutate`) |
| `wrapSource` | Proxy wrapper enabling the fluent grammar dispatch |

## Key design principles

- **Recipe vs render**: a builder produces a source Bag (the recipe); the
  renderer builds the output. Two input channels coexist: a **native JS**
  page (a `Page extends HtmlBuilder` with `main`), or a **recipe imported**
  from Python (a serialized SourceBag). Renderer and reactivity are the same.
- **DIFF-PYTHON — DOM, not strings**: the Python `HtmlRenderer.rendered_item`
  emits a markup string; here `renderedItem` returns a DOM `Element`, and
  `finalize` composes a `DocumentFragment` (append, not `"".join`).
- **Reactivity**: data change → `replace`; structure change → `insert`/`remove`;
  write-back (DOM→data) carries the origin node as `reason` for the anti-echo.

## Porting Rules (CRITICAL)

Faithful, linear port of the Python (and, for renderer/reactivity, the legacy
gnrjs). Do not redesign, do not "improve", do not skip.

- **Same names/semantics**: Python `snake_case` → JS `camelCase` for methods;
  classes and grammar tags keep their names verbatim (`SourceBag`,
  `BuilderHandler`, `body/div/li`, `class_`…).
- **Same behavior**: if Python raises, JS throws; if it returns None, JS returns null.
- **Document intentional differences** with `// DIFF-PYTHON:` — only where a JS
  constraint forces it (no `**kwargs` → object params; `__getattr__` → `Proxy`;
  markup string → DOM node).
- **Tests trace to Python tests** where they exist (e.g. `test_abs_datapath.py`,
  `test_partial_render.py` are replicated); the full render is the oracle for
  partial patches (patched == fresh).

### JS adaptations (allowed)
- `Proxy` for the fluent grammar dispatch (Python `__getattribute__`/`__getattr__`).
- ESM imports; instance methods only (no `@staticmethod`/`@classmethod`).
- A real DOM in tests via **jsdom** (devDependency), no hand-written stubs.

### Not yet ported (later slices)
`@component`/iterate (row/cell/page patch ops), `${...}` templates,
`_present_value`/mask, dtype typing via TYTX, sub-builders, lazy iterate,
cascade formulas, density coalescing. Each is flagged in the code docstrings.

---

**All general policies are inherited from the parent document.**
