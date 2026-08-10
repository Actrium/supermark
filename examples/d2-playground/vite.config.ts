import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { existsSync } from 'fs';
import { resolve } from 'path';

// TS NodeNext source style: `import from './foo.js'` actually points to `foo.ts`.
// Vite's default resolver doesn't fall back from .js → .ts, so we do it here.
const jsToTsResolver = {
  name: 'js-to-ts-fallback',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (!importer || !source.endsWith('.js') || !source.startsWith('.')) return null;
    const abs = resolve(importer, '..', source);
    if (existsSync(abs)) return null;
    for (const ext of ['.ts', '.tsx']) {
      const candidate = abs.replace(/\.js$/, ext);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  },
};

export default defineConfig({
  // `base` is passed via the CLI (`--base /supramark/playground/`) when this
  // app is built into the docs site as a sub-page (mirrors react-web-csr's
  // preview build). Local `vite dev` keeps the default `/`.
  plugins: [jsToTsResolver, react(), wasm(), topLevelAwait()],
  worker: {
    format: 'es',
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // The d2 playground only renders D2. PlantUML / Mermaid / Graphviz wasm
      // loaders live in `@supramark/engines/web` as dynamic imports that rollup
      // resolves at graph-build time (pre-tree-shake). Point them at an empty
      // stub so the build doesn't require those wasm dists; the stubbed chunks
      // are never loaded at runtime. See src/stub-empty.ts for the rationale.
      '@actrium/plantuml-little-web': resolve(__dirname, 'src/stub-empty.ts'),
      '@actrium/mermaid-little-web': resolve(__dirname, 'src/stub-empty.ts'),
      '@actrium/graphviz-anywhere-web': resolve(__dirname, 'src/stub-empty.ts'),
    },
  },
  optimizeDeps: {
    // Workspace packages must NOT be prebundled — prebundling inlines a private
    // copy of @supramark/engines, which desyncs the dynamic-import graph the
    // engine facade relies on. See: https://vitejs.dev/guide/dep-pre-bundling.html
    exclude: [
      '@supramark/engines',
      '@supramark/engines/web',
      // d2-little-web ships a sibling .wasm blob resolved as a relative module
      // import (`import * as wasm from "./d2_little_web_bg.wasm"`). Prebundling
      // would strip that relative import; keep the package in node_modules.
      '@actrium/d2-little-web',
    ],
  },
  build: {
    chunkSizeWarningLimit: 3500,
  },
});
