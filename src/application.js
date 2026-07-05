// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Application — the `genro` object: the world↔handler layer.
 *
 * Counterpart of Python's `ExampleApp`/`WsApplication`, standalone in
 * the browser. Owns the handler, the mounted builder, the DOM target,
 * and exposes the citizens the page works with: `data`, `builder`,
 * `root` (Proxy-wrapped source for interactive commands).
 *
 * Write-back (DOM→data): a value-bound element, when it changes, writes
 * the datum it is bound to. `mutate(elementId, value)` is the linear
 * port of ws-web `WsApplication.mutate`: resolve the node by identity
 * (writeback map or serial), derive destination+value from the node's
 * own attributes (never a path from the client), write inside `live()`.
 * `_enableInput` wires a delegated `input` listener on the DOM target.
 *
 * Not-yet-ported (later slices): dtype typing via TYTX (`_typedValue`
 * returns the raw string), the `data-set-pointer`/`data-fire-pointer`
 * shapes, and the client-side anti-echo (the input that reads itself
 * re-renders on its own write — the focus-preservation policy is still
 * open, see the reactivity roadmap).
 */
import { BuilderHandler } from './builder-handler.js';
import { DomTarget } from './target-wrapper.js';
import { wrapSource } from './source-bag.js';

export class Application {
    /**
     * @param {Element} rootElement host element for the render.
     * @param {BuilderBase} builder a builder instance (its class defines main).
     */
    constructor(rootElement, builder) {
        this.handler = new BuilderHandler(this);
        this.builder = builder;
        this.target = new DomTarget(rootElement);
        this.builder.setRenderTarget(this.target);
        this.handler.addBuilder(this.builder);   // create(): setup + main
        this.handler.activate();                  // first render → DOM
        this._enableInput();
    }

    get data() {
        return this.handler.data;
    }

    get root() {
        return wrapSource(this.builder.source);
    }

    render() {
        this.handler.render();
    }

    live(fn) {
        this.handler.live(fn);
    }

    // --- write-back (DOM → data) -------------------------------------

    /** Apply a data mutation addressed by element identity. */
    mutate(elementId, value) {
        this._applyMutation(this._mutationNode(elementId), value);
    }

    /** Write from an already-resolved node. The origin node rides as the
     *  write's `reason` (legacy `doTrigger: sourceNode`): the reactive
     *  flush skips the reader that is the origin, so the input that wrote
     *  does not re-render on its own change (anti-echo, `kw.reason != this`). */
    _applyMutation(node, value) {
        const [path, typed, fired] = this._mutationWrite(node, value);
        // bag-js setItem(path, value, attr, nodePosition, updattr,
        // removeNullAttributes, reason, fired) — reason = the origin node.
        this.handler.live(() => {
            this.handler.data.setItem(path, typed, null, '>', false, true, node, fired);
        });
    }

    /** Resolve the element identity to its server-side node. */
    _mutationNode(elementId) {
        if (!elementId) {
            throw new Error('mutation without an element id');
        }
        const wmap = this.builder._writebackMap || {};
        if (wmap[elementId]) {
            return wmap[elementId];
        }
        return this.builder.nodeByTargetId(elementId);
    }

    /** Derive [path, typedValue, fired] from the node's own attributes.
     *  Value pointer and checked pointer are ported; the data-set/
     *  data-fire shapes are a later slice. */
    _mutationWrite(node, raw) {
        const attr = node.getAttr() || {};
        if (node.pointerType(attr.value)) {
            return [node.absDatapath(attr.value), this._typedValue(raw, attr.dtype), false];
        }
        if (node.pointerType(attr.checked)) {
            return [node.absDatapath(attr.checked), raw, false];
        }
        throw new Error(
            `mutation target ${attr.id || node.nodeTag} is not writable`,
        );
    }

    /** Convert a client string to the node's dtype. Text stays text;
     *  full TYTX typing is a later slice (returns raw for now). */
    _typedValue(value, dtype) {
        if (value === null || typeof value !== 'string') {
            return value;
        }
        if (!dtype || dtype === 'A' || dtype === 'T') {
            return value;
        }
        if (value === '') {
            return null;
        }
        return value;   // TODO(later): rawDecode(`${value}::${dtype}`)
    }

    /** Wire delegated input listeners on the DOM target (client side).
     *  A value-bound element writes on the event its `updateOn` selects:
     *  `blur` (default → the native `change` event, fired on focus loss /
     *  tab / click-out) or `input` (live, per keystroke). */
    _enableInput() {
        const root = this.target && this.target.root;
        if (!root || !root.addEventListener) {
            return;
        }
        const handle = (e) => {
            const el = e.target;
            if (!el.id || !(el.hasAttribute && el.hasAttribute('data-value-pointer'))) {
                return;
            }
            let node;
            try {
                node = this._mutationNode(el.id);
            } catch {
                return;
            }
            const updateOn = node.getAttr('updateOn') || 'blur';
            const wantEvent = updateOn === 'input' ? 'input' : 'change';
            if (e.type === wantEvent) {
                this._applyMutation(node, el.value);
            }
        };
        root.addEventListener('input', handle);
        root.addEventListener('change', handle);
    }
}
