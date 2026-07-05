// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Browser shim for Node's `module` builtin. genro-tytx imports
// `createRequire` at module top level, then uses the returned `require`
// inside try/catch to probe optional native codecs (@msgpack, big.js).
// Here `require` always throws, so those probes fall back cleanly and
// the browser never needs those Node-only packages.
export function createRequire() {
    return () => {
        throw new Error('require() is not available in the browser');
    };
}
