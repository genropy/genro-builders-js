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
 *  ancestor-cover) then flushes each touched builder via `renderNodes`.
 *
 * Not-yet-ported (later slices): formula/controller cascade, component
 * rules, lazy iterate, density coalescing, row/cell netting.
 */
import { Bag } from 'genro-bag-js';

/** A formula re-queued more than this many times in one flush is a
 *  livelock (a → b → a): the drain raises, naming the func. */
const FORMULA_REQUEUE_LIMIT = 50;

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
                this.addRenderPath(name, rel);
            }
        }
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

    /** Reduce queued entries to the minimal set: per-key netting + ancestor
     *  cover. (Row/cell netting and density coalescing: later slices.) */
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
        const wholePaths = new Set(
            [...state.keys()].filter((k) => meta.get(k).label === null).map((k) => meta.get(k).path),
        );
        const out = [];
        for (const [key, kind] of state) {
            const { path, label } = meta.get(key);
            // an ancestor whole-node entry renders its final subtree
            if ([...wholePaths].some((other) => other !== path && path.startsWith(`${other}.`))) {
                continue;
            }
            if (kind === 'del+ins') {
                out.push({ kind: 'del', path, label, field: null });
                out.push({ kind: 'ins', path, label, field: null });
            } else {
                out.push({ kind, path, label, field: null });
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
