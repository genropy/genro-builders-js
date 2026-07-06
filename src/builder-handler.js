// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * BuilderHandler — JS port of builder/data_handler.py (reactive).
 *
 * Mounts builders, owns the segmented datastore `_dataroot`
 * (`{_: shared, <name>: ...}`) and drives create/render.
 *
 * Reactivity has two sources of events:
 * - DATA: `activate` subscribes `_onDataEvent` to `_dataroot`; a data
 *   change → `_relevantNodes` (pointer_map lookup) → `addRenderPath`.
 * - STRUCTURE: each builder subscribes its own `_sourceroot` (in
 *   `create`) to `_onSourceEvent`, which does mapkeep and calls
 *   `addRenderPath` with kind ins/del/upd.
 * The outermost `live()` exit runs `_optimizeRender` (netting +
 *  ancestor-cover + density coalescing) then flushes each touched
 *  builder via `renderNodes`.
 *
 * Not-yet-ported (later slices): component rules (per-row data-elements)
 * and lazy iterate. The row/cell classification (`_expansionRow`) is
 * here; the fine DOM patch application lands in `renderNodes` (patch ops).
 */
import { Bag } from 'genro-bag-js';

/** A formula re-queued more than this many times in one flush is a
 *  livelock (a → b → a): the drain raises, naming the func. */
const FORMULA_REQUEUE_LIMIT = 50;

/** Above this many touched rows of ONE component in a single flush, the
 *  per-row patches coalesce into the enclosing-container replace (the
 *  structural flood case). Cell patches never coalesce: value-only ops
 *  are what a shared-binding broadcast wants to ship. */
const ROW_COALESCE_LIMIT = 50;

/** Above this many touched CELLS of one row in a single flush, the cell
 *  patches collapse into that row's replace (one fragment beats
 *  re-reading and shipping most of the row field by field). */
const CELLS_PER_ROW_LIMIT = 4;

export class BuilderHandler {
    constructor(application = null) {
        this.builders = {};
        this.defaultBuilderName = null;
        this.application = application;
        this._dataroot = new Bag();
        this._dataroot.setItem('_', new Bag());   // shared/common segment
        this._dataroot.setBackref();
        this.pointerMap = new Map();
        this._liveEnabled = false;
        this._liveDepth = 0;
        this._nodesToRender = {};
        this._liveTarget = null;
        // Deleted nodes' target_ids captured at the delete event.
        this._removedTargetIds = new Map();
        // Formula cascade: FIFO queue drained at the live() flush.
        this._formulaQueue = [];
        this._pendingFormulas = new Set();
    }

    get data() {
        return this._dataroot;
    }

    /** Mount builders under their own `name` and create each. */
    addBuilder(...builders) {
        for (const instance of builders) {
            const name = instance.name;
            if (!name) {
                throw new Error('builder has no name');
            }
            if (name === '_') {
                throw new Error("'_' is reserved for the shared segment");
            }
            if (name in this.builders) {
                throw new Error(`duplicate builder name '${name}'`);
            }
            if (this.defaultBuilderName === null) {
                this.defaultBuilderName = name;
            }
            this.builders[name] = instance;
            this._dataroot.setItem(name, new Bag());
            instance.handler = this;
            instance.data = this._dataroot.getItem(name);
            instance._sourceroot._handler = this;   // handler set before create()
            instance.create();
        }
    }

    source(name = null) {
        return this.builders[name || this.defaultBuilderName].source;
    }

    /** Finish startup: render every builder (populates pointer_map), then
     *  arm DATA reactivity (source reactivity is armed per-builder in create). */
    activate() {
        for (const instance of Object.values(this.builders)) {
            instance.render();
        }
        if (this.application) {
            this._dataroot.subscribe('builder_data', {
                insert: (e) => this._onDataEvent(e),
                update: (e) => this._onDataEvent(e),
                delete: (e) => this._onDataEvent(e),
            });
            this._liveEnabled = true;
        }
    }

    render() {
        for (const instance of Object.values(this.builders)) {
            instance.render();
        }
    }

    // --- pointer_map maintenance -------------------------------------

    _registerPath(node, absPath) {
        if (!this.application) {
            return;
        }
        if (!this.pointerMap.has(absPath)) {
            this.pointerMap.set(absPath, new Set());
        }
        this.pointerMap.get(absPath).add(node);
    }

    /** Drop `node` (and its subtree) from the pointer_map. */
    _unregisterPointer(node) {
        this._updatePointerMap(node, node.pointers());
        if (node.value instanceof Bag) {
            for (const child of node.value.getNodes()) {
                this._unregisterPointer(child);
            }
        }
    }

    /** Remove `pointers` of `node` from the pointer_map. */
    _updatePointerMap(node, pointers) {
        for (const [attrname, pointer] of pointers) {
            let path = node.absDatapath(pointer);
            if (attrname) {
                path = `${path}?${attrname}`;
            }
            const inner = this.pointerMap.get(path);
            if (inner) {
                inner.delete(node);
                if (inner.size === 0) {
                    this.pointerMap.delete(path);
                }
            }
        }
    }

    // --- removed-id capture ------------------------------------------

    /** Capture a deleted node's target_id for the flush (first delete wins). */
    recordRemovedId(builderName, path, targetId) {
        if (!this._liveDepth) {
            return;
        }
        const key = `${builderName}|${path}`;
        if (!this._removedTargetIds.has(key)) {
            this._removedTargetIds.set(key, targetId);
        }
    }

    removedTargetId(builderName, path) {
        return this._removedTargetIds.get(`${builderName}|${path}`);
    }

    // --- data reactivity ---------------------------------------------

    _relevantNodes(path) {
        const grouped = new Map();
        const seen = new Set();
        for (const [key, inner] of this.pointerMap) {
            const kp = key.split('?')[0];
            let kind;
            if (kp === path) {
                kind = 'node';
            } else if (kp.startsWith(`${path}.`)) {
                kind = 'container';
            } else if (path.startsWith(`${kp}.`)) {
                kind = 'child';
            } else {
                continue;
            }
            for (const node of inner) {
                if (seen.has(node)) {
                    continue;
                }
                seen.add(node);
                const builder = node.builder;
                if (!grouped.has(builder)) {
                    grouped.set(builder, []);
                }
                grouped.get(builder).push([kind, node]);
            }
        }
        return grouped;
    }

    // --- formula cascade ---------------------------------------------

    /** Recompute the data-element readers, delegating to each builder.
     *  Inside a live section formulas do NOT compute: they queue (dedup
     *  on the node) for the flush drain; controllers/setters stay
     *  synchronous. Plain view readers are skipped (they only re-render). */
    executeLogic(relevant) {
        for (const [builder, items] of relevant) {
            for (const [, node] of items) {
                if (!node._getMeta('data_element')) {
                    continue;
                }
                if (node.nodeTag === 'dataFormula' && this._liveDepth) {
                    this._enqueueFormula(node, builder);
                } else {
                    builder.computeLogic([node]);
                }
            }
        }
    }

    /** Queue one formula, deduped on the node (a pending key does not
     *  queue twice; it will read the settled inputs when it drains). */
    _enqueueFormula(node, builder) {
        if (this._pendingFormulas.has(node)) {
            return;
        }
        this._pendingFormulas.add(node);
        this._formulaQueue.push([node, builder]);
    }

    /** Drain the queued formulas FIFO until dry. Their writes re-enter the
     *  cascade (formulas re-queue, controllers run at once). A key draining
     *  more than FORMULA_REQUEUE_LIMIT times is a livelock → explicit error. */
    _drainFormulas() {
        const counts = new Map();
        while (this._formulaQueue.length) {
            const [node, builder] = this._formulaQueue.shift();
            this._pendingFormulas.delete(node);
            const n = (counts.get(node) || 0) + 1;
            counts.set(node, n);
            if (n > FORMULA_REQUEUE_LIMIT) {
                throw new Error(
                    `formula livelock: '${node.getAttr('func')}' re-queued more `
                    + `than ${FORMULA_REQUEUE_LIMIT} times in one flush`,
                );
            }
            builder.computeLogic([node]);
        }
    }

    _onDataEvent(e) {
        const { node, evt, pathlist, reason } = e;
        if (reason === 'autocreate') {
            return;
        }
        const path = (evt === 'ins' || evt === 'del')
            ? [...pathlist, node.label].join('.')
            : pathlist.join('.');
        const relevant = this._relevantNodes(path);
        // Recompute the data-element readers first (their writes re-enter
        // here and cascade); then queue the view readers for the render.
        this.executeLogic(relevant);
        for (const [, items] of relevant) {
            for (const [, viewNode] of items) {
                // Anti-echo (legacy gnrdomsource `if (kw.reason != this)`):
                // the node that originated the write does not re-render.
                if (viewNode === reason) {
                    continue;
                }
                const name = viewNode.rootBuilderName;
                const rel = viewNode.rootBuilder.source.relativePath(viewNode);
                // An iterate-component reader classifies PER ROW (path
                // arithmetic); every other reader re-renders whole (upd).
                const row = this._expansionRow(viewNode, path, evt);
                if (row !== null) {
                    const [rowKind, label, field] = row;
                    this.addRenderPath(name, rel, rowKind, label, field);
                } else {
                    this.addRenderPath(name, rel);
                }
            }
        }
    }

    /** Classify a data event against an iterate component (CMP.7).
     *
     *  When the reader is an iterate component and the mutated path falls
     *  under its anchor, the path arithmetic names the row: the residual's
     *  first segment is the row label. The kind says what happened — the
     *  row born (`row_ins`), dead (`row_del`), replaced wholesale
     *  (`row_upd`), or ONE of its leaves changed (`cell_upd`, the residual
     *  rest as `field`). Returns null for every other reader (including
     *  the collection node itself replaced wholesale: the whole block
     *  re-renders). */
    _expansionRow(viewNode, path, evt) {
        if (!viewNode._getMeta('component')) {
            return null;
        }
        const iterate = viewNode.getAttr('iterate');
        if (iterate === null || iterate === undefined) {
            return null;
        }
        const anchor = viewNode.absDatapath(iterate);
        if (!path.startsWith(`${anchor}.`)) {
            return null;
        }
        const residual = path.slice(anchor.length + 1);
        const dot = residual.indexOf('.');
        const label = dot === -1 ? residual : residual.slice(0, dot);
        const rest = dot === -1 ? '' : residual.slice(dot + 1);
        if (rest) {
            return ['cell_upd', label, rest];
        }
        if (evt === 'ins') {
            return ['row_ins', label, null];
        }
        if (evt === 'del') {
            return ['row_del', label, null];
        }
        return ['row_upd', label, null];
    }

    // --- render queue + optimizer + flush ----------------------------

    /** Record a touched path + kind for the end-of-live render. */
    addRenderPath(builderName, path, kind = 'upd', label = null, field = null) {
        if (!this._liveDepth) {
            return;
        }
        if (!this._nodesToRender[builderName]) {
            this._nodesToRender[builderName] = [];
        }
        this._nodesToRender[builderName].push({ kind, path, label, field });
    }

    /** Reduce the queued entries to the minimal set.
     *
     *  Per-key netting first (key = path|label|field — a plain node or ONE
     *  row/cell of an iterate component): the section's history collapses
     *  to its net effect (the flush renders the FINAL source state).
     *
     *  Then the reductions: exact dedup (the netting map), ancestor covers
     *  descendant (a whole-node entry covers its rows and cells, a row
     *  entry covers its cells), and density coalescing — too many cells of
     *  ONE row collapse into that row's replace, then a structural flood
     *  of rows collapses into the enclosing-container replace. Cell entries
     *  never count in the row flood: value-only ops are what a broadcast
     *  wants to ship. */
    _optimizeRender(entries) {
        const state = new Map();   // key `${path}|${label}|${field}` → base kind
        const meta = new Map();    // key → {path, label, field}
        for (const { kind, path, label, field } of entries) {
            const key = `${path}|${label}|${field}`;
            meta.set(key, { path, label, field });
            const base = kind.replace(/^row_/, '').replace(/^cell_/, '');
            const prev = state.get(key);
            if (prev === undefined) {
                state.set(key, base);
            } else if (base === 'upd') {
                if (prev === 'del') {
                    throw new Error(`update queued for ${key} after its delete`);
                }
                // upd / ins / del+ins all render fresh at flush: absorbed.
            } else if (base === 'ins') {
                if (prev !== 'del') {
                    throw new Error(`insert queued for ${key} over a live node`);
                }
                state.set(key, 'del+ins');
            } else if (base === 'del') {
                if (prev === 'ins') {
                    state.delete(key);          // ephemeral: net nothing
                } else if (prev === 'del') {
                    throw new Error(`delete queued for ${key} after its delete`);
                } else {
                    state.set(key, 'del');
                }
            }
        }
        const wholePaths = new Set();
        const rowKeys = new Set();
        for (const key of state.keys()) {
            const { path, label, field } = meta.get(key);
            if (label === null) {
                wholePaths.add(path);
            } else if (field === null) {
                rowKeys.add(`${path}|${label}`);
            }
        }
        let kept = [];
        for (const [key, kind] of state) {
            const { path, label, field } = meta.get(key);
            // an ancestor whole-node entry renders its final subtree
            if ([...wholePaths].some((other) => other !== path && path.startsWith(`${other}.`))) {
                continue;
            }
            // the component's own entry covers its rows and cells
            if (label !== null && wholePaths.has(path)) {
                continue;
            }
            // the row's own entry covers its cells
            if (field !== null && rowKeys.has(`${path}|${label}`)) {
                continue;
            }
            kept.push({ kind, path, label, field });
        }
        // Density, cells first: too many cells of ONE row collapse into
        // that row's replace.
        const cellLoad = new Map();
        for (const { path, label, field } of kept) {
            if (field !== null) {
                const k = `${path}|${label}`;
                cellLoad.set(k, (cellLoad.get(k) || 0) + 1);
            }
        }
        const fullRows = new Set(
            [...cellLoad].filter(([, c]) => c > CELLS_PER_ROW_LIMIT).map(([k]) => k),
        );
        if (fullRows.size) {
            kept = kept.filter(
                ({ path, label, field }) => !(field !== null && fullRows.has(`${path}|${label}`)),
            );
            for (const k of fullRows) {
                const [path, label] = k.split('|');
                kept.push({ kind: 'upd', path, label, field: null });
            }
        }
        // ...then rows: a structural flood coalesces into the container
        // replace. CELL entries never count here.
        const rowLoad = new Map();
        for (const { kind, path, label, field } of kept) {
            if (label !== null && field === null && kind !== 'page') {
                rowLoad.set(path, (rowLoad.get(path) || 0) + 1);
            }
        }
        const coalesced = new Set(
            [...rowLoad].filter(([, c]) => c > ROW_COALESCE_LIMIT).map(([p]) => p),
        );
        const out = [];
        for (const path of coalesced) {
            out.push({ kind: 'upd', path, label: null, field: null });
        }
        for (const { kind, path, label, field } of kept) {
            if (label !== null && coalesced.has(path)) {
                continue;          // the container replace covers them all
            }
            if (kind === 'del+ins') {
                const row = label !== null ? 'row_' : '';
                out.push({ kind: `${row}del`, path, label, field: null });
                out.push({ kind: `${row}ins`, path, label, field: null });
            } else if (kind === 'page') {
                out.push({ kind: 'page', path, label, field: null });
            } else if (field !== null) {
                out.push({ kind: 'cell_upd', path, label, field });
            } else if (label !== null) {
                out.push({ kind: `row_${kind}`, path, label, field: null });
            } else {
                out.push({ kind, path, label: null, field: null });
            }
        }
        return out;
    }

    /** The mutation critical section: batch, optimize, flush per-node patches. */
    live(fn, target = null) {
        if (!this._liveEnabled) {
            throw new Error(
                'live() requires an activated handler with an application: '
                + 'without them nothing is subscribed, nothing would react',
            );
        }
        if (this._liveDepth && target !== null) {
            throw new Error('a nested live() section cannot set a target');
        }
        this._liveDepth += 1;
        if (this._liveDepth === 1) {
            this._nodesToRender = {};
            this._removedTargetIds = new Map();
            this._formulaQueue = [];
            this._pendingFormulas = new Set();
            this._liveTarget = target;
        }
        try {
            fn();
        } finally {
            if (this._liveDepth === 1) {
                try {
                    // Drain with depth still 1, so the formulas' writes queue
                    // their render paths and re-queue further formulas.
                    this._drainFormulas();
                } finally {
                    this._liveDepth -= 1;
                    try {
                        for (const [name, entries] of Object.entries(this._nodesToRender)) {
                            if (entries.length) {
                                this.builders[name].renderNodes(
                                    this._optimizeRender(entries), this._liveTarget,
                                );
                            }
                        }
                    } finally {
                        this._nodesToRender = {};
                        this._removedTargetIds = new Map();
                        this._formulaQueue = [];
                        this._pendingFormulas = new Set();
                        this._liveTarget = null;
                    }
                }
            } else {
                this._liveDepth -= 1;
            }
        }
    }
}
