# Supramark v0.1.1 更新日志

> 发布日期：2025-12-05

## 概述

本次更新主要针对用户在实践中发现的两个核心问题，提供了完整的 Feature 配置系统和生命周期管理方案。

## 用户反馈的问题

### 1. FeatureRegistry 生命周期不清晰

**问题**：
- 在 core 中 register 的 feature 何时被加载？
- 运行时包（@supramark/rn / @supramark/web）是否会在初始化时统一扫描注册好的 feature，用来构建「available features」列表？

### 2. 缺少配置桥梁

**问题**：
- FeatureNodeType<F> 目前只是一个类型工具
- 后面如果希望给 `<Supramark />` 提供「仅开启某些 Feature」的配置，需要一个从 FeatureRegistry → 配置 schema 的桥梁

## 解决方案

### 1. 新增 Feature 配置系统

在 `@supramark/core/src/feature.ts` 中新增配置相关的接口和工具：

#### 配置接口

```typescript
// Feature 运行时配置
export interface FeatureConfig {
  id: string;           // Feature ID
  enabled: boolean;     // 是否启用
  // Feature 特定选项（结构由具体 Feature 定义）
  options?: unknown;
}

// Supramark 全局配置
export interface SupramarkConfig {
  features?: FeatureConfig[];  // Feature 列表
  options?: {
    cache?: boolean;
    strict?: boolean;
  };
  // v0.1.1 之后新增：图表子系统配置（向后兼容，可选）
  diagram?: SupramarkDiagramConfig;
}
```

#### 配置工具函数

```typescript
// 从 FeatureRegistry 生成默认配置
export function createConfigFromRegistry(enabledByDefault?: boolean): SupramarkConfig;

// 获取启用的 Feature ID 列表
export function getEnabledFeatureIds(config: SupramarkConfig): string[];

// 获取启用的 Feature 定义列表
export function getEnabledFeatures(config: SupramarkConfig): Array<SupramarkFeature<any> | MinimalFeature<any>>;

// 检查特定 Feature 是否启用
export function isFeatureEnabled(config: SupramarkConfig, featureId: string): boolean;

// 获取 Feature 的配置选项
export function getFeatureOptions(config: SupramarkConfig, featureId: string): Record<string, any>;
```

### 2. 生命周期管理文档

创建了详细的文档 `docs/FEATURE_LIFECYCLE_AND_CONFIG.md`，说明：

- **Feature 定义阶段**：编译时定义 Feature 元数据
- **Feature 注册阶段**：初始化时通过 `FeatureRegistry.register()` 注册
- **Feature 使用阶段**：运行时通过配置查询和过滤 Features

#### 生命周期流程

```
Feature 定义（编译时）
    ↓
Feature 注册（初始化时）
    ↓
Feature 使用（运行时）
```

### 3. 运行时包集成指南

文档中提供了详细的集成示例：

#### 初始化流程

```typescript
// packages/rn/src/init.ts
import { registerBuiltinFeatures } from '@supramark/core/builtin-features';

export function initSupramarkRN(): void {
  // 注册所有内置 Features
  registerBuiltinFeatures();
  // 其他初始化...
}
```

#### 应用入口

```tsx
// app/App.tsx
import { initSupramarkRN } from '@supramark/rn';

initSupramarkRN();

export default function App() {
  // ...
}
```

#### 组件使用

```tsx
// app/screens/MarkdownScreen.tsx
import { Supramark } from '@supramark/rn';
import { type SupramarkConfig } from '@supramark/core';

function MarkdownScreen() {
  const config: SupramarkConfig = {
    features: [
      { id: '@supramark/feature-vega-lite', enabled: true },
      { id: '@supramark/feature-mermaid', enabled: true },
      { id: '@supramark/feature-plantuml', enabled: false },
    ],
  };

  return <Supramark markdown={content} config={config} />;
}
```

## 新增内容

### 1. 代码新增

- `packages/core/src/feature.ts`：新增配置系统（~120 行代码）
  - `FeatureConfig` 接口
  - `SupramarkConfig` 接口
  - 5 个配置工具函数

### 2. 测试新增

- `packages/core/__tests__/feature-config.test.ts`：完整的配置系统测试
  - 14 个测试用例
  - 覆盖所有配置函数
  - 包含集成测试

### 3. 文档新增

- `docs/FEATURE_LIFECYCLE_AND_CONFIG.md`（~400 行）
  - Feature Registry 生命周期详解
  - Feature 配置系统说明
  - 运行时包集成指南
  - 完整使用示例
  - 常见问题解答

- `docs/CHANGELOG_v0.1.1.md`（本文件）
  - 本次更新的完整记录

### 4. 文档更新

- `docs/FEATURE_INTERFACE_IMPROVEMENTS.md`
  - 新增配置系统章节
  - 更新版本历史

## 测试结果

### 单元测试

```
Test Suites: 3 passed, 3 total
Tests:       47 passed, 47 total
```

所有测试全部通过，包括新增的 14 个配置系统测试。

### 测试覆盖率

```
File       | Stmts | Branch | Funcs | Lines
-----------|-------|--------|-------|-------
feature.ts | 61.1% | 54.3%  | 73.9% | 58.8%
All files  | 56.7% | 38.2%  | 65.1% | 56.8%
```

配置系统函数覆盖率达到 61%+，函数覆盖率达到 73.9%。

### 编译检查

所有包编译成功：
- ✅ @supramark/core
- ✅ @supramark/rn
- ✅ @supramark/rn-diagram-worker
- ✅ @supramark/web

### 质量评分

```
总分: 91/100 - 优秀！工程质量非常高
```

## 使用示例

### 基础使用

```typescript
import { FeatureRegistry, createConfigFromRegistry } from '@supramark/core';

// 注册 Features（在运行时包初始化时）
FeatureRegistry.register(vegaLiteFeature);
FeatureRegistry.register(mermaidFeature);

// 生成默认配置
const config = createConfigFromRegistry(true);
```

### 自定义配置

```tsx
const config: SupramarkConfig = {
  features: [
    { id: '@supramark/feature-vega-lite', enabled: true, options: { theme: 'dark' } },
    { id: '@supramark/feature-mermaid', enabled: true },
    { id: '@supramark/feature-plantuml', enabled: false },
  ],
  options: {
    cache: true,
    strict: false,
  },
};

<Supramark markdown={content} config={config} />
```

### 动态配置

```tsx
function SecureMarkdown({ markdown, userPermissions }) {
  const config = useMemo(() => {
    const base = createConfigFromRegistry(false);
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

## API 变更

### 新增导出（Breaking Changes: 无）

从 `@supramark/core` 新增导出：

```typescript
export type { FeatureConfig, SupramarkConfig };
export {
  createConfigFromRegistry,
  getEnabledFeatureIds,
  getEnabledFeatures,
  isFeatureEnabled,
  getFeatureOptions,
};
```

所有新增的 API 都是向后兼容的，不会破坏现有代码。

## 迁移指南

### 对于运行时包开发者

如果你正在开发运行时包（如 `@supramark/rn` 或 `@supramark/web`），建议：

1. **创建初始化函数**：

```typescript
// packages/rn/src/init.ts
export function initSupramarkRN(): void {
  registerBuiltinFeatures();
}
```

2. **提供配置 Hook**：

```typescript
// packages/rn/src/hooks/useSupramark.ts
export function useSupramark(userConfig?: Partial<SupramarkConfig>) {
  return useMemo(() => {
    const defaultConfig = createConfigFromRegistry(true);
    return { ...defaultConfig, ...userConfig };
  }, [userConfig]);
}
```

3. **在组件中接受配置**：

```tsx
interface SupramarkProps {
  markdown: string;
  config?: SupramarkConfig;
}

export function Supramark({ markdown, config }: SupramarkProps) {
  const enabledFeatures = config
    ? getEnabledFeatures(config)
    : FeatureRegistry.list();
  // ...
}
```

### 对于应用开发者

无需迁移，现有代码继续工作。如果需要控制 Feature 启用状态：

```tsx
<Supramark
  markdown={content}
  config={{
    features: [
      { id: '@supramark/feature-vega-lite', enabled: true },
    ],
  }}
/>
```

## 后续优化方向

根据文档中的说明，后续可能的改进包括：

- [ ] 支持 Feature 依赖关系（A Feature 依赖 B Feature）
- [ ] 支持 Feature 版本兼容性检查
- [ ] 提供 Feature 注册的 DevTools / Inspector
- [ ] 支持 Feature 的异步加载和 Suspense
- [ ] 提供 Feature 使用统计和性能分析工具

## 相关文档

- [Feature 生命周期与配置管理](./FEATURE_LIFECYCLE_AND_CONFIG.md) ← **核心文档**
- [Feature Interface 改进说明](./FEATURE_INTERFACE_IMPROVEMENTS.md)
- [Feature Interface 接口定义](../packages/core/src/feature.ts)

## 贡献者

- Claude (AI Assistant)
- 用户反馈与需求分析

---

**发布检查清单**：

- [x] 代码编译通过
- [x] 测试全部通过
- [x] 覆盖率达标（56.7%+）
- [x] 质量评分优秀（91/100）
- [x] 文档完整且详细
- [x] API 向后兼容
- [x] 使用示例清晰
