/**
 * The entry point for the Rust markdown module loader (a routing file).
 *
 * The actual implementation is split into two platform-specific files:
 *   - `plugin-loader-web.ts` —— Web / Node, imports wasm
 *   - `plugin-loader-rn.ts` —— RN, goes through native FFI
 *
 * `plugin.ts` uniformly imports `loadRustMarkdownModule` from here; Metro resolves
 * `./plugin-loader.js` to the corresponding platform implementation via the host's
 * `metro.config.js` sourceMap. This way, no import of `@supramark/markdown-web`
 * ever shows up in the RN bundle, avoiding a conflict between lazy bundling and
 * static require.
 *
 * By default this re-exports the web implementation (for direct use by Node / Bun /
 * Web, without depending on any metro configuration). An RN host must explicitly map
 * `'./plugin-loader.js'` or `'@supramark/core/plugin-loader'` to
 * `plugin-loader-rn.ts` in metro.config.js.
 */
export { loadRustMarkdownModule } from './plugin-loader-web.js';
