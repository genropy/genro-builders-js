// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * BuilderBase — JS port of builder/base.py + _grammar.py.
 *
 * A builder owns a grammar (`SCHEMA`, in the `builder_grammar` shape)
 * and a `source` SourceBag. The fluent API lands through the source
 * Proxy: `root.body()` → `bagCall`, `node.h1('x')` → `commandOnNode`,
 * both converging on `setChild`.
 *
 * The source lives under the structural `SOURCE_ROOT` segment of a
 * wrapper root (`_sourceroot`): `source` is the payload `main` builds,
 * `_sourceroot` the wrapper carried for the tree-not-forest guarantee
 * and for source reactivity (the subscribe hangs off the wrapper).
 *
 * Data binding: `runtimeValues(node)` resolves `^`/`=` pointers from
 * `handler.data`, registering `^` readers in the pointer_map.
 * Structural reactivity: when reactive, `_sourceroot` is subscribed to
 * `_onSourceEvent`, which keeps the pointer_map coherent (mapkeep) and
 * queues the touched path with its kind (ins/del/upd). `render` does a
 * full render; `renderNodes` turns a live batch into per-node patches
 * (`replace`/`insert`/`remove`).
 *
 * Not-yet-ported (later slices): ${...} templates, _present_value /
 * mask, data-elements, @component expansion + row/cell/page patch ops,
 * cardinality validation, sub-builder.
 */
import { SourceBag, wrapSource, VALUE } from './source-bag.js';

/** Structural segment that carries the payload source (tree-not-forest). */
export const SOURCE_ROOT = '_root_';

export class BuilderBase {
    constructor(name = null) {
        this.name = name || this.constructor._name;
        this.handler = null;
        this.data = null;
        this.target = null;
        this._targetSerial = 0;
        this._writebackMap = {};   // derived id → expansion node (later slice)
        this._sourceroot = new SourceBag(null, this, null);
        // Backref first, so the SOURCE_ROOT sub-bag inherits it on insert
        // (bag-js propagates backref to children at insert time).
        this._sourceroot.setBackref();
        this._sourceroot.setItem(SOURCE_ROOT, new SourceBag(null, this, null));
        this.source = this._sourceroot.getItem(SOURCE_ROOT);
    }

    // --- grammar -----------------------------------------------------

    /** Build `_classSchema` from a `builder_grammar` doc, merging the
     *  parent's (the mixin/inheritance chain). Called in a subclass
     *  `static {}` block — the JS equivalent of Python `__init_subclass__`.
     *  DIFF-PYTHON: @element/@abstract are data here (the grammar object),
     *  not decorated methods; @component/@container are registered
     *  separately (they carry a body). */
    static defineGrammar(doc) {
        const parent = Object.getPrototypeOf(this);
        this._classSchema = { ...(parent._classSchema || {}), ...doc.elements };
        this._abstracts = { ...(parent._abstracts || {}), ...(doc.abstracts || {}) };
        this._tagNames = null;
    }

    get schema() {
        return this.constructor._classSchema || {};
    }

    get schemaTagNames() {
        let map = this.constructor._tagNames;
        if (!map) {
            map = {};
            for (const tag of Object.keys(this.schema)) {
                map[tag.toLowerCase()] = tag;
            }
            this.constructor._tagNames = map;
        }
        return map;
    }

    schemaTag(name) {
        const lookup = name.toLowerCase();
        const direct = this.schemaTagNames[lookup];
        if (direct) {
            return direct;
        }
        const prefix = `${this.constructor._name}_`;
        if (lookup.startsWith(prefix)) {
            return this.schemaTagNames[lookup.slice(prefix.length)] || null;
        }
        return null;
    }

    // --- node creation (the fluent API converges here) ---------------

    bagCall(bag, tag, value, attrs) {
        return this.setChild(bag, tag, value, attrs);
    }

    commandOnNode(node, tag, value, attrs) {
        if (!(node.value instanceof SourceBag)) {
            node.value = new SourceBag(null, node.builder || this, this.handler);
        }
        return this.setChild(node.value, tag, value, attrs);
    }

    setChild(bag, tag, value, attrs) {
        const attributes = { ...attrs };
        const info = this.schema[tag] || {};
        if (info._meta && !('_meta' in attributes)) {
            attributes._meta = info._meta;
        }
        if (info.ns && !('ns' in attributes)) {
            attributes.ns = info.ns;
        }
        const nodePosition = attributes.node_position;
        delete attributes.node_position;
        const label = this._autoLabel(bag, tag);
        const node = bag.setItem(label, value, attributes, nodePosition || '>');
        node.nodeTag = tag;
        node._builder = this;
        return node;
    }

    _autoLabel(bag, tag) {
        let n = 0;
        while (bag.node(`${tag}_${n}`) !== null && bag.node(`${tag}_${n}`) !== undefined) {
            n += 1;
        }
        return `${tag}_${n}`;
    }

    /** Source node carrying `nodeId` (per-builder id namespace), wrapped
     *  so the grammar dispatch (`.li(...)`) works, like Python's __getattr__. */
    nodeById(nodeId) {
        const node = this.source.getNodeByAttr('node_id', nodeId);
        if (node === null || node === undefined) {
            throw new Error(`node_id not found: ${nodeId}`);
        }
        return wrapSource(node);
    }

    // --- data binding ------------------------------------------------

    /** Resolve the pointers/values a node carries → [runtimeValue, runtimeAttrs]. */
    runtimeValues(node) {
        const resolved = new Map();
        for (const [k, v] of node.runtimeToEvaluate()) {
            const ptype = node.pointerType(v);
            if (!ptype) {
                resolved.set(k, v);
                continue;
            }
            const absPath = node.absDatapath(v);
            const value = this.handler.data.getItem(absPath);
            if (ptype === '^' && node.handler !== null && node.handler !== undefined) {
                this.handler._registerPath(node, absPath);
            }
            resolved.set(k, value);
        }
        const runtimeValue = resolved.get(VALUE);
        resolved.delete(VALUE);
        return [runtimeValue, Object.fromEntries(resolved)];
    }

    /** Source node whose serial is `targetId` (the upstream half of the
     *  identity bridge: patches go down by serial, mutations come up the
     *  same way). Walk-based like nodeById. */
    nodeByTargetId(targetId) {
        const queue = [this.source];
        while (queue.length) {
            for (const node of queue.shift().getNodes()) {
                if (node._targetId === targetId) {
                    return node;
                }
                if (node.value instanceof SourceBag) {
                    queue.push(node.value);
                }
            }
        }
        throw new Error(`target_id not found: ${targetId}`);
    }

    /** Per-document serial bridging a source node to its DOM element. */
    targetId(node) {
        if (node._targetId) {
            return node._targetId;
        }
        if (node.handler === null || node.handler === undefined) {
            return null;
        }
        const root = node.rootBuilder;
        root._targetSerial += 1;
        node._targetId = `n${root._targetSerial}`;
        return node._targetId;
    }

    /** Shortcut for `this.data.setItem(path, value)`. */
    setData(path, value) {
        this.data.setItem(path, value);
    }

    // --- source reactivity (structure) -------------------------------

    /** True when mounted on a handler that has an application. */
    get _isReactive() {
        return Boolean(this.handler && this.handler.application);
    }

    /** Dispatcher for events on this builder's `_sourceroot`.
     *  Keeps the pointer_map coherent (mapkeep), then queues the touched
     *  path + kind: ins/del address the CHILD (insert/remove), upd the
     *  node itself (replace). */
    _onSourceEvent(node, evt, pathlist, kw = {}) {
        if (evt === 'del') {
            this.handler._unregisterPointer(node);
        } else if (evt !== 'ins') {
            const detail = evt.startsWith('upd_') ? evt.slice(4) : evt;
            if (detail === 'value' || detail === 'value_attr') {
                this._onUpdValue(node, kw.oldvalue);
            }
            if (detail === 'attrs' || detail === 'value_attr') {
                this._onUpdAttrs(node, kw.attrs_diff || {});
            }
        }
        // Queue key = mount name; drop the leading SOURCE_ROOT segment.
        const path = pathlist.slice(1).join('.');
        if ((evt === 'ins' || evt === 'del') && !node._getMeta('component')) {
            const childPath = path ? `${path}.${node.label}` : node.label;
            if (evt === 'del') {
                this.handler.recordRemovedId(this.name, childPath, node._targetId || null);
            }
            this.handler.addRenderPath(this.name, childPath, evt);
        } else {
            this.handler.addRenderPath(this.name, path, 'upd');
        }
    }

    _valueNature(v) {
        if (v instanceof SourceBag) {
            return 'bag';
        }
        if (typeof v === 'string' && v.startsWith('^')) {
            return 'pointer';
        }
        return 'scalar';
    }

    /** De-register the old value's pointers across an upd_value event. */
    _onUpdValue(node, oldvalue) {
        const oldKind = this._valueNature(oldvalue);
        if (oldKind === 'pointer') {
            this.handler._updatePointerMap(node, [['', oldvalue]]);
        } else if (oldKind === 'bag') {
            for (const oldChild of oldvalue.getNodes()) {
                this.handler._unregisterPointer(oldChild);
            }
        }
    }

    /** De-register old attr-pointers across an upd_attrs event. */
    _onUpdAttrs(node, attrsDiff) {
        for (const [attrname, change] of Object.entries(attrsDiff)) {
            const oldV = change.old;
            if (typeof oldV === 'string' && oldV.startsWith('^')) {
                this.handler._updatePointerMap(node, [[attrname, oldV]]);
            }
        }
    }

    // --- lifecycle ---------------------------------------------------

    setup(_data) {}

    main(_root) {
        throw new Error(
            `${this.constructor.name}.main() not implemented: a bare builder `
            + 'is grammar, not a renderable page',
        );
    }

    /** setup → main → (if reactive) arm source reactivity. */
    create() {
        this.setup(this.data);
        this.main(wrapSource(this.source));
        if (this._isReactive) {
            this._sourceroot.subscribe('builder_source', {
                insert: (e) => this._onSourceEvent(e.node, e.evt, e.pathlist, e),
                update: (e) => this._onSourceEvent(e.node, e.evt, e.pathlist, e),
                delete: (e) => this._onSourceEvent(e.node, e.evt, e.pathlist, e),
            });
        }
    }

    _renderer() {
        const mode = this.constructor._defaultRenderMode;
        return this[`renderer_${mode}`];
    }

    setRenderTarget(target) {
        this.target = target;
    }

    /** Full render: renderer walks `source`, finalize delivers to target. */
    render(opts = {}) {
        const renderer = this._renderer();
        renderer.handler = this.handler;
        const target = 'target' in opts ? (opts.target || null) : this.target;
        const o = { ...(target && target.renderOpts), ...opts };
        delete o.target;
        const source = renderer.preprocess(this.source);
        const result = renderer.renderChildren(source, o);
        return renderer.finalize(result, target, o);
    }

    /** Turn a live batch (optimized entries) into per-node patches. */
    renderNodes(entries, target = null, opts = {}) {
        const renderer = this._renderer();
        renderer.handler = this.handler;
        const effTarget = target || this.target;
        if (!(effTarget && effTarget.acceptsPartial)) {
            return this.render(opts);
        }
        const o = { ...effTarget.renderOpts, ...opts };

        // Build the plan (op, path, node); component/row/cell not yet ported.
        const plan = [];
        for (const { kind, path } of entries) {
            if (kind === 'del') {
                plan.push(['remove', path, null]);
                continue;
            }
            const node = this.source.getNode(path);
            if (node === null || node === undefined) {
                throw new Error(`queued render path ${path} is no longer in the source`);
            }
            if (node._getMeta('component')) {
                throw new Error('component patch ops not yet ported');
            }
            plan.push([kind === 'ins' ? 'insert' : 'replace', path, node]);
        }

        // Dedup + ancestor-cover: a replace at P covers any op under P.
        const seen = new Set();
        const deduped = [];
        for (const [op, path, node] of plan) {
            const key = `${op}|${path}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            deduped.push([op, path, node]);
        }
        const replacePaths = deduped.filter(([op]) => op === 'replace').map(([, p]) => p);
        const covered = deduped.filter(([, path]) => !replacePaths.some(
            (other) => other !== path && path.startsWith(`${other}.`),
        ));

        const patches = [];
        covered.forEach(([op, path, node], position) => {
            if (op === 'remove') {
                const targetId = this.handler.removedTargetId(this.name, path);
                if (targetId === null || targetId === undefined) {
                    return;   // never rendered with identity: nothing in the DOM
                }
                patches.push({ id: targetId, op: 'remove' });
                return;
            }
            if (op === 'insert') {
                const pending = new Set(
                    covered.slice(position + 1).filter(([o]) => o === 'insert').map(([, p]) => p),
                );
                const [before] = this._insertAnchor(node, pending);
                const fragment = renderer.render(node, o);
                if (fragment === null) {
                    return;
                }
                const container = node.parentBag.parentNode;
                const containerId = path.includes('.') ? this.targetId(container) : null;
                patches.push({ id: containerId, op: 'insert', before, node: fragment });
                return;
            }
            const fragment = renderer.render(node, o);
            if (fragment === null) {
                return;
            }
            patches.push({ id: this.targetId(node), op: 'replace', node: fragment });
        });
        effTarget.partial(patches);
        return null;
    }

    /** Anchor for an insert: [beforeId, componentSibling]. beforeId is the
     *  target_id of the first following sibling present when the patch
     *  applies; null = append. */
    _insertAnchor(node, pending) {
        const siblings = node.parentBag.getNodes();
        const index = siblings.indexOf(node);
        for (const sib of siblings.slice(index + 1)) {
            if (sib._getMeta('data_element')) {
                continue;
            }
            if (sib._getMeta('component')) {
                return [null, true];
            }
            if (pending.has(this.source.relativePath(sib))) {
                continue;
            }
            return [this.targetId(sib), false];
        }
        return [null, false];
    }
}
