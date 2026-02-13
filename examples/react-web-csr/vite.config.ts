import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const usePolling = process.env.VITE_WSL_POLLING === '1';

export default defineConfig({
  // On WSL + /mnt/*, file events are often unreliable and NTFS I/O is slow.
  // Use polling for stable HMR and keep Vite cache on Linux fs for faster startup.
  cacheDir: '/tmp/supramark-vite-cache/react-web-csr',
  plugins: [react()],
  server: {
    watch: {
      usePolling,
      interval: usePolling ? 200 : undefined,
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/docs/.vitepress/**',
        '**/docs/public/**',
        '**/examples/react-native/ios/Pods/**',
        '**/examples/react-native/android/**',
      ],
    },
  },
  resolve: {
    alias: [
      { find: 'react-native', replacement: resolve(__dirname, 'src/__mocks__/react-native.ts') },
      { find: '@react-native', replacement: resolve(__dirname, 'src/__mocks__/react-native.ts') },
    ],
    dedupe: ['react', 'react-dom'],
    mainFields: ['module', 'main', 'types'],
  },
  optimizeDeps: {
    // Pre-bundle heavy diagram/math libraries so Vite doesn't discover them at runtime
    // (runtime discovery triggers a full page reload).
    include: ['katex', 'beautiful-mermaid', '@viz-js/viz', 'echarts', 'vega', 'vega-lite'],
    // Keep workspace packages out of prebundle so source edits are always reflected.
    exclude: [
      'react-native',
      '@react-native',
      '@react-native/virtualized-lists',
      '@supramark/core',
      '@supramark/web',
      '@supramark/web/client',
      '@supramark/diagram-engine',
      '@supramark/feature-admonition',
      '@supramark/feature-admonition/web',
      '@supramark/feature-weather',
      '@supramark/feature-weather/web',
    ],
  },
});
