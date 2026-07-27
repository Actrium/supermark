# Upstream

This vendored native text primitive is based on:

- Original project: `toupitutuetoudada/react-native-selectable-text`
  (https://github.com/toupitutuetoudada/react-native-selectable-text) — the MIT
  copyright holder in `LICENSE`, and the owner named by `package.json`'s
  `author` / `repository` / `homepage` / `bugs` fields, which are preserved
  verbatim.
- Vendored from the fork: https://github.com/boomsi/selectable-library
- Commit: `1a2f65c0b966304a407131cd49bd296647064bfe` (a commit of the **fork**,
  not of the original repository).
- License: MIT, preserved in `LICENSE`.

Credit to `toupitutuetoudada` as the original author and to
`boomsi/selectable-library` for the fork this tree was taken from. The original
package metadata, README, and MIT license are kept in this directory so the
provenance remains visible in the Supramark tree.

The source is vendored instead of referenced as a git submodule so Supramark can
review and evolve the native selection primitive in the same pull request as the
document-level selection model.

## Vendoring Scope

Included:

- `src/`
- `ios/`
- `android/`
- `common/`
- package and React Native native-module config files
- upstream `LICENSE` and `README.md`

Excluded:

- upstream example app
- upstream repository-local lint, CI, yarn, and editor configuration
- upstream `TODO.md` — a work-in-progress migration log, not provenance. It
  contradicted the code it shipped with: its section 13 recorded
  `onTextLongPress` / `topTextLongPress` as deleted from the JS spec, C++, iOS
  and Android, while all four are present and wired (`src/types.ts`,
  `SelectableRichTextEventEmitter.cpp`, `RCTSelectableRichTextView.mm`,
  `SelectableRichTextTextLongPressEvent.kt`). `LICENSE` and `README.md` carry
  the provenance; a stale changelog only misleads.

When pulling upstream changes, preserve this file and the MIT license notice.

## In-tree Adaptations

- `package.json`: upstream `devDependencies` (standalone dev/release tooling and
  its own react-native 0.83 copy) and release/lint/jest config blocks are removed
  — as a vendored workspace member they would install a second react-native and
  ~900 unused packages. `peerDependencies.react-native` relaxed to `>=0.81.0` to
  match the workspace's RN version. Codegen still runs via the host app build
  (`codegenConfig` is preserved).
