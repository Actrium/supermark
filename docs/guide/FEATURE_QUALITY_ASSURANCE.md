# Supramark Feature 质量保障体系

> 版本: v1.0.0
> 更新日期: 2025-12-05

## 概述

随着 Feature Interface 的成熟稳定，我们建立了一套完整的质量保障体系，通过**类型检查 + Lint 工具 + CI 自动化**，强制统一规范，保障整个库的健康演进。

## 核心组成

### 1. Feature Interface 规范

严格的类型定义和接口规范（当前统一使用 SupramarkFeature）：

```typescript
// 完整 Feature（生产就绪）
interface SupramarkFeature<TNode> {
  metadata: FeatureMetadata; // 必需
  syntax: SyntaxDefinition<TNode>; // 必需
  renderers: RendererDefinitions; // 必需
  testing?: TestingDefinition; // 推荐
  documentation?: DocumentationDefinition; // 推荐
}
```

### 2. Feature Linter

自动化代码质量检查工具。

**检查维度**：

- ✅ **元数据完整性** - ID 格式、版本号、描述等
- ✅ **AST 定义准确性** - 节点类型、字段定义、示例等
- ✅ **代码质量** - 文档注释、测试文件等
- ✅ **包结构完整性** - 必需文件是否存在

**使用方式**：

```bash
# 检查所有 Feature 包
npm run lint:features

# 检查特定 Feature 包
npm run lint:features <feature-name>

# 严格模式（警告也会失败）
npm run lint:features:strict
```

### 3. CI/CD 自动化

GitHub Actions 工作流，在 PR 和推送时自动检查。

**检查项**：

- Feature Linter 检查
- TypeScript 类型检查
- 单元测试
- 代码覆盖率

## 检查规则详解

### Critical（错误级别）

这些规则**必须通过**，否则 CI 失败：

#### `metadata-id-format`

```
❌ Feature ID 必须符合 @scope/feature-name 格式

✅ 正确：@supramark/feature-math
❌ 错误：feature-math, @supramark/math
```

#### `metadata-version-semver`

```
❌ 版本号必须符合语义化版本格式（x.y.z）

✅ 正确：1.0.0, 0.1.0
❌ 错误：1.0, v1.0.0
```

#### `metadata-name-required`

```
❌ Feature name 不能为空

export const mathFeature: SupramarkFeature = {
  metadata: {
    name: 'Math Formula', // ✅ 必需
    // ...
  }
};
```

#### `ast-type-required`

```
❌ AST 节点 type 必须定义

syntax: {
  ast: {
    type: 'math_inline', // ✅ 必需
    // ...
  }
}
```

#### `testing-file-exists`

```
❌ Feature 必须有测试文件

必需文件: __tests__/feature.test.ts
```

#### `package-structure-complete`

```
❌ Feature 包必须包含所有必需文件

必需文件:
  - package.json
  - tsconfig.json
  - jest.config.cjs
  - src/index.ts
  - src/feature.ts
  - __tests__/feature.test.ts
  - README.md
```

### Warning（警告级别）

这些规则**强烈建议通过**，影响质量评分：

#### `metadata-description-required`

```
⚠️  Feature description 不能为空

metadata: {
  description: 'LaTeX 数学公式支持', // ✅ 应该提供
}
```

#### `metadata-license-required`

```
⚠️  Feature license 应该设置为 Apache-2.0

metadata: {
  license: 'Apache-2.0', // ✅ 统一许可证
}
```

#### `ast-interface-required-nonempty`

```
⚠️  AST interface.required 不应只包含 type

interface: {
  required: ['type'], // ❌ 太简单
  required: ['type', 'index', 'label'], // ✅ 完整
}
```

#### `ast-interface-fields-defined`

```
⚠️  AST interface.fields 应该定义所有 required 字段

interface: {
  required: ['type', 'index', 'label'],
  fields: {
    type: { ... },
    index: { ... },  // ✅ 所有 required 字段都有定义
    label: { ... },
  }
}
```

#### `selector-multi-node-with-function`

```
⚠️  如果 Feature 处理多节点类型，应该提供 selector 函数

// 当有多节点提示时
ast: {
  type: 'footnote_reference',
  selector: (node) =>  // ✅ 应该有 selector
    node.type === 'footnote_reference' ||
    node.type === 'footnote_definition',
}
```

#### `documentation-markdown-example`

````
⚠️  Feature 应该在注释中提供 Markdown 使用示例

/**
 * Math Feature
 *
 * @example
 * ```markdown
 * $E = mc^2$
 * ```
 */
````

### Info（建议级别）

这些规则是**最佳实践建议**：

#### `metadata-tags-nonempty`

```
💡 Feature tags 建议添加至少一个标签

metadata: {
  tags: ['math', 'latex', 'formula'], // ✅ 有助于分类和搜索
}
```

#### `ast-examples-provided`

```
💡 AST examples 应该提供至少一个示例节点

ast: {
  examples: [
    {
      type: 'math_inline',
      value: 'E = mc^2',
    }
  ],
}
```

## 质量评分机制

Linter 会根据检查结果计算质量评分：

```
基础分: 100 分
错误扣分: 每个错误 -10 分
警告扣分: 每个警告 -5 分
建议扣分: 每个建议 -2 分

最终分数 = max(0, 100 - 扣分总和)
```

**评分标准**：

- 90-100 分：优秀 ✅
- 70-89 分：良好 ⚠️
- 0-69 分：需要改进 ❌

## 使用指南

### 本地开发

#### 1. 创建新 Feature

使用 CLI 工具自动生成符合规范的代码：

```bash
npm run create-feature -- \
  -n "Math Formula" \
  -t "math_inline" \
  -d "LaTeX 数学公式支持"
```

生成的代码已经包含所有必需字段和文件。

#### 2. 开发过程中检查

随时运行 Linter 检查质量：

```bash
# 检查当前 Feature
npm run lint:features math

# 检查所有 Features
npm run lint:features
```

#### 3. 修复问题

根据 Linter 输出修复问题：

```bash
# 示例输出
❌ AST interface.required 不应只包含 type
⚠️  Feature description 不能为空
💡 Feature tags 建议添加至少一个标签
```

修复后再次运行检查：

```bash
npm run lint:features math
```

#### 4. 提交前检查

确保所有检查通过：

```bash
# Feature Linter
npm run lint:features

# TypeScript 类型检查
npm run build

# 运行测试
npm test
```

### CI/CD 集成

#### Pull Request 流程

1. **创建 PR** - 推送代码到分支
2. **自动检查** - GitHub Actions 自动运行
   - Feature Linter
   - TypeScript 类型检查
   - 单元测试
   - 代码覆盖率
3. **查看结果** - 在 PR 页面查看检查状态
4. **修复问题** - 如果检查失败，修复后重新推送
5. **合并 PR** - 所有检查通过后可以合并

#### 检查失败处理

如果 CI 检查失败：

```bash
# 1. 本地复现问题
npm run lint:features

# 2. 查看详细错误
npm run lint:features -- --strict

# 3. 修复问题
# 编辑相关文件...

# 4. 再次检查
npm run lint:features

# 5. 提交修复
git add .
git commit -m "fix: 修复 Feature 质量问题"
git push
```

## 最佳实践

### 1. 使用 CLI 工具创建 Feature

**✅ 推荐**：

```bash
npm run create-feature -- -n "My Feature" -t "my-node"
```

**❌ 不推荐**：手动创建文件和目录

**原因**：CLI 工具生成的代码已经符合所有规范。

### 2. 及早检查，频繁检查

**✅ 推荐**：开发过程中多次运行 Linter

```bash
# 每完成一个功能点就检查一次
npm run lint:features my-feature
```

**❌ 不推荐**：等到开发完成才检查

**原因**：早发现早修复，成本更低。

### 3. 完整填写元数据

**✅ 推荐**：

```typescript
metadata: {
  id: '@supramark/feature-math',
  name: 'Math Formula',
  version: '1.0.0',
  author: 'Supramark Team',
  description: 'LaTeX 数学公式支持',
  license: 'Apache-2.0',
  tags: ['math', 'latex', 'formula'],
},
```

**❌ 不推荐**：留空或使用 TODO

### 4. 定义完整的 AST Interface

**✅ 推荐**：

```typescript
interface: {
  required: ['type', 'value'],
  optional: ['katexOptions'],
  fields: {
    type: { type: 'string', description: 'Node type' },
    value: { type: 'string', description: 'LaTeX expression' },
    katexOptions: { type: 'object', description: 'KaTeX options' },
  },
},
```

**❌ 不推荐**：

```typescript
interface: {
  required: ['type'],  // 太简单
  fields: {
    type: { type: 'string', description: '...' },
    // 缺少其他字段
  },
},
```

### 5. 提供示例和文档

**✅ 推荐**：

````typescript
/**
 * @example
 * ```markdown
 * $E = mc^2$
 * ```
 */
export const mathFeature: SupramarkFeature = {
  // ...
  syntax: {
    ast: {
      // ...
      examples: [{ type: 'math_inline', value: 'E = mc^2' }],
    },
  },
};
````

## 故障排除

### 问题：Linter 报错但不知道如何修复

**解决方案**：

1. 查看错误消息中的规则名称
2. 在本文档中搜索规则名称
3. 查看规则说明和示例代码
4. 参考其他 Feature 的实现

### 问题：CI 检查失败但本地通过

**解决方案**：

```bash
# 1. 确保使用相同的 Node.js 版本
nvm use 20

# 2. 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 3. 运行完整的检查流程
npm run lint:features
npm run build
npm test
```

### 问题：质量评分太低

**解决方案**：

1. 查看具体的错误和警告
2. 优先修复所有❌错误
3. 然后修复⚠️警告
4. 最后考虑💡建议

## 工具命令速查

```bash
# Feature Linter
npm run lint:features              # 检查所有 Features
npm run lint:features <name>       # 检查特定 Feature
npm run lint:features:strict       # 严格模式

# Feature 管理
npm run create-feature             # 创建新 Feature
npm run update-feature             # 更新现有 Feature

# 质量检查
npm run build                      # TypeScript 编译
npm test                           # 运行测试
npm run quality                    # 完整质量检查

# 代码格式化
npm run lint                       # ESLint 检查
npm run lint:fix                   # ESLint 自动修复
npm run format                     # Prettier 格式化
```

## 相关文档

- [Feature Interface 接口定义](../packages/core/src/feature.ts)
- [Feature 创建指南](./CREATE_FEATURE_GUIDE.md)
- [Feature 生命周期与配置](./FEATURE_LIFECYCLE_AND_CONFIG.md)
- [CLI 工具使用指南](./CHANGELOG_CLI_v0.2.1.md)

## 常见问题

### Q: 为什么需要这么严格的检查？

A: 随着 Feature 数量增加，统一的规范能确保：

- 代码质量一致
- 易于维护和理解
- 减少 bug 和错误
- 提升开发效率

### Q: 我的 Feature 很简单，可以跳过某些检查吗？

A: 不建议。即使是简单的 Feature，也应该遵循基本规范。这样能：

- 保持代码库的整体一致性
- 方便后续扩展
- 降低维护成本

### Q: CI 检查失败会阻止 PR 合并吗？

A: 是的。所有 Critical 级别的检查必须通过才能合并。Warning 级别会显示警告但不会阻止合并（不推荐忽略警告）。

### Q: 如何禁用某个检查规则？

A: 目前不支持禁用规则。如果某个规则确实不适用，请在 Issue 中提出讨论。

---

**版本历史**：

- v1.0.0 (2025-12-05) - 初始版本，包含 Feature Linter 和 CI 集成
