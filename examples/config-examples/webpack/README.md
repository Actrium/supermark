# Webpack 配置示例 - Supramark

本目录包含 Webpack 项目中集成 Supramark 的配置示例。

## 安装依赖

```bash
npm install --save @supramark/web @supramark/core react react-dom
```

### 开发依赖

```bash
npm install --save-dev \
  webpack webpack-cli webpack-dev-server \
  @babel/core @babel/preset-env @babel/preset-react @babel/preset-typescript \
  babel-loader \
  html-webpack-plugin \
  mini-css-extract-plugin \
  css-loader style-loader \
  css-minimizer-webpack-plugin \
  terser-webpack-plugin \
  typescript @types/react @types/react-dom
```

## 配置说明

### 核心配置

`webpack.config.js` 包含以下关键配置：

#### 1. 模块解析

```javascript
resolve: {
  extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  conditionNames: ['import', 'require', 'default'], // 支持 package.json exports
}
```

**重要：** `conditionNames` 配置确保 Webpack 正确解析 `@supramark/web/client` 和 `@supramark/web/server` 入口。

#### 2. Babel 配置

```javascript
{
  test: /\.(ts|tsx|js|jsx)$/,
  use: {
    loader: 'babel-loader',
    options: {
      presets: [
        '@babel/preset-env',
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
    },
  },
}
```

#### 3. 代码分割

```javascript
optimization: {
  splitChunks: {
    cacheGroups: {
      react: {
        test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
        name: 'react-vendor',
      },
      supramark: {
        test: /[\\/]node_modules[\\/](@supramark)[\\/]/,
        name: 'supramark',
      },
    },
  },
}
```

将 Supramark 分离到独立的 chunk，提升缓存效率。

### 环境配置

#### 开发环境

```bash
npm run dev
# 或
webpack serve --mode development
```

特性：
- Hot Module Replacement (HMR)
- 快速的 source maps (`eval-source-map`)
- 开发服务器（端口 3000）

#### 生产环境

```bash
npm run build
# 或
webpack --mode production
```

特性：
- 代码压缩（Terser）
- CSS 提取和压缩
- 内容哈希文件名
- 移除 console.log

## package.json 脚本

```json
{
  "scripts": {
    "dev": "webpack serve --mode development",
    "build": "webpack --mode production",
    "build:analyze": "webpack --mode production --env analyze"
  }
}
```

## 高级配置

### 1. 环境变量

使用 `webpack.DefinePlugin` 注入环境变量：

```javascript
const webpack = require('webpack');

plugins: [
  new webpack.DefinePlugin({
    'process.env.API_URL': JSON.stringify(process.env.API_URL),
  }),
]
```

### 2. Bundle 分析

安装 `webpack-bundle-analyzer`：

```bash
npm install --save-dev webpack-bundle-analyzer
```

在 `webpack.config.js` 中添加：

```javascript
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

plugins: [
  ...(env.analyze ? [new BundleAnalyzerPlugin()] : []),
]
```

运行：

```bash
npm run build:analyze
```

### 3. TypeScript 配置

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## 与 Create React App 对比

如果使用 Create React App (CRA)，配置已内置，无需手动配置 Webpack。

**CRA 使用方法：**

```bash
npx create-react-app my-app --template typescript
cd my-app
npm install @supramark/web @supramark/core
```

在组件中直接使用：

```typescript
import { Supramark } from '@supramark/web/client';
```

## 常见问题

### Q: "Module not found: Error: Can't resolve '@supramark/web/client'"

**A:** 确保安装了依赖并配置了 `resolve.conditionNames`：

```javascript
resolve: {
  conditionNames: ['import', 'require', 'default'],
}
```

### Q: 打包体积过大？

**A:** 检查代码分割配置，并使用动态导入：

```typescript
const Supramark = lazy(() =>
  import('@supramark/web/client').then(m => ({ default: m.Supramark }))
);
```

### Q: 开发服务器启动慢？

**A:** 使用 `cache` 配置加速：

```javascript
cache: {
  type: 'filesystem',
}
```

## 参考

- [Webpack 官方文档](https://webpack.js.org/)
- [Supramark Web 集成指南](../../../docs/guides/web-integration.md)
- [Babel 配置文档](https://babeljs.io/docs/en/configuration)
