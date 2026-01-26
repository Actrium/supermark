# Web 浏览器端集成指南

本指南介绍如何在 Web 浏览器环境中集成和使用 Supramark。

## 目录

- [概述](#概述)
- [安装](#安装)
- [使用场景](#使用场景)
  - [客户端渲染（CSR）](#客户端渲染csr)
  - [服务端渲染（SSR）](#服务端渲染ssr)
  - [混合渲染（SSR + CSR）](#混合渲染ssr--csr)
- [构建工具配置](#构建工具配置)
  - [Vite 配置](#vite-配置)
  - [Webpack 配置](#webpack-配置)
  - [Next.js 配置](#nextjs-配置)
- [API 参考](#api-参考)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 概述

`@supramark/web` 提供了两个入口点来支持不同的渲染场景：

| 入口 | 使用场景 | 导出内容 |
|------|---------|---------|
| `@supramark/web/client` | 浏览器端（CSR） | React 组件 + 解析功能 |
| `@supramark/web/server` | 服务端（SSR） | 解析 + HTML 渲染 |

### 渲染流程对比

**CSR（Client-Side Rendering）:**
```
Markdown 文本 → 浏览器解析 → React 组件渲染 → DOM
```

**SSR（Server-Side Rendering）:**
```
Markdown 文本 → 服务端解析 → HTML 字符串 → 发送到浏览器
```

---

## 安装

```bash
npm install @supramark/web @supramark/core
```

或使用 yarn/pnpm：

```bash
yarn add @supramark/web @supramark/core
pnpm add @supramark/web @supramark/core
```

---

## 使用场景

### 客户端渲染（CSR）

适用于：SPA（单页应用）、实时编辑器、交互式文档

#### 基础用法

```typescript
import { Supramark } from '@supramark/web/client';
import { useState } from 'react';

function MarkdownEditor() {
  const [markdown, setMarkdown] = useState('# Hello World\n\nThis is **Supramark**!');

  return (
    <div>
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />
      <Supramark markdown={markdown} />
    </div>
  );
}
```

#### 预解析优化

对于大型文档或需要多次渲染的内容，可以预先解析 AST：

```typescript
import { Supramark, parseMarkdown } from '@supramark/web/client';
import { useEffect, useState } from 'react';

function OptimizedRenderer({ markdownSource }) {
  const [ast, setAst] = useState(null);

  useEffect(() => {
    async function parse() {
      const parsed = await parseMarkdown(markdownSource);
      setAst(parsed);
    }
    parse();
  }, [markdownSource]);

  if (!ast) return <div>Loading...</div>;

  return <Supramark ast={ast} markdown="" />;
}
```

#### 完整示例

参考 [`examples/react-web-csr`](../../examples/react-web-csr) 查看完整的实时编辑器实现。

---

### 服务端渲染（SSR）

适用于：静态站点生成、SEO 优化、内容管理系统

#### Node.js 环境

```typescript
import { parseMarkdown, astToHtml } from '@supramark/web/server';

async function renderMarkdownToHtml(markdown: string): Promise<string> {
  // 1. 解析 Markdown 为 AST
  const ast = await parseMarkdown(markdown);

  // 2. 将 AST 转换为 HTML
  const html = astToHtml(ast);

  return html;
}

// 使用示例
const markdown = '# Hello\n\nThis is **bold** text.';
const html = await renderMarkdownToHtml(markdown);
console.log(html);
// 输出: <h1>Hello</h1><p>This is <strong>bold</strong> text.</p>
```

#### Express 服务器示例

```typescript
import express from 'express';
import { parseMarkdown, astToHtml } from '@supramark/web/server';

const app = express();

app.get('/render', async (req, res) => {
  const { markdown } = req.query;

  if (typeof markdown !== 'string') {
    return res.status(400).send('Invalid markdown');
  }

  const ast = await parseMarkdown(markdown);
  const html = astToHtml(ast);

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Rendered Markdown</title>
        <style>
          body { max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
});

app.listen(3000);
```

---

### 混合渲染（SSR + CSR）

适用于：Next.js、Remix、Astro 等现代框架

#### Next.js 示例（App Router）

```typescript
// app/page.tsx
import { parseMarkdown, astToHtml } from '@supramark/web/server';

export default async function Page() {
  const markdown = '# Server-Rendered Content\n\nThis is rendered on the server.';
  const ast = await parseMarkdown(markdown);
  const html = astToHtml(ast);

  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  );
}
```

#### Next.js 客户端组件

```typescript
// components/MarkdownEditor.tsx
'use client';

import { Supramark } from '@supramark/web/client';
import { useState } from 'react';

export function MarkdownEditor() {
  const [markdown, setMarkdown] = useState('# Edit me!');

  return (
    <div>
      <textarea onChange={(e) => setMarkdown(e.target.value)} value={markdown} />
      <Supramark markdown={markdown} />
    </div>
  );
}
```

---

## 构建工具配置

### Vite 配置

Vite 无需特殊配置，开箱即用。

**`vite.config.ts`:**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Supramark 无需额外配置
});
```

**示例项目：** 参考 [`examples/react-web-csr`](../../examples/react-web-csr)

---

### Webpack 配置

如果使用 Webpack 5，需要正确配置 module resolution。

**`webpack.config.js`:**

```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    // 确保正确解析 package.json exports
    conditionNames: ['import', 'require', 'default'],
  },
};
```

**Create React App (CRA):**

CRA 默认配置已支持，无需额外配置。

---

### Next.js 配置

Next.js 13+ (App Router) 无需特殊配置。

**`next.config.js`:**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supramark 无需额外配置
};

module.exports = nextConfig;
```

**使用建议：**

- 服务端组件：使用 `@supramark/web/server` 进行 SSR
- 客户端组件：使用 `@supramark/web/client` 进行交互式渲染

---

## API 参考

### `@supramark/web/client`

#### `<Supramark>` 组件

```typescript
interface SupramarkWebProps {
  markdown?: string;         // Markdown 源文本
  ast?: SupramarkRootNode;   // 预解析的 AST（优先级高于 markdown）
  className?: string;        // 根容器的 CSS 类名
}

function Supramark(props: SupramarkWebProps): JSX.Element;
```

**示例：**

```tsx
<Supramark markdown="# Hello" className="markdown-content" />
```

#### `parseMarkdown`

```typescript
function parseMarkdown(
  markdown: string,
  options?: SupramarkParseOptions
): Promise<SupramarkRootNode>;
```

**示例：**

```typescript
import { parseMarkdown } from '@supramark/web/client';

const ast = await parseMarkdown('# Hello World');
```

---

### `@supramark/web/server`

#### `parseMarkdown`

同 client 入口，用于服务端解析。

#### `astToHtml`

```typescript
function astToHtml(ast: SupramarkRootNode): string;
```

将 AST 转换为 HTML 字符串。

**示例：**

```typescript
import { parseMarkdown, astToHtml } from '@supramark/web/server';

const ast = await parseMarkdown('# Hello');
const html = astToHtml(ast); // '<h1>Hello</h1>'
```

#### `escapeHtml`

```typescript
function escapeHtml(text: string): string;
```

转义 HTML 特殊字符，用于安全渲染用户输入。

**示例：**

```typescript
import { escapeHtml } from '@supramark/web/server';

const safe = escapeHtml('<script>alert("xss")</script>');
// '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
```

---

## 最佳实践

### 1. 性能优化

**使用预解析 AST：**

```typescript
// ❌ 不推荐：每次渲染都解析
<Supramark markdown={markdown} />

// ✅ 推荐：预先解析，缓存 AST
const ast = useMemo(() => parseMarkdown(markdown), [markdown]);
<Supramark ast={ast} markdown="" />
```

### 2. 样式定制

```css
/* 为 Supramark 内容添加自定义样式 */
.markdown-content h1 {
  color: #333;
  font-size: 2rem;
  margin-bottom: 1rem;
}

.markdown-content code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}
```

### 3. 安全性

**避免 XSS 攻击：**

```typescript
// Supramark 默认转义 HTML 标签，但如果你手动处理 HTML：
import { escapeHtml } from '@supramark/web/server';

const userInput = req.body.markdown;
const safeInput = escapeHtml(userInput); // 转义危险字符
```

### 4. 错误处理

```typescript
import { Supramark } from '@supramark/web/client';
import { ErrorBoundary } from 'react-error-boundary';

function App() {
  return (
    <ErrorBoundary fallback={<div>渲染失败，请检查 Markdown 格式</div>}>
      <Supramark markdown={markdown} />
    </ErrorBoundary>
  );
}
```

### 5. TypeScript 支持

```typescript
import type { SupramarkRootNode } from '@supramark/core';

interface Props {
  content: string;
}

function MarkdownViewer({ content }: Props) {
  const [ast, setAst] = useState<SupramarkRootNode | null>(null);

  // ...
}
```

---

## 常见问题

### Q: 如何选择 client 还是 server 入口？

**A:** 根据渲染环境选择：

- **浏览器端渲染（React 组件）** → 使用 `@supramark/web/client`
- **服务端生成 HTML** → 使用 `@supramark/web/server`
- **混合场景（Next.js）** → 服务端用 `server`，客户端用 `client`

### Q: Vite 报错 "Failed to resolve module"？

**A:** 确保安装了所有依赖：

```bash
npm install @supramark/web @supramark/core react react-dom
```

### Q: Webpack 打包体积过大？

**A:** 使用动态导入（code splitting）：

```typescript
const Supramark = lazy(() => import('@supramark/web/client').then(m => ({ default: m.Supramark })));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Supramark markdown={markdown} />
    </Suspense>
  );
}
```

### Q: 如何支持图表（Mermaid）？

**A:** Supramark 默认支持 Mermaid 图表，无需额外配置：

````markdown
```mermaid
graph TD
  A[开始] --> B[结束]
```
````

浏览器端会自动加载 Mermaid 脚本并渲染图表。

### Q: 如何自定义样式？

**A:** 使用 CSS 类名选择器：

```tsx
<Supramark markdown={md} className="my-markdown" />
```

```css
.my-markdown h1 { color: blue; }
.my-markdown code { background: #f5f5f5; }
```

### Q: 支持哪些 Markdown 特性？

**A:** 完整支持：

- ✅ 标准 Markdown（CommonMark）
- ✅ GFM（删除线、任务列表、表格）
- ✅ 代码高亮
- ✅ Mermaid 图表

---

## 下一步

- 查看 [CSR 示例](../../examples/react-web-csr)
- 阅读 [插件开发指南](../plugins/plugin-api.md)
- 了解 [AST 规范](../architecture/ast-spec.md)

---

**需要帮助？** 提交 Issue 到 [GitHub 仓库](https://github.com/yourusername/supramark)
