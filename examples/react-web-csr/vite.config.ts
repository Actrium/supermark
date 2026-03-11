import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': resolve(__dirname, 'src/__mocks__/react-native.ts'),
      '@react-native': resolve(__dirname, 'src/__mocks__/react-native.ts'),
    },
    mainFields: ['module', 'main', 'types'],
  },
  optimizeDeps: {
    exclude: ['react-native', '@react-native', '@react-native/virtualized-lists'],
    include: ['@supramark/web', '@supramark/web/client', '@supramark/web/server'],
  },
});
