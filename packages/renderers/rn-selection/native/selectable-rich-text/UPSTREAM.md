# Upstream

This vendored native text primitive is based on:

- Repository: https://github.com/boomsi/selectable-library
- Commit: `1a2f65c0b966304a407131cd49bd296647064bfe`
- License: MIT, preserved in `LICENSE`

Credit to the original `boomsi/selectable-library` project and its upstream
author metadata. The original package metadata, README, TODO, and MIT license are
kept in this directory so the provenance remains visible in the Supramark tree.

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
- upstream `LICENSE`, `README.md`, and `TODO.md`

Excluded:

- upstream example app
- upstream repository-local lint, CI, yarn, and editor configuration

When pulling upstream changes, preserve this file and the MIT license notice.

## In-tree Adaptations

- `package.json`: upstream `devDependencies` (standalone dev/release tooling and
  its own react-native 0.83 copy) and release/lint/jest config blocks are removed
  — as a vendored workspace member they would install a second react-native and
  ~900 unused packages. `peerDependencies.react-native` relaxed to `>=0.81.0` to
  match the workspace's RN version. Codegen still runs via the host app build
  (`codegenConfig` is preserved).
