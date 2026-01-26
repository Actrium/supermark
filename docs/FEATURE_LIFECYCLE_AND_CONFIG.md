# Feature 生命周期与配置管理

本文档详细说明 Supramark Feature Registry 的生命周期管理和运行时配置系统。

## 目录

- [1. Feature Registry 生命周期](#1-feature-registry-生命周期)
- [2. Feature 配置系统](#2-feature-配置系统)
- [3. 运行时包集成](#3-运行时包集成)
- [4. 使用示例](#4-使用示例)

---

## 1. Feature Registry 生命周期

### 1.1 生命周期概述

Feature Registry 的生命周期分为三个阶段：

```
Feature 定义（编译时）
    ↓
Feature 注册（初始化时）
    ↓
Feature 使用（运行时）
```

### 1.2 阶段 1：Feature 定义（编译时）

开发者在代码中定义 Feature，通常在独立的包或模块中：

```typescript
// packages/features/fence/feature-vega-lite/src/feature.ts
import type { SupramarkFeature, DiagramNode } from '@supramark/core';

export const vegaLiteFeature: SupramarkFeature<DiagramNode> = {
  metadata: {
    id: '@supramark/feature-vega-lite',
    name: 'Vega-Lite',
    version: '0.1.0',
  },
  syntax: {
    ast: {
      type: 'diagram',
      selector: (node) =>
        node.type === 'diagram' &&
        ['vega-lite', 'vega'].includes(node.engine),
    },
  },
};
```

**关键点**：
- Feature 定义是**纯类型和元数据**，不涉及运行时逻辑
- 可以在任何包中定义，不一定要在 `@supramark/core`
- 定义后的 Feature 需要显式注册才能被使用

### 1.3 阶段 2：Feature 注册（初始化时）

#### 2.1 在 Core 包中注册（可选）

如果 Feature 是内置的，可以在 `@supramark/core` 的某个模块中统一注册：

```typescript
// packages/core/src/builtin-features.ts
import { FeatureRegistry } from './feature';
import { vegaLiteFeature } from '@supramark/feature-vega-lite';
import { mermaidFeature } from '@supramark/feature-mermaid';
// ... 其他内置 Features

/**
 * 注册所有内置 Features
 *
 * 此函数应该在运行时包（@supramark/rn, @supramark/web）初始化时调用
 */
export function registerBuiltinFeatures(): void {
  FeatureRegistry.register(vegaLiteFeature);
  FeatureRegistry.register(mermaidFeature);
  // ... 注册其他 Features
}
```

**时机**：
- 通常在运行时包（`@supramark/rn` 或 `@supramark/web`）**初始化时**调用
- 可以在应用启动时（如 `App.tsx` 的顶层）调用
- 也可以延迟到实际需要使用时注册

#### 2.2 在运行时包中注册（推荐）

运行时包应该提供一个初始化函数，在内部调用注册：

```typescript
// packages/rn/src/init.ts
import { registerBuiltinFeatures } from '@supramark/core/builtin-features';
import { FeatureRegistry } from '@supramark/core';

let initialized = false;

/**
 * 初始化 Supramark RN 运行时
 *
 * 此函数应该在使用任何 Supramark 组件前调用（通常在 App 入口）
 */
export function initSupramarkRN(): void {
  if (initialized) {
    console.warn('Supramark RN already initialized');
    return;
  }

  // 注册所有内置 Features
  registerBuiltinFeatures();

  // 其他初始化逻辑...

  initialized = true;
}

/**
 * 获取当前已注册的 Feature 列表
 */
export function getAvailableFeatures() {
  return FeatureRegistry.list();
}
```

#### 2.3 用户自定义 Feature 注册

用户可以在应用代码中注册自己的 Feature：

```typescript
// app/src/features/custom-chart.ts
import { FeatureRegistry } from '@supramark/core';
import type { SupramarkFeature } from '@supramark/core';

const customChartFeature: SupramarkFeature<any> = {
  metadata: {
    id: '@myapp/custom-chart',
    name: 'Custom Chart',
    version: '1.0.0',
  },
  syntax: {
    ast: {
      type: 'custom-chart',
    },
  },
};

// 注册自定义 Feature
FeatureRegistry.register(customChartFeature);
```

### 1.4 阶段 3：Feature 使用（运行时）

运行时包在解析或渲染时查询 Feature Registry：

```typescript
// packages/rn/src/components/Supramark.tsx
import { FeatureRegistry, getEnabledFeatures } from '@supramark/core';

interface SupramarkProps {
  markdown: string;
  config?: SupramarkConfig;
}

export function Supramark({ markdown, config }: SupramarkProps) {
  // 1. 获取启用的 Features
  const enabledFeatures = config
    ? getEnabledFeatures(config)
    : FeatureRegistry.list();

  // 2. 解析 Markdown
  const ast = parseMarkdown(markdown, { features: enabledFeatures });

  // 3. 渲染 AST
  return <ASTRenderer ast={ast} features={enabledFeatures} />;
}
```

**关键点**：
- 运行时通过 `FeatureRegistry` 查询可用的 Features
- 可以根据配置过滤启用的 Features
- Feature 信息用于指导解析和渲染行为

---

## 2. Feature 配置系统

### 2.1 配置接口

`@supramark/core` 提供了配置相关的类型和工具：

```typescript
// Feature 配置
interface FeatureConfig {
  id: string;           // Feature ID
  enabled: boolean;     // 是否启用
  // Feature 特定选项（结构由具体 Feature 自己定义）
  // 仅在代码层面暴露为 unknown，调用方应使用强类型包装。
  options?: unknown;
}

// Supramark 全局配置
interface SupramarkConfig {
  /** Feature 列表：按需启用/禁用功能 */
  features?: FeatureConfig[];

  /** 全局配置选项（目前仅 cache / strict） */
  options?: {
    cache?: boolean;
    strict?: boolean;
  };

  /** 图表子系统配置（可选） */
  diagram?: SupramarkDiagramConfig;
}

// 为具体 Feature 提供强类型 options 的辅助类型
type FeatureConfigWithOptions<TOptions> =
  Omit<FeatureConfig, 'options'> & { options?: TOptions };
```

同时，core 还提供了一个泛型辅助函数，便于在运行时代码中以强类型方式获取 Feature 的 options：

```ts
import { getFeatureOptionsAs, type SupramarkConfig } from '@supramark/core';

interface MathFeatureOptions {
  engine?: 'katex' | 'mathjax';
}

function getMathOptions(config?: SupramarkConfig): MathFeatureOptions | undefined {
  return getFeatureOptionsAs<MathFeatureOptions>(config, '@supramark/feature-math');
}
```

### 2.2 配置工具函数

#### `createConfigFromRegistry()`

从 FeatureRegistry 生成默认配置：

```typescript
import { createConfigFromRegistry } from '@supramark/core';

// 生成默认配置（所有 Feature 启用）
const config = createConfigFromRegistry(true);

console.log(config);
// {
//   features: [
//     { id: '@supramark/feature-vega-lite', enabled: true },
//     { id: '@supramark/feature-mermaid', enabled: true },
//     // ...
//   ],
//   options: { cache: true, strict: false }
// }
```

#### `getEnabledFeatures()`

获取启用的 Feature 定义：

```typescript
import { getEnabledFeatures } from '@supramark/core';

const config: SupramarkConfig = {
  features: [
    { id: '@supramark/feature-vega-lite', enabled: true },
    { id: '@supramark/feature-mermaid', enabled: false },
  ],
};

const enabled = getEnabledFeatures(config);
// 返回: [vegaLiteFeature]（Mermaid 被禁用了）
```

#### `isFeatureEnabled()`

检查特定 Feature 是否启用：

```typescript
import { isFeatureEnabled } from '@supramark/core';

if (isFeatureEnabled(config, '@supramark/feature-vega-lite')) {
  // Vega-Lite 已启用
}
```

#### `getFeatureOptions()`

获取 Feature 的配置选项：

```typescript
import { getFeatureOptions } from '@supramark/core';

const options = getFeatureOptions(config, '@supramark/feature-mermaid');
// 返回: Feature 的 options 对象，如果未配置则返回 {}
```

### 2.3 配置桥梁：从 Registry 到运行时

#### 场景 1：自动生成配置

运行时包可以提供一个 Hook 来自动生成配置：

```typescript
// packages/rn/src/hooks/useSupramark.ts
import { useMemo } from 'react';
import { createConfigFromRegistry, type SupramarkConfig } from '@supramark/core';

export function useSupramark(userConfig?: Partial<SupramarkConfig>) {
  const config = useMemo(() => {
    // 从 Registry 生成默认配置
    const defaultConfig = createConfigFromRegistry(true);

    // 合并用户配置
    return {
      ...defaultConfig,
      ...userConfig,
      features: userConfig?.features || defaultConfig.features,
    };
  }, [userConfig]);

  return config;
}
```

#### 场景 2：选择性启用 Features

用户可以显式控制哪些 Features 启用：

```tsx
import { Supramark } from '@supramark/rn';
import type { SupramarkConfig } from '@supramark/core';
import {
  createGfmFeatureConfig,
  createMathFeatureConfig,
} from '@supramark/feature-gfm';

function MyComponent() {
  const config: SupramarkConfig = {
    features: [
      createGfmFeatureConfig(true, {
        tables: true,
        taskListItems: true,
        strikethrough: true,
      }),
      createMathFeatureConfig(false),
    ],
  };

  return (
    <Supramark
      markdown="# Hello\n```vega-lite\n...\n```"
      config={config}
    />
  );
}
```

#### 场景 3：动态配置

根据用户权限或应用状态动态调整配置：

```tsx
import { Supramark } from '@supramark/rn';
import { createConfigFromRegistry } from '@supramark/core';

function SecureMarkdown({ markdown, userPermissions }) {
  const config = useMemo(() => {
    const base = createConfigFromRegistry(false); // 默认全部禁用

    // 根据权限启用 Features
    return {
      ...base,
      features: base.features?.map((f) => ({
        ...f,
        enabled: userPermissions.includes(f.id),
      })),
    };
  }, [userPermissions]);

  return <Supramark markdown={markdown} config={config} />;
}
```

---

## 3. 运行时包集成

### 3.1 React Native 包 (`@supramark/rn`)

#### 初始化流程

```typescript
// packages/rn/src/index.ts
export { initSupramarkRN, getAvailableFeatures } from './init';
export { Supramark } from './components/Supramark';
export { useSupramark } from './hooks/useSupramark';
```

#### 应用入口集成

```tsx
// app/App.tsx
import { initSupramarkRN } from '@supramark/rn';
import { FeatureRegistry } from '@supramark/core';

// 在应用启动时初始化
initSupramarkRN();

// 可选：注册自定义 Features
FeatureRegistry.register(myCustomFeature);

export default function App() {
  // ...
}
```

#### 组件使用

```tsx
// app/screens/MarkdownScreen.tsx
import { Supramark } from '@supramark/rn';
import { useSupramark } from '@supramark/rn';

function MarkdownScreen() {
  const config = useSupramark({
    features: [
      { id: '@supramark/feature-vega-lite', enabled: true },
      { id: '@supramark/feature-mermaid', enabled: true },
    ],
  });

  return (
    <Supramark
      markdown={markdownContent}
      config={config}
    />
  );
}
```

---

## 3. Feature × 语法家族矩阵

为了在工程和文档层面更好地组织 Feature，本项目引入了一个轻量级的「语法家族」概念，记录在每个 Feature 的 `metadata.syntaxFamily` 字段中：

```ts
interface FeatureMetadata {
  // ...
  syntaxFamily?: 'main' | 'container' | 'fence';
}
```

含义如下：

- `main`     ：主体 Markdown 语法（原始规范，GFM / Math / Emoji / 脚注等均使用该族），对应 `core/src/syntax/main.ts`；
- `container`：基于 `:::name ... :::` 的容器语法（admonition / html / map 等），由 `core/src/syntax/container.ts` 统一处理；
- `fence`    ：基于 ```lang 代码块的语法（diagram 等），通常复用统一图表管线，由 `core/src/syntax/fence.ts` 统一处理。

当前内置 Feature 的分布情况：

| Feature ID                           | 语法家族      | 主要语法形式                      |
|-------------------------------------|---------------|-----------------------------------|
| `@supramark/feature-core-markdown`  | `main`        | 标题/段落/列表/代码块等基础语法   |
| `@supramark/feature-footnote`       | `main`        | `[^1]` + 脚注定义块               |
| `@supramark/feature-definition-list`| `main`        | 定义列表（Term + `:` 描述）       |
| `@supramark/feature-gfm`            | `main`        | `~~删除线~~`、任务列表、表格      |
| `@supramark/feature-math`           | `main`        | `$...$` / `$$...$$`               |
| `@supramark/feature-emoji`          | `main`        | `:smile:` 等短代码                |
| `@supramark/feature-admonition`     | `container`   | `::: note` / `::: warning` 等     |
| `@supramark/feature-html-page`      | `container`   | `:::html`                         |
| `@supramark/feature-map`            | `container`   | `:::map`                          |
| `@supramark/feature-diagram-vega-lite` | `fence`    | ```vega-lite / ```vega / ```chart |
| `@supramark/feature-diagram-echarts`   | `fence`    | ```echarts                        |
| `@supramark/feature-diagram-plantuml`  | `fence`    | ```plantuml                       |
| `@supramark/feature-diagram-dot`       | `fence`    | ```dot / ```graphviz             |

> 说明：语法家族目前主要用于**分类与文档**，但在解析层已经对应到具体模块：
> - main → `core/src/syntax/main.ts`
> - container → `core/src/syntax/container.ts`
> - fence → `core/src/syntax/fence.ts`
>
> 三者共同由 `parseMarkdown` 这一入口函数调度，最终输出一棵统一的 Supramark AST。


### 3.2 React Web 包 (`@supramark/web`)

集成方式类似，但可能有不同的初始化需求：

```typescript
// packages/web/src/index.ts
export { initSupramarkWeb, getAvailableFeatures } from './init';
export { Supramark } from './components/Supramark';
export { useSupramark } from './hooks/useSupramark';
```

---

## 4. 使用示例

### 4.1 完整的 Feature 定义与注册流程

#### Step 1: 定义 Feature

```typescript
// packages/features/fence/feature-vega-lite/src/feature.ts
import type { SupramarkFeature, DiagramNode } from '@supramark/core';

export const vegaLiteFeature: SupramarkFeature<DiagramNode> = {
  metadata: {
    id: '@supramark/feature-vega-lite',
    name: 'Vega-Lite',
    version: '0.1.0',
    description: 'Vega-Lite 数据可视化支持',
    tags: ['diagram', 'chart', 'visualization'],
  },
  syntax: {
    ast: {
      type: 'diagram',
      selector: (node) =>
        node.type === 'diagram' &&
        ['vega-lite', 'vega'].includes(node.engine),
      interface: {
        required: ['type', 'engine', 'code'],
        optional: ['title', 'width', 'height'],
        fields: {
          type: { type: 'string', description: 'Node type (diagram)' },
          engine: { type: 'string', description: 'Rendering engine (vega-lite/vega)' },
          code: { type: 'string', description: 'Vega-Lite JSON spec' },
        },
      },
    },
  },
};
```

#### Step 2: 注册到 Registry

```typescript
// packages/core/src/builtin-features.ts
import { FeatureRegistry } from './feature';
import { vegaLiteFeature } from '@supramark/feature-vega-lite';

export function registerBuiltinFeatures(): void {
  FeatureRegistry.register(vegaLiteFeature);
}
```

#### Step 3: 运行时包初始化

```typescript
// packages/rn/src/init.ts
import { registerBuiltinFeatures } from '@supramark/core/builtin-features';

export function initSupramarkRN(): void {
  registerBuiltinFeatures();
  // 其他初始化...
}
```

#### Step 4: 应用使用

```tsx
// app/App.tsx
import { initSupramarkRN } from '@supramark/rn';

initSupramarkRN();

export default function App() {
  return <NavigationContainer>{/* ... */}</NavigationContainer>;
}
```

```tsx
// app/screens/ChartDemo.tsx
import { Supramark } from '@supramark/rn';

function ChartDemo() {
  const markdown = `
# Vega-Lite Chart

\`\`\`vega-lite
{
  "data": {"values": [{"x": 1, "y": 2}, {"x": 2, "y": 3}]},
  "mark": "point",
  "encoding": {"x": {"field": "x"}, "y": {"field": "y"}}
}
\`\`\`
  `;

  return <Supramark markdown={markdown} />;
}
```

### 4.2 自定义 Feature 的完整流程

```typescript
// app/features/custom-todo.ts
import { FeatureRegistry } from '@supramark/core';
import type { SupramarkFeature } from '@supramark/core';

// 1. 定义自定义 Feature
const todoFeature: SupramarkFeature<any> = {
  metadata: {
    id: '@myapp/todo',
    name: 'Todo List',
    version: '1.0.0',
  },
  syntax: {
    ast: {
      type: 'todo-list',
    },
  },
};

// 2. 注册（在应用启动时）
export function registerCustomFeatures() {
  FeatureRegistry.register(todoFeature);
}
```

```tsx
// app/App.tsx
import { initSupramarkRN } from '@supramark/rn';
import { registerCustomFeatures } from './features/custom-todo';

initSupramarkRN();
registerCustomFeatures(); // 注册自定义 Features

export default function App() {
  // ...
}
```

### 4.3 按需启用 Features

```tsx
import { Supramark } from '@supramark/rn';
import type { SupramarkConfig } from '@supramark/core';
import {
  createCoreMarkdownFeatureConfig,
} from '@supramark/feature-core-markdown';
import {
  createGfmFeatureConfig,
} from '@supramark/feature-gfm';

function RestrictedMarkdown() {
  // 仅启用基础 Markdown 和 GFM，禁用其他扩展
  const config: SupramarkConfig = {
    features: [
      createCoreMarkdownFeatureConfig(true),
      createGfmFeatureConfig(true, {
        tables: true,
        taskListItems: true,
        strikethrough: true,
      }),
      // 其他 Feature 不在列表中 → 默认按未配置处理
    ],
  };

  return <Supramark markdown={content} config={config} />;
}
```

---

## 5. 常见问题

### Q1: Feature 何时被加载？

**A**: Feature 的"加载"分为两个阶段：
1. **定义加载**：Feature 定义作为 JavaScript 模块导入，遵循 ES 模块的加载规则（静态分析 + 按需加载）
2. **注册加载**：通过 `FeatureRegistry.register()` 显式注册，通常在运行时包初始化时调用

推荐做法：
- 内置 Features：在运行时包的初始化函数中统一注册
- 自定义 Features：在应用启动时（`App.tsx`）显式注册
- 可选 Features：延迟到实际需要时注册（按需加载）

### Q2: 运行时包如何构建 "available features" 列表？

**A**: 运行时包通过 `FeatureRegistry.list()` 获取已注册的所有 Features：

```typescript
import { FeatureRegistry } from '@supramark/core';

export function getAvailableFeatures() {
  return FeatureRegistry.list();
}
```

在 `<Supramark />` 组件中可以结合配置过滤：

```typescript
const availableFeatures = config
  ? getEnabledFeatures(config)
  : FeatureRegistry.list();
```

### Q3: 如何支持 Feature 的热加载/动态加载？

**A**: 可以通过动态 import 实现：

```typescript
async function loadFeatureOnDemand(featureId: string) {
  const feature = await import(`@supramark/feature-${featureId}`);
  FeatureRegistry.register(feature.default);
}
```

### Q4: 多个运行时包（RN + Web）如何共享 Feature 定义？

**A**: Feature 定义在 `@supramark/core` 或独立的 Feature 包中，不依赖平台：

```
@supramark/core               ← 定义 Feature 接口
@supramark/feature-vega-lite  ← Feature 定义（纯元数据）
@supramark/rn                 ← RN 渲染实现
@supramark/web                ← Web 渲染实现
```

两个运行时包都可以注册相同的 Feature 定义，但提供各自的渲染实现。

---

## 6. 设计原则

1. **显式优于隐式**：Feature 必须显式注册，不自动扫描或注入
2. **按需加载**：支持动态 import，避免一次性加载所有 Features
3. **配置优先**：通过配置控制 Feature 启用/禁用，而非硬编码
4. **平台无关**：Feature 定义不依赖特定平台，渲染实现在运行时包中
5. **类型安全**：充分利用 TypeScript 类型系统保障正确性

---

## 7. 内置 & 扩展 Feature 能力矩阵

> 本节用于快速总览当前已经存在的 Feature 定义，方便运行时配置与能力发现。  
> 仅列出已经在代码中落地（有 SupramarkFeature 实现）的能力。

### 7.1 图表 / Diagram 相关

| Feature ID                             | 名称                          | AST / 选择器                            | 所在包             | RN 支持 | Web 支持 | 备注 |
|----------------------------------------|-------------------------------|-----------------------------------------|--------------------|---------|----------|------|
| `@supramark/feature-diagram-vega-lite` | Diagram (Vega‑Lite)          | `diagram`，`engine ∈ {vega, vega-lite, chart, chartjs}` | `@supramark/feature-diagram-vega-lite`  | ✅ headless WebView + `vega-embed` → SVG | ✅ 浏览器端 `vega-embed` → SVG | 由宿主显式注册 |
| `@supramark/feature-diagram-echarts`   | Diagram (ECharts)            | `diagram`，`engine === 'echarts'`       | `@supramark/feature-diagram-echarts`    | ✅ headless WebView + ECharts SVG        | ✅ ECharts SVG 渲染                | 由宿主显式注册 |
| `@supramark/feature-diagram-plantuml`  | Diagram (PlantUML)           | `diagram`，`engine === 'plantuml'`      | `@supramark/feature-diagram-plantuml`   | ✅ WebView + 远端 PlantUML server → SVG   | ✅ 浏览器端远端 PlantUML server → SVG | 由宿主显式注册 |
| `@supramark/feature-diagram-dot`       | Diagram (DOT / Graphviz)     | `diagram`，`engine ∈ {dot, graphviz}`   | `@supramark/feature-diagram-dot`        | ⭕️ 仅解析，占位渲染                       | ⭕️ 仅解析，占位渲染                 | 未来可接入 wasm / 外部服务生成 SVG |

> 上述四个 Feature 现在与其他 Feature 一样，作为独立包存在（`packages/features/fence/*`），  
> 需要由运行时（如 `@supramark/rn` / `@supramark/web` 或应用自身）显式注册。

### 7.2 数学公式 / Math

| Feature ID                   | 名称      | AST / 选择器                                         | 所在包                   | RN 支持 | Web 支持 | 注册方式 |
|------------------------------|-----------|------------------------------------------------------|--------------------------|---------|----------|----------|
| `@supramark/feature-math`    | Math      | `math_inline` / `math_block`（selector 两者皆真）    | `@supramark/feature-math` | ✅ headless WebView + MathJax → SVG | ✅ KaTeX / MathJax 管线         | 由宿主显式 `FeatureRegistry.register(mathFeature)` |

### 7.3 脚注 / Footnote

| Feature ID                        | 名称       | AST / 选择器                                                          | 所在包                        | RN 支持 | Web 支持 | 注册方式 |
|-----------------------------------|------------|------------------------------------------------------------------------|--------------------------------|---------|----------|----------|
| `@supramark/feature-footnote`     | Footnote   | `footnote_reference` / `footnote_definition`（selector 同时匹配两者） | `@supramark/feature-footnote` | ✅ 占位渲染（正文 `[n]` + 文末定义行） | ✅ 占位渲染（`<sup>[n]</sup>` + 段落） | 由宿主显式注册 |

### 7.4 定义列表 / Definition List

| Feature ID                               | 名称            | AST / 选择器                | 所在包                               | RN 支持 | Web 支持 | 注册方式 |
|------------------------------------------|-----------------|-----------------------------|---------------------------------------|---------|----------|----------|
| `@supramark/feature-definition-list`     | Definition List | `definition_list`           | `@supramark/feature-definition-list` | ✅ term/description 列表布局 | ✅ 语义化 `<dl><dt><dd>` | 由宿主显式注册 |

### 7.5 提示框 / 容器块 / Admonition

| Feature ID                        | 名称        | AST / 选择器         | 所在包                        | RN 支持 | Web 支持 | 注册方式 |
|-----------------------------------|-------------|----------------------|--------------------------------|---------|----------|----------|
| `@supramark/feature-admonition`   | Admonition  | `admonition` 节点    | `@supramark/feature-admonition` | ✅ 简单默认样式（kind + title） | ✅ `<div class="admonition admonition-{kind}">` | 由宿主显式注册 |

### 7.6 Emoji / 短代码

| Feature ID                    | 名称    | AST / 选择器                  | 所在包                   | RN 支持 | Web 支持 | 说明 |
|-------------------------------|---------|-------------------------------|--------------------------|---------|----------|------|
| `@supramark/feature-emoji`    | Emoji   | `text` 节点（value 中可能含 Emoji） | `@supramark/feature-emoji` | ✅ 直接渲染 `text.value` 中的 emoji | ✅ 同上 | 不新增 AST 类型，仅描述 `markdown-it-emoji` 的行为 |

> Emoji Feature 本质上是对「短代码 → Unicode」这一行为的规范化描述，  
> 解析与渲染层面无需额外组件，纯配置层开关。

---

## 8. 后续优化方向

- [ ] 支持 Feature 依赖关系（A Feature 依赖 B Feature）
- [ ] 支持 Feature 版本兼容性检查
- [ ] 提供 Feature 注册的 DevTools / Inspector
- [ ] 支持 Feature 的异步加载和 Suspense
- [ ] 提供 Feature 使用统计和性能分析工具
