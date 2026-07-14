// Type stub for the wasm-bindgen-generated module. The real JS + wasm
// live at ../../dist/wasm/ and are produced by `wasm-pack build
// --target bundler` — see the `build:wasm` script in package.json.
//
// We keep a stub here so `tsc` can resolve `./wasm/d2_little_web.js`
// during TypeScript compilation. At runtime (after build), the relative
// import resolves to `dist/wasm/d2_little_web.js`, which is the actual
// wasm-pack output.
//
// `prepare` / `render` / `drop_prepared` form the elkjs layout bridge
// (host runs `elkjs.layout` between `prepare` and `render`); `convert` is
// the dagre-only path.

export class PrepareResult {
  readonly handle: number;
  readonly request: string;
}

export function convert(input: string): string;
export function version(): string;
export function prepare(input: string): PrepareResult;
export function render(handle: number, layout_json: string): string;
export function drop_prepared(handle: number): void;
