# Upstream

This vendored native text primitive is based on:

- Repository: https://github.com/boomsi/selectable-library
- Commit: `1a2f65c0b966304a407131cd49bd296647064bfe`
- License: MIT, preserved in `LICENSE`

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
