import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config example - Supramark integration
 *
 * Supramark works out of the box with no special configuration.
 * Below are some common optimization settings.
 */

export default defineConfig({
  plugins: [react()],

  // Dev server config
  server: {
    port: 5173,
    open: true, // Open the browser automatically
  },

  // Build optimization
  build: {
    // Output directory
    outDir: 'dist',

    // Code splitting strategy
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React and related libraries into their own chunk
          'react-vendor': ['react', 'react-dom'],
          // Split Supramark into its own chunk (optional)
          'supramark': ['@supramark/web', '@supramark/core'],
        },
      },
    },

    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Strip console.log in production
      },
    },

    // Generate sourcemaps (optional)
    sourcemap: false,
  },

  // Path alias (optional)
  resolve: {
    alias: {
      '@': '/src',
    },
  },

  // Pre-bundle dependencies
  optimizeDeps: {
    include: ['@supramark/web', '@supramark/core'],
  },
});
