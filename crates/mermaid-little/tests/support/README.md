# tests/support — reference SVG generator

Private helper package. Mirrors `plantuml-little/tests/support/`.

## Why

The mermaid-little reference tests compare its Rust-produced SVG against
an upstream-generated reference per fixture. To keep that comparison
byte-exact across machines, we pin:

- **`mermaid@11.14.0`** (see `package.json` — do not bump without also
  updating `tests/reference/VERSION`).
- **`jsdom@25.0.1`** as the DOM host — lighter than chromium, enough for
  mermaid's rendering path.
- Bundled DejaVu font metrics via `font_metrics.mjs`, mirroring the
  Rust-side `src/font_metrics.rs` lookup logic so both pipelines agree
  on text measurement without host font probing.

## Setup

```bash
cd tests/support
npm ci         # honours package-lock.json
```

Requires Node 20+ (the transitive `chevrotain@12` ideally wants Node
22+; it emits a warning on 20 but works).

## Usage

Single fixture:

```bash
node generate_ref.mjs ../fixtures/pie/01.mmd -o ../reference/fixtures/pie/01.svg
node generate_ref.mjs ../fixtures/pie/01.mmd              # -> stdout
```

Batch, mirrors `fixtures/` and `ext_fixtures/` into `reference/`:

```bash
node generate_ref.mjs --batch
```

The output tree:

```
tests/reference/
├── fixtures/<type>/<case>.svg
└── ext_fixtures/<subsource>/<type>/<case>.svg
```

## Upstream dep bumps (issue #140)

A dependabot PR flagged five outdated deps here. Four are transitive deps of
the generator with no bearing on its SVG output; they were bumped via
`package.json#overrides` (commit `b35f808b`):

- `dompurify` 3.4.1 → 3.4.12
- `form-data` 4.0.5 → 4.0.6
- `uuid` 11.1.0 → 14.0.1
- `ws` 8.20.0 → 8.21.1

The fifth, `mermaid` 11.14.0 → 11.15.0, is **deliberately not bumped**. A bump
is not a version-string edit here — it regenerates and re-reviews the entire
reference set, and 11.15.0 additionally breaks the generator on two fronts:

- **Baseline drift**: 11.15.0 includes rendering changes (e.g. decimal
  `autonumber` in sequence diagrams), so every baseline SVG would shift and
  need re-approval, not just a re-run.
- **jsdom generator breakage**: 11.15.0's stylesheet path hits the read-only
  `CSSStyleSheet` getter in jsdom 25.0.1, which the generator's shims don't
  cover. Fixing it means widening the shims, which in turn diverges the
  generator's DOM environment from the Rust-side `stylis.rs` CSS parity
  surface the reference set is meant to validate.

So the call is: stay pinned on 11.14.0 (the version `tests/reference/VERSION`
anchors the byte-exact comparison to) and revisit only when someone is
prepared to re-baseline and re-shim together.

The same five-package audit was applied to the sibling crates:

- `crates/plantuml-little/tests/support/` — dep tree carries none of the five
  (`npm ls` empty); only `@kookyleo/graphviz-anywhere-web`. No action.
- `crates/d2-little/` — no support `package.json` with dependencies;
  MathJax is vendored (`mathjax.js`), `elkjs` is resolved from the workspace
  `engines` package. No action.

## Determinism

Confirmed: same `.mmd` + same fixture path → identical SVG bytes across
runs on Node 20.19.4 + jsdom 25.0.1 + mermaid 11.14.0.

Remaining caveats:

- **Node minor version drift**: chevrotain parser behaviour could
  theoretically differ; pin exact Node in CI once Phase 1 CI lands.
- **Diagram implementation gaps**: the remaining byte diffs are now
  renderer/layout fidelity issues (viewBox, shape geometry, edge paths,
  label HTML), not host-font measurement drift.
