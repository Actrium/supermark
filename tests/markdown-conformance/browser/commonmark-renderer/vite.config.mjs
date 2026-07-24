import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const harnessRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessRoot, '..', '..', '..', '..');
const sourceExtensions = ['.ts', '.tsx', '.mts', '.jsx'];

function resolveSourceJsImports() {
  return {
    name: 'resolve-supramark-source-js-imports',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;
      const stem = path.resolve(path.dirname(importer.split('?')[0]), source.slice(0, -3));
      for (const extension of sourceExtensions) {
        const candidate = `${stem}${extension}`;
        if (existsSync(candidate)) return candidate;
      }
      return null;
    },
  };
}

export default defineConfig({
  root: harnessRoot,
  plugins: [resolveSourceJsImports()],
  resolve: {
    alias: [
      {
        find: '@supramark/web-production',
        replacement: path.join(repositoryRoot, 'packages', 'renderers', 'web', 'src', 'Supramark.tsx'),
      },
      {
        find: '@supramark/engines/web',
        replacement: path.join(harnessRoot, 'src', 'engine-web-stub.ts'),
      },
      {
        find: '@supramark/markdown-web',
        replacement: path.join(harnessRoot, 'src', 'markdown-web-stub.ts'),
      },
      {
        find: '@supramark/core',
        replacement: path.join(repositoryRoot, 'packages', 'core', 'src', 'index.ts'),
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
    fs: { allow: [repositoryRoot] },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: { target: 'ES2022', jsx: 'react-jsx' },
    },
  },
  logLevel: 'warn',
});
