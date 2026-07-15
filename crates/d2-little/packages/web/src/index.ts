/**
 * `@actrium/d2-little-web` — wasm-bindgen wrapper around the `d2-little`
 * Rust crate.
 *
 * Unlike the plantuml-little wasm wrapper, d2-little-web has no external
 * bridge requirements: the underlying Rust crate ships its own
 * pure-Rust dagre layout engine. Consumers simply import and call
 * {@link convert}.
 *
 * ```ts
 * import { convert } from '@actrium/d2-little-web';
 *
 * const svg = convert('a -> b');
 * ```
 */

// Re-export the raw wasm-bindgen API. `convert` (dagre) and `version` are the
// always-available entries; `prepare` / `render` / `drop_prepared` form the
// elkjs layout bridge (the host runs `elkjs.layout` between `prepare` and
// `render`). Everything else (`__wbg_set_wasm` etc.) stays internal.
export { convert, version, prepare, render, drop_prepared } from './wasm/d2_little_web.js';
