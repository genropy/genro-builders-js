# genro-builders-js

JavaScript port of [genro-builders](https://github.com/softwellsrl/genro-builders) — Builder/Compiler system for Bag hierarchies.

## Status

**Development Status: Pre-Alpha** — Documentation and planning only. No implementation code yet.

## Overview

genro-builders-js provides the Builder/Compiler/Expander system for constructing and compiling Bag-based hierarchical structures in JavaScript.

This is the JS counterpart of the Python `genro-builders` package, which was extracted from `genro-bag` to separate the core data container from the domain-specific construction logic.

### Key Concepts

- **BagBuilderBase** — Abstract base for defining custom builders with element validation
- **BagCompilerBase** — Abstract base for compiling Bag structures into output (DOM, HTML, etc.)
- **BuilderBag / BuilderBagNode** — Bag subclasses with fluent builder API
- **ComponentResolver** — Dynamic component resolution at compile-time
- **Pointer System** — `^path` references for data binding
- **Decorators** — `@element`, `@component`, `@compileHandler` for declarative configuration

### Architecture

```
Python Server                    JavaScript Browser
---------------------------------------------------------
BagBuilderBase (Python)          BagBuilderBase (JS)
    |                                |
    v                                v
bag.toXml() ---- HTTP ---->     Bag.fromXml()
                                     |
                                     v
                                BagCompilerBase (JS)
                                     |
                                     v
                                DOM / Widgets
```

## Dependencies

- `genro-bag-js` — Core Bag data container

## Reference

- Python genro-builders: `genro-builders>=0.3.1`
- Python API: `BagBuilderBase`, `BagCompilerBase`, `BuilderBag`, `BuilderBagNode`, `ComponentResolver`, `BindingManager`

## License

Apache License 2.0 — See [LICENSE](LICENSE) for details.

Copyright 2025 Softwell S.r.l.
