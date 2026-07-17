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
- Implement AST linearization for core Markdown nodes.
- Implement selection serialization for plain text, Markdown, source, SVG, PNG,
  and HTML payloads.

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
- Expose menu actions based on available payload formats.

### 5. Production Hardening

- Handle UTF-16 offsets, emoji, CJK, and mixed direction text.
- Support auto-scroll and streaming Markdown updates.
- Add RN interaction tests around hit testing, dragging, and copy payloads.
- Document feature provider authoring rules.

## Initial Scope

The first branch seeds the package and model only:

- `@kookyleo/rn-selection` workspace package;
- vendored native text primitive with upstream credit preserved;
- selection model, AST linearizer, provider contract, and serializer.

The default RN renderer behavior is intentionally unchanged until the coordinator
is ready.
