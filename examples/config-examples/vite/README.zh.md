# Vite 配置示例 - Supramark

本目录包含 Vite 项目中集成 Supramark 的配置示例。

## 基础配置

Supramark 与 Vite 开箱即用，无需特殊配置：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

## 优化配置

查看 `vite.config.ts` 了解以下优化：

### 1. 代码分割

将 Supramark 和 React 分离到独立的 chunk，提升缓存效率：

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'supramark': ['@supramark/web', '@supramark/core'],
      },
    },
  },
}
```

### 2. 依赖预构建

显式声明预构建依赖，加快开发服务器启动：

```typescript
optimizeDeps: {
  include: ['@supramark/web', '@supramark/core'],
}
```

### 3. 生产优化

```typescript
build: {
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_console: true, // 移除 console.log
    },
  },
}
```

## 使用方法

1. **安装依赖**

```bash
npm install vite @vitejs/plugin-react @supramark/web @supramark/core
```

2. **复制配置文件**

将 `vite.config.ts` 复制到你的项目根目录。

3. **启动开发服务器**

```bash
npm run dev
```

## 环境变量

Vite 支持环境变量配置：

```bash
# .env.local
VITE_APP_TITLE=My Markdown App
```

在代码中使用：

```typescript
const title = import.meta.env.VITE_APP_TITLE;
```

## TypeScript 支持

确保 `tsconfig.json` 包含 Vite 类型：

```json
{
  "compilerOptions": {
    "types": ["vite/client"]
  }
}
```

## 参考

- [完整示例项目](../../react-web-csr)
- [Vite 官方文档](https://vitejs.dev/)
- [Supramark Web 集成指南](../../../docs/guides/web-integration.md)
