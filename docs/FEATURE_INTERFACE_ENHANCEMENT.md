# Feature Interface 类型强化与验证增强

> 版本: v1.0.0
> 更新日期: 2025-12-05

## 概述

本次更新对 Feature Interface 进行了全面的类型强化和验证增强，通过**更严格的类型定义 + 增强的验证函数 + Linter 工具 + CI 自动化**，强制统一规范，保障整个库的健康演进。

## 核心改进

### 1. 强化 Feature Interface 类型定义

#### 1.1 FeatureMetadata 强化

**改进前**：
```typescript
export interface FeatureMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: string;
  // ...
}
```

**改进后**：
```typescript
export interface FeatureMetadata {
  /**
   * 功能唯一标识符
   *
   * 格式: @scope/feature-name
   * 示例: @supramark/feature-math
   *
   * @pattern ^@[\w-]+\/feature-[\w-]+$
   */
  id: string;

  /**
   * 版本号（语义化版本）
   *
   * 格式: x.y.z
   * 示例: 1.0.0, 0.1.0
   *
   * @pattern ^\d+\.\d+\.\d+$
   */
  version: string;

  /**
   * 标签（用于分类）
   *
   * 建议至少添加一个标签，用于 Feature 的分类和搜索
   * 示例: ['math', 'latex', 'formula']
   */
  tags?: string[];

  // ... 其他字段
}
```

**强制规范**：
- `id`: 必须符合 `@scope/feature-name` 格式
- `version`: 必须符合语义化版本格式 x.y.z
- `name`: 不能为空
- `description`: 强烈建议填写（生产环境必需）
- `author`: 强烈建议填写
- `license`: 应该设置为 'Apache-2.0'
- `tags`: 建议至少添加一个标签

#### 1.2 ASTNodeDefinition 强化

**改进前**：
```typescript
export interface ASTNodeDefinition<TNode extends SupramarkNode> {
  type: string;
  selector?: (node: SupramarkNode) => boolean;
  interface?: NodeInterface<TNode>;
  constraints?: NodeConstraints;
  examples?: TNode[];
}
```

**改进后**：
```typescript
export interface ASTNodeDefinition<TNode extends SupramarkNode> {
  /**
   * 节点类型名称
   *
   * 必需，不能为空
   * 示例: 'math_inline', 'diagram', 'footnote_reference'
   */
  type: string;

  /**
   * 节点选择器（可选）
   *
   * 如果 Feature 处理多节点类型，应该提供 selector 函数。
   */
  selector?: (node: SupramarkNode) => boolean;

  /**
   * 节点接口（TypeScript 类型）
   *
   * 对于生产 Feature 强烈建议定义，用于文档、验证和类型安全
   */
  interface?: NodeInterface<TNode>;

  /**
   * 示例节点
   *
   * 建议提供至少一个示例节点，用于文档和测试
   */
  examples?: TNode[];

  /**
   * 多节点类型提示（可选）
   *
   * 如果此 Feature 处理多种节点类型，在这里说明
   */
  multiNodeNote?: string;
}
```

**强制规范**：
- `type`: 必须定义，不能为空
- `interface`: 对于生产 Feature 强烈建议定义
- `examples`: 建议提供至少一个示例节点
- `multiNodeNote`: 如果处理多节点类型，应该说明

#### 1.3 NodeInterface 强化

**改进前**：
```typescript
export interface NodeInterface<TNode> {
  required: Array<keyof TNode>;
  optional?: Array<keyof TNode>;
  fields: Record<string, FieldDefinition>;
}
```

**改进后**：
```typescript
/**
 * 节点接口定义
 *
 * **强制规范**：
 * - required: 不应该只包含 'type'，应该包含节点的关键字段
 * - fields: 应该定义所有 required 字段的类型和描述
 */
export interface NodeInterface<TNode> {
  /**
   * 节点的必需字段
   *
   * 不应该只包含 'type'，应该包含节点的关键字段
   * 示例: ['type', 'index', 'label'] 而不是 ['type']
   */
  required: Array<keyof TNode>;

  /**
   * 节点的可选字段
   */
  optional?: Array<keyof TNode>;

  /**
   * 字段类型描述
   *
   * 应该定义所有 required 字段的类型和描述
   */
  fields: Record<string, FieldDefinition>;
}
```

**强制规范**：
- `required`: 不应该只包含 'type'
- `fields`: 应该定义所有 required 字段

#### 1.4 SupramarkFeature 强化

**改进前**：
```typescript
export interface SupramarkFeature<TNode extends SupramarkNode = SupramarkNode> {
  metadata: FeatureMetadata;
  syntax: SyntaxDefinition<TNode>;
  renderers: RendererDefinitions<TNode>;
  testing?: TestingDefinition<TNode>;
  documentation?: DocumentationDefinition;
  // ...
}
```

**改进后**：
```typescript
/**
 * Supramark 功能的顶层接口（生产环境）
 *
 * **强制规范**：
 * - metadata: 必需，所有字段都应填写完整
 * - syntax: 必需，必须包含完整的 AST 定义和 interface
 * - renderers: 必需，至少应该定义一个平台的渲染器
 * - testing: 强烈建议提供（用于保障质量）
 * - documentation: 强烈建议提供（用于用户参考）
 */
export interface SupramarkFeature<TNode extends SupramarkNode = SupramarkNode> {
  metadata: FeatureMetadata;
  syntax: SyntaxDefinition<TNode>;
  renderers: RendererDefinitions<TNode>;
  testing?: TestingDefinition<TNode>;
  documentation?: DocumentationDefinition;
  // ...
}
```

**强制规范**：
- `metadata`: 必需，所有字段都应填写完整
- `syntax`: 必需，必须包含完整的 AST 定义和 interface
- `renderers`: 必需，至少应该定义一个平台的渲染器
- `testing`: 强烈建议提供
- `documentation`: 强烈建议提供

### 2. 增强 validateFeature 验证函数

#### 2.1 新的函数签名

**改进后**：
```typescript
export function validateFeature(
  feature: SupramarkFeature<any>,
  options: {
    /** 严格模式（将警告视为错误） */
    strict?: boolean;
    /** 是否为生产环境（更严格的要求） */
    production?: boolean;
  } = {}
): {
  valid: boolean;
  errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
}
```

#### 2.2 验证规则（与 Linter 对齐）

**Critical Rules（错误级别）**：
- `metadata-id-format`: Feature ID 必须符合 @scope/feature-name 格式
- `metadata-version-semver`: 版本号必须符合语义化版本格式
- `metadata-name-required`: Feature name 不能为空
- `ast-type-required`: AST 节点 type 必须定义

**Warning Rules（警告级别）**：
- `metadata-description-required`: Feature description 不能为空
- `metadata-author-required`: Feature author 建议填写
- `metadata-license-required`: Feature license 应该设置
- `ast-interface-required-nonempty`: AST interface.required 不应只包含 type
- `ast-interface-fields-defined`: AST interface.fields 应该定义所有 required 字段
- `selector-multi-node-with-function`: 如果 Feature 处理多节点类型，应该提供 selector 函数

**Info Rules（建议级别）**：
- `metadata-tags-nonempty`: Feature tags 建议添加至少一个标签
- `ast-examples-provided`: AST examples 应该提供至少一个示例节点
- `metadata-license-apache`: Feature license 应该设置为 Apache-2.0

**Production Mode Extra Checks**：
- `ast-interface-required-production`: 生产环境的 Feature 必须定义完整的 AST interface
- `renderers-required-production`: 生产环境的 Feature 必须定义至少一个平台的渲染器
- `testing-recommended-production`: 生产环境的 Feature 强烈建议提供测试定义

#### 2.3 使用示例

```typescript
import { validateFeature } from '@supramark/core';

// 基本验证
const result1 = validateFeature(myFeature);
console.log(result1.valid); // true/false
console.log(result1.errors); // 错误列表

// 严格模式（警告也算错误）
const result2 = validateFeature(myFeature, { strict: true });

// 生产模式（更严格的要求）
const result3 = validateFeature(myFeature, { production: true });

// 严格 + 生产模式
const result4 = validateFeature(myFeature, { strict: true, production: true });

// 查看具体错误
result4.errors.forEach((error) => {
  console.log(`[${error.severity}] ${error.code}: ${error.message}`);
});
```

## 质量保障体系完整架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Feature 质量保障体系                      │
└─────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  类型定义层   │   │  运行时验证   │   │  静态检查层   │
│              │   │              │   │              │
│ FeatureMetadata│  │ validateFeature│  │ Feature Linter│
│ ASTNodeDef   │   │   函数        │   │   工具        │
│ NodeInterface│   │              │   │              │
│              │   │ - 基本模式   │   │ - 14 条规则  │
│ 强化的类型   │   │ - 严格模式   │   │ - 质量评分   │
│ 注释和规范   │   │ - 生产模式   │   │ - 错误报告   │
└──────────────┘   └──────────────┘   └──────────────┘
        │                    │                    │
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                  ┌──────────────────┐
                  │   CI/CD 自动化    │
                  │                  │
                  │ - 类型检查       │
                  │ - Feature Linter │
                  │ - 单元测试       │
                  │ - 代码覆盖率     │
                  └──────────────────┘
```

## 三层防护机制

### 第一层：TypeScript 类型系统

**作用**：编译时类型检查

**保障内容**：
- 字段必需性（required/optional）
- 字段类型正确性
- 接口实现完整性
- 泛型类型约束

**优点**：
- IDE 即时反馈
- 编译时捕获错误
- 零运行时开销

**局限**：
- 无法验证字符串格式（如 ID 格式）
- 无法验证字段值的业务逻辑
- 无法检查文件存在性

### 第二层：运行时验证（validateFeature）

**作用**：运行时动态验证

**保障内容**：
- ID 格式（正则表达式）
- 版本号格式（semver）
- 字段值有效性
- 业务逻辑规则

**优点**：
- 可以验证复杂的业务规则
- 提供详细的错误信息
- 支持多种模式（基本/严格/生产）

**局限**：
- 需要主动调用
- 运行时开销

### 第三层：静态检查（Feature Linter + CI）

**作用**：开发时和 CI 中的静态分析

**保障内容**：
- 所有类型规则
- 所有运行时规则
- 文件结构完整性
- 测试文件存在性
- 文档完整性

**优点**：
- 最全面的检查
- 可以检查文件系统
- CI 自动化
- 质量评分

**局限**：
- 需要手动运行（或依赖 CI）

## 使用指南

### 1. 开发新 Feature

#### 步骤 1：使用 CLI 工具创建

```bash
npm run create-feature -- \
  -n "My Feature" \
  -t "my_node" \
  -d "My feature description"
```

CLI 工具会自动生成符合所有规范的代码。

#### 步骤 2：开发过程中验证

```typescript
import { validateFeature } from '@supramark/core';
import { myFeature } from './feature';

// 基本验证
const result = validateFeature(myFeature);
if (!result.valid) {
  console.error('Feature 验证失败：');
  result.errors.forEach((error) => {
    console.error(`  [${error.severity}] ${error.message}`);
  });
}
```

#### 步骤 3：提交前静态检查

```bash
# Feature Linter 检查
npm run lint:features my-feature

# 类型检查
cd packages/features/main/feature-my-feature && npm run build

# 运行测试
npm test
```

#### 步骤 4：CI 自动检查

推送代码后，GitHub Actions 会自动运行所有检查。

### 2. 更新现有 Feature

#### 步骤 1：检查现状

```bash
npm run lint:features my-feature
```

#### 步骤 2：根据错误修复

根据 Linter 输出逐项修复：
- ❌ 错误（Critical）- 必须修复
- ⚠️ 警告（Warning）- 强烈建议修复
- 💡 建议（Info）- 最佳实践

#### 步骤 3：再次验证

```bash
npm run lint:features my-feature
```

确保所有错误都已修复。

### 3. 在运行时使用验证

```typescript
import { FeatureRegistry, validateFeature } from '@supramark/core';

// 注册 Feature 前验证
function registerFeature(feature: SupramarkFeature) {
  const result = validateFeature(feature, { production: true });

  if (!result.valid) {
    const errors = result.errors.filter((e) => e.severity === 'error');
    throw new Error(`Feature 验证失败：\n${errors.map((e) => e.message).join('\n')}`);
  }

  FeatureRegistry.register(feature);
}

// 列出所有 Feature 并验证
FeatureRegistry.list().forEach((feature) => {
  const result = validateFeature(feature);
  console.log(`${feature.metadata.id}: ${result.valid ? '✅' : '❌'}`);
});
```

## 最佳实践

### 1. 完整填写 Metadata

```typescript
metadata: {
  id: '@supramark/feature-math',           // ✅ 符合格式
  name: 'Math Formula',                    // ✅ 清晰的名称
  version: '1.0.0',                        // ✅ 语义化版本
  author: 'Supramark Team',                // ✅ 填写作者
  description: 'LaTeX 数学公式支持',        // ✅ 清晰的描述
  license: 'Apache-2.0',                   // ✅ 统一许可证
  tags: ['math', 'latex', 'formula'],      // ✅ 有助于分类
}
```

### 2. 定义完整的 AST Interface

```typescript
interface: {
  required: ['type', 'value'],             // ✅ 包含关键字段
  optional: ['katexOptions'],
  fields: {
    type: {
      type: 'string',
      description: 'Node type identifier',
    },
    value: {
      type: 'string',
      description: 'LaTeX expression',
    },
    katexOptions: {
      type: 'object',
      description: 'KaTeX rendering options',
    },
  },
}
```

### 3. 提供示例和文档

```typescript
examples: [
  {
    type: 'math_inline',
    value: 'E = mc^2',
  },
  {
    type: 'math_inline',
    value: '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  },
]
```

### 4. 使用 TypeScript 严格模式

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

## 对比：改进前后

### 类型定义

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| Metadata 注释 | 简单 | 详细的格式说明和示例 |
| ID 格式约束 | 无 | @pattern 注释 + 运行时验证 |
| Version 约束 | 无 | semver 格式说明 + 验证 |
| AST 规范说明 | 简单 | 强制规范说明 |
| Interface 约束 | 无 | 明确的字段要求 |

### 验证函数

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| 验证规则数量 | 4 条 | 14+ 条 |
| 错误信息 | 简单字符串 | 结构化（code + message + severity） |
| 验证模式 | 单一模式 | 基本/严格/生产 三种模式 |
| 与 Linter 对齐 | 否 | 是 |
| 错误分类 | 无 | error/warning/info |

### 质量保障

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| 类型检查 | ✅ 基本 | ✅ 强化 |
| 运行时验证 | ⚠️ 基础 | ✅ 完整 |
| 静态检查工具 | ❌ 无 | ✅ Feature Linter |
| CI 自动化 | ❌ 无 | ✅ GitHub Actions |
| 质量评分 | ❌ 无 | ✅ 100 分制 |

## 常见问题

### Q: 为什么需要三层防护？

A: 每层都有其独特的优势和局限：
- **类型系统**：编译时检查，零运行时开销，但无法验证格式
- **运行时验证**：可以验证复杂规则，但需要主动调用
- **静态检查**：最全面，但需要手动运行或依赖 CI

三层结合才能提供最全面的质量保障。

### Q: MinimalFeature 和 SupramarkFeature 有什么区别？

A: 早期版本中存在 **MinimalFeature** 作为快速原型接口，只要求 metadata + AST；  
现在已经统一收敛为 **SupramarkFeature**，所有新功能都应实现完整的 SupramarkFeature，并通过 `validateFeature` 保证质量。

### Q: 严格模式和生产模式的区别？

A:
- **严格模式（strict）**：将警告视为错误
- **生产模式（production）**：添加额外的生产环境检查（如必须有 renderers）

可以组合使用：`validateFeature(feature, { strict: true, production: true })`

### Q: 如何处理现有 Feature 不符合新规范的情况？

A: 渐进式迁移：
1. 先运行 `npm run lint:features` 查看现状
2. 优先修复所有错误（❌）
3. 然后修复警告（⚠️）
4. 最后考虑建议（💡）

不需要一次性全部修复，可以分批进行。

### Q: validateFeature 和 Feature Linter 有什么区别？

A:
- **validateFeature**：运行时函数，可以在代码中调用，用于动态验证
- **Feature Linter**：静态分析工具，用于开发时和 CI 中检查

两者规则对齐，但使用场景不同。

## 相关文档

- [Feature Interface 接口定义](../packages/core/src/feature.ts)
- [Feature 质量保障体系](./FEATURE_QUALITY_ASSURANCE.md)
- [Feature Linter 使用指南](./FEATURE_QUALITY_ASSURANCE.md#使用指南)
- [CLI 工具使用指南](./CHANGELOG_CLI_v0.2.1.md)

## 版本历史

- **v1.0.0** (2025-12-05) - 初始版本
  - 强化 FeatureMetadata 类型定义
  - 强化 ASTNodeDefinition 和 NodeInterface 类型定义
  - 强化 SupramarkFeature 接口
  - 增强 validateFeature 验证函数（14+ 条规则）
  - 添加严格模式和生产模式
  - 与 Feature Linter 规则对齐

---

**Breaking Changes**：无（完全向后兼容）

**升级建议**：
- 新 Feature：直接使用新的类型定义和验证函数
- 现有 Feature：可选择性更新以符合新规范，使用 Linter 工具检查
