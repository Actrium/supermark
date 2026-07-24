import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
  plugins: [jsToTsResolver, react(), wasm(), topLevelAwait()],
  optimizeDeps: {
    // @supramark/markdown-web ships a sibling .wasm blob resolved via a relative
    // `import * as wasm from "./supramark_markdown_web_bg.wasm"`. Pre-bundling
    // would strip that sibling, so it must stay in node_modules.
    exclude: ['@supramark/markdown-web'],
  },
});
