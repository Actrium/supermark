# @supramark/rn-selection

Document-level selection system for Supramark on React Native.

This package owns the Supramark selection model. Native text controls are treated as
primitives, not as the full document model. The first primitive is vendored from
`boomsi/selectable-library` under `native/selectable-rich-text` so the original work
and license remain visible while Supramark can evolve it in the same PR branch.

## Direction

- Keep Supramark AST v2 as the source of truth.
- Linearize selectable AST content into text, breaks, atoms, and boundaries.
- Let features provide custom payloads for nodes such as diagrams, math, tables,
  code blocks, and containers.
- Use native text primitives for local text selection where they help.
- Use a Supramark-owned coordinator for cross-block selection, overlay, handles,
  copy menus, and payload serialization.

See [SELECTION_PLAN.md](./SELECTION_PLAN.md) for the full target architecture and
execution plan.

## Status

Milestone 1 (core model) is implemented as pure TypeScript — no native/RN runtime
dependency yet. The exported API turns an AST into a copyable selection:

```ts
import {
  linearizeForSelection,
  resolveSelectionRange,
  serializeSelectionUnits,
} from '@supramark/rn-selection';

const units = linearizeForSelection(ast); // AST v2 -> flat selection-unit stream
const selected = resolveSelectionRange(units, range); // range -> covered units
const markdown = serializeSelectionUnits(selected, 'markdown'); // 'plainText' | 'markdown' | 'source'
```

`unit.text` holds plain text only; Markdown syntax is reconstructed on
serialization, so plain-text and Markdown copies are both lossless. Tables,
SVG/PNG payloads, and native cross-block selection are deferred — see the plan.

## Native Primitive Boundary

`native/selectable-rich-text` is the starting native text segment implementation.
It should stay below the selection coordinator:

- good fit: paragraph, heading, simple list, code text segments;
- not the owner of: AST ranges, diagram/math/table payloads, cross-block overlay.

## Milestones

1. Selection model and AST linearization.
2. RN registry, hit testing, overlay, and handle coordinator.
3. Feature selection providers for code, math, diagrams, tables, and containers.
4. Copy actions for text, Markdown, source, SVG, PNG, and HTML.
