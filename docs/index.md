---
layout: home

hero:
  name: "Supramark"
  text: "跨平台 Markdown 渲染引擎"
  tagline: 统一的 Markdown AST · React Native & Web · 高性能 · 可扩展
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 查看 Features
      link: /features/
    - theme: alt
      text: API 参考
      link: /api/

features:
  - icon: 🚀
    title: 统一的 AST
    details: 基于标准化的抽象语法树，实现跨平台一致的 Markdown 解析和渲染

  - icon: 📱
    title: 原生支持 React Native
    details: 为移动端优化的渲染引擎，无需 WebView，完全原生组件实现

  - icon: 🌐
    title: Web 端高性能
    details: 服务端渲染（SSR）支持，客户端脚本增强，适配各种 React 框架

  - icon: 🔌
    title: 强大的 Feature 系统
    details: 模块化的功能扩展，支持 Math、GFM、Admonition、Diagram 等

  - icon: 🎨
    title: 完全可定制
    details: 灵活的样式系统，支持主题切换，满足各种设计需求

  - icon: ⚡
    title: 高性能缓存
    details: LRU 缓存机制，优化解析性能，减少重复计算
---

## 快速预览

```typescript
import { Supramark } from '@supramark/web'
import { mathFeature } from '@supramark/feature-math'

const markdown = `
# Hello Supramark

支持 **GFM**、数学公式 $E=mc^2$、以及更多功能！

> [!NOTE]
> 这是一个提示框
`

function App() {
  return (
    <Supramark
      markdown={markdown}
      config={{
        features: [mathFeature]
      }}
    />
  )
}
```

## 为什么选择 Supramark？

### 🎯 真正的跨平台

不同于其他方案，Supramark 为 Web 和 React Native 提供**统一的 API 和渲染行为**：

- ✅ 同一套配置，双端一致
- ✅ 同一份 AST，跨平台共享
- ✅ 同一套 Feature 系统，统一扩展

### 🏗️ 架构优雅

```
┌─────────────────────────────────────┐
│        Application Code             │
└─────────────────┬───────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼──────┐   ┌────────▼────────┐
│ @supramark   │   │  @supramark     │
│    /web      │   │     /rn         │
└───────┬──────┘   └────────┬────────┘
        │                   │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │  @supramark/core  │
        │  (AST + Parser)   │
        └───────────────────┘
```

### 📦 丰富的 Feature 生态

| Feature | 功能 | 平台支持 |
|---------|------|---------|
| Core Markdown | 标准 Markdown | Web · RN |
| GFM | 表格、任务列表、删除线 | Web · RN |
| Math | LaTeX 数学公式 | Web · RN |
| Admonition | 提示框 | Web · RN |
| Emoji | Emoji 短代码 | Web · RN |
| Footnote | 脚注 | Web · RN |
| Definition List | 定义列表 | Web · RN |

### 🚦 生产就绪

- ✅ TypeScript 原生支持
- ✅ 完整的单元测试
- ✅ SSR 友好
- ✅ Tree-shakable
- ✅ 开箱即用的缓存优化
