// Empty stub for engine wasm packages this playground does not use.
//
// `@supramark/engines/web` (loaded from source) contains dynamic imports for
// plantuml / mermaid / graphviz wasm packages alongside the d2 loader. Rollup
// resolves every dynamic import specifier while building the module graph,
// *before* tree-shaking — so even though the d2-only path never invokes those
// loaders, the build would still try to resolve the packages and fail when
// their wasm dists are absent. These empty modules satisfy that resolution.
//
// At runtime the stubbed chunks are never fetched: the d2 render path only
// touches `@actrium/d2-little-web` and `elkjs`.
export {};
