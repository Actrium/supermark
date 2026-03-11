import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 配置示例 - Supramark 集成
 *
 * Supramark 开箱即用，无需特殊配置。
 * 以下是一些常见的优化配置。
 */

export default defineConfig({
  plugins: [react()],

  // 开发服务器配置
  server: {
    port: 5173,
    open: true, // 自动打开浏览器
  },

  // 构建优化
  build: {
    // 输出目录
    outDir: 'dist',

    // 代码分割策略
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 React 相关库分离到单独的 chunk
          'react-vendor': ['react', 'react-dom'],
          // 将 Supramark 分离到单独的 chunk（可选）
          'supramark': ['@supramark/web', '@supramark/core'],
        },
      },
    },

    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除 console.log
      },
    },

    // 生成 sourcemap（可选）
    sourcemap: false,
  },

  // 路径别名（可选）
  resolve: {
    alias: {
      '@': '/src',
    },
  },

  // 优化依赖预构建
  optimizeDeps: {
    include: ['@supramark/web', '@supramark/core'],
  },
});
