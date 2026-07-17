# Supramark RN Selection Plan

## Goal

Build a Supramark-owned document selection system for React Native.

The long-term target is not only selectable text. The system should let users
select across Markdown content and copy feature-aware payloads from both text and
non-text nodes:

- text blocks: plain text, Markdown, source ranges;
- code blocks: raw code, fenced Markdown, highlighted HTML;
- tables: TSV, Markdown table, HTML table;
- math: TeX, SVG, PNG;
- diagrams: source, fenced Markdown, SVG, PNG;
- containers: feature-defined text, links, metadata, or custom payloads.

## Design Principles

- Supramark AST v2 is the source of truth.
- Selection ranges belong to Supramark, not to a single native text view.
- Native text controls are primitives for local text selection only.
- Feature packages can define their own selection and copy behavior.
- Renderers must not directly import diagram/math engines; payload generation
  should reuse `@supramark/engines` and feature-level contracts.
- The default `@supramark/rn` renderer should remain usable without the native
  selection runtime.

## Architecture

### Selection Model

The model linearizes AST content into selection units:

- `text`: selectable text with node/source metadata;
- `break`: block, line, list item, or custom separators;
- `atom`: a non-text item that can be selected as a single unit;
- `boundary`: a node that splits selection regions or needs custom handling.

This lets Supramark represent both ordinary text and rich extension nodes in one
selection stream.

### Feature Selection Providers

Each feature may provide selection behavior:

- `text`: participate in text selection;
- `atom`: selectable as a single object;
- `boundary`: split selection regions;
- `custom`: feature owns the unit/payload mapping;
- `none`: intentionally not selectable.

Providers should expose payloads in formats such as `plainText`, `markdown`,
`html`, `source`, `svg`, and `png`.

### Native Text Primitive

The vendored `native/selectable-rich-text` implementation, based on
`boomsi/selectable-library`, is the first native text primitive. It should remain
below the coordinator.

It is responsible for:

- native text selection inside a single text segment;
- platform handles and selection menu integration;
- local selection snapshots and rectangles.

It is not responsible for:

- global Supramark AST ranges;
- cross-block selection;
- diagram/math/table/container payloads;
- renderer-level policy.

### RN Coordinator

The future RN runtime should provide:

- node/layout registry;
- hit testing from touch coordinates to selection points;
- document-level selection range state;
- overlay highlights and handles;
- auto-scroll while dragging;
- menu actions and clipboard payload dispatch.

## Milestones

### 1. Core Model

- Define `SelectionRange`, `SelectionPoint`, `SelectionUnit`, and
  `SelectionPayload`.
- Implement AST linearization for core Markdown nodes, including blockquote,
  image, definition list, and footnote nodes.
- Implement `resolveSelectionRange` to resolve a `SelectionRange` into the
  selection units it covers.
- Implement selection serialization for plain text, Markdown, and source
  payloads.

### 2. Native Primitive Integration

- Adapt `native/selectable-rich-text` behind Supramark interfaces.
- Add commands for local select, set selection, clear selection, and rect reads.
- Preserve offset/span metadata needed to map native selection back to AST units.

### 3. RN Selection Runtime

- Add `SelectionRoot` and a coordinator hook.
- Register rendered node layouts and text spans.
- Draw cross-block overlay highlights and handles.
- Support paragraph, heading, list, code, and table-cell selection.

### 4. Feature Payloads

- Add providers for code, math, diagrams, tables, and containers.
- Reuse `@supramark/engines` outputs for SVG/PNG-capable payloads.
- Extend selection serialization to SVG, PNG, and HTML payloads.
- Expose menu actions based on available payload formats.

### 5. Production Hardening

- Handle UTF-16 offsets, emoji, CJK, and mixed direction text.
- Support auto-scroll and streaming Markdown updates.
- Add RN interaction tests around hit testing, dragging, and copy payloads.
- Document feature provider authoring rules.

## Status

### Milestone 1 — Core Model (implemented)

Delivered as pure TypeScript, with no native/RN runtime dependency (`tsc --noEmit`
clean, 32 unit tests):

- `model.ts` — `SelectionRange` / `SelectionPoint` / `SelectionUnit` /
  `SelectionPayload`. Every unit carries a globally unique `unitId`; several units
  may share one `nodeId` (e.g. a heading's syntax prefix + its text). Offset
  semantics: offsets count UTF-16 code units inside a unit's plain text; a
  zero-text unit (atom/boundary) encodes *before* (offset 0) / *after* (offset > 0).
- `linearize.ts` — linearizes core Markdown while keeping `unit.text` **plain**.
  Markdown affixes (heading prefix, list markers, blockquote `>`, code fences,
  inline `**`/`_`/`[..](url)`) live in per-format payloads or empty-text syntax
  units, so plain-text and Markdown serialization are both lossless. Covers
  paragraph, heading, list, blockquote, code, inline code, image, math, diagram,
  definition list, footnote, raw, and thematic break.
- `resolve.ts` — `resolveSelectionRange(units, range)` maps a range to the units it
  covers, splitting partial text units at offsets and preserving a unit's
  whole-unit payload only on full coverage (a partial slice falls back to plain
  sliced text rather than leaking the surrounding syntax).
- `serialize.ts` — plain-text / Markdown / source serialization.

### Known limitations (deferred)

- Tables linearize as a single `boundary`; cell text is not yet selectable or
  copyable (milestone 3/4).
- Blockquotes use one `> ` prefix, not per-line prefixing.
- Offsets are UTF-16 code units; grapheme / emoji / CJK boundary handling is
  milestone 5.
- SVG / PNG / HTML payloads and the `@supramark/engines` dependency are deferred to
  milestone 4; the package currently depends only on `@supramark/core`.

## Initial Scope

The seed package provides, ahead of the RN coordinator:

- the `@supramark/rn-selection` workspace package;
- the vendored native text primitive with upstream credit preserved;
- the selection model, AST linearizer, range resolver, provider contract, and
  serializer (milestone 1 above).

The default RN renderer behavior is intentionally unchanged until the coordinator
is ready.
