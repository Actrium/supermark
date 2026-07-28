# Conformance sources

Each JSON file declares one pinned upstream source. The generic import command reads the
configuration, verifies the repository remote and full commit, loads the configured adapter,
and writes normalized fixtures under `tests/cases/_fixtures/<source-name>/`.

Required configuration fields:

- `name`: stable lowercase source identifier.
- `displayName`: human-readable source name.
- `repository`: canonical upstream Git repository URL.
- `version`: source release represented by the fixture.
- `revision`: full 40-character source commit.
- `input`: fixture path within that commit, for a single-file source.
- `inputs`: ordered fixture descriptors for a multi-file source; each descriptor supplies `path`
  and may carry adapter-specific metadata such as `fixtureVersion` or `caseIdNamespace`.
- `license`: SPDX license identifier for the imported content.
- `profile`: unified case profile (`commonmark`, `gfm`, or `supramark`).
- `importer`: adapter module basename under `tests/markdown-conformance/importers/`.

An adapter default-exports a function accepting `(sourceDocuments, sourceConfig)` and returning
`{ cases, sourceSha256 }`. Multi-file adapters also return `sourceFiles`, including the path,
source hash, and case count for every fixture. Spec-style sources can reuse
`importers/spec-examples.mjs`.

From the repository root:

```powershell
node tests/markdown-conformance/scripts/import.mjs <source-name>
node tests/markdown-conformance/scripts/validate.mjs <source-name>
```

Use `--source-dir <repository>` to import from an existing checkout. Its `origin` and resolved
commit must match the pinned configuration. Keep generated cases in `tests/cases`; keep all
