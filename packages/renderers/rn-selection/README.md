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

The core model (milestone 1), table & grapheme-safe selection, the native segment
contract (milestone 2, TS side), and the coordinator logic core (milestone 3) are
implemented and unit-tested. The pipeline from AST to copyable selection:

```ts
import {
  linearizeForSelection,
  resolveSelectionRange,
  serializeSelectionUnits,
} from '@supramark/rn-selection';

const units = linearizeForSelection(ast); // AST v2 -> flat selection-unit stream
const selected = resolveSelectionRange(units, range); // range -> covered units
const markdown = serializeSelectionUnits(selected, 'markdown'); // 'plainText' | 'markdown' | 'source' | 'html'
```

`unit.text` holds plain text only; Markdown syntax is reconstructed on
serialization, so plain-text and Markdown copies are both lossless. Full-table
selections copy as GFM table / TSV / HTML; partial table selections degrade to
clean tab-separated plain text. Partial slices never split emoji or combining
marks.

The coordinator layer (`SelectionRoot`, `useDocumentSelection`, registry /
hit-testing / selection state) and the `SelectableRichText` segment adapter are in
place as pure tested modules. The command bridge is wired both ways: native
long-press / menu-action events flow up into the selection store, and a committed
single-block range flows back down as a native `selectRange` (system handles +
menu); cross-block selection stays on the coordinator overlay. On-device gesture
verification is still pending — see the plan's Status section.

## Platform Requirements

- **New Architecture (Fabric) only.** The vendored primitive has no Paper/legacy
  path.
- **Android: React Native >= 0.85** (hard floor — the vendored component needs
  `ReactTextViewManager` / `TextLayoutManager` opened up in RN 0.85; earlier
  versions declare them `final`/`internal`).
- **iOS: upstream targets React Native >= 0.83;** this repo's example builds and
  runs it on 0.81.5 (New Arch, simulator-verified), so 0.81 works in practice but
  is not an upstream-supported floor.
- The package `peerDependencies` declare `react-native >= 0.81.0` — the lowest
  floor any platform supports (iOS, as verified in this repo's example). A single
  peer range cannot express the stricter Android floor, so the per-platform
  floors above stay authoritative: on Android the vendored component will not
  compile below 0.85 regardless of the peer range.

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
