# Features

Supramark 采用模块化的 Feature 系统，每个 Feature 都是一个独立的功能扩展包。

## 核心 Features

### [@supramark/feature-core-markdown](./core-markdown)

标准 Markdown 语法支持，包括标题、段落、列表、代码块等基础元素。

### [@supramark/feature-gfm](./gfm)

GitHub Flavored Markdown 扩展，支持表格、任务列表、删除线等。

### [@supramark/feature-math](./math)

LaTeX 数学公式支持，包括行内公式和块级公式。

## 扩展 Features

### [@supramark/feature-admonition](./admonition)

提示框组件，支持 note、tip、warning、danger 等多种类型。

### [@supramark/feature-definition-list](./definition-list)

定义列表支持，用于术语和描述的展示。

### [@supramark/feature-emoji](./emoji)

Emoji 短代码支持，将 `:smile:` 转换为 😄。

### [@supramark/feature-footnote](./footnote)

脚注支持，用于添加页面底部的参考注释。

## 使用 Features

所有 Feature 都遵循统一的配置模式：

```typescript
import { Supramark } from '@supramark/web'
import { mathFeature } from '@supramark/feature-math'
import { gfmFeature } from '@supramark/feature-gfm'

<Supramark
  markdown={markdown}
  config={{
    features: [
      mathFeature,
      gfmFeature,
      // ... 其他 Features
    ]
  }}
/>
```

## 创建自定义 Feature

参考 [Feature 开发指南](/guide/custom-features) 了解如何创建自己的 Feature。
