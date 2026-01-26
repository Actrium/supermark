# CLI 工具增强 v0.2.0

> 更新日期：2025-12-05

## 概述

本次更新针对用户和同事的反馈，对 `create-feature` 和新增的 `update-feature` CLI 工具进行了全面增强，提供了完整的 Feature 开发和维护工作流。

## 用户反馈的问题

### 1. 缺少 Jest 配置

**问题**：
- 生成的包没有 Jest 配置，直接执行 `npm test` 会因为 TypeScript 语法无法被解析而失败

**解决方案**：
- `create-feature` 现在自动生成 `jest.config.cjs` 配置文件
- 添加 `ts-jest` 到 `devDependencies`
- 配置支持 TypeScript 测试文件和 workspace 依赖映射

### 2. 多节点类型处理指导不足

**问题**：
- 模板使用 `MinimalFeature<SupramarkNode>` 不能很好地处理多节点类型情况（如 `math_inline` 和 `math_block`）

**解决方案**：
- 在生成的 Feature 模板中添加详细的多节点类型处理注释
- 提供单节点和多节点两种场景的代码示例
- 更新文档说明何时使用节点选择器

### 3. 文档示例不一致

**问题**：
- 文档中显示 `-t "math"` 但实际 AST 类型应该是 `math_inline`/`math_block`

**解决方案**：
- 修改所有文档示例，使用准确的节点类型
- 添加多节点类型场景的完整示例
- 在 AST 配置说明中添加清晰的指导

### 4. 缺少增量更新支持

**问题**：
- 当接口发生变化时，无法批量更新现有 Feature 包
- 需要手动检查和修复每个包

**解决方案**：
- 创建新的 `update-feature` 工具
- 支持自动检测缺失配置和文件
- 提供问题报告和自动修复能力

## 新增内容

### 1. create-feature 工具增强

#### 新增文件生成

生成的文件从 **6 个** 增加到 **7 个**（v0.2.0 时代目录为 `packages/feature-{name}`，当前版本已演进为 `packages/features/<family>/feature-{name}`，结构相同，仅父目录不同）：

```
packages/features/<family>/feature-{name}/
├── package.json         ← 包含 ts-jest 依赖
├── tsconfig.json
├── jest.config.cjs      ← 新增：Jest 配置
├── src/
│   ├── index.ts
│   └── feature.ts       ← 增强：包含多节点类型指导
├── __tests__/
│   └── feature.test.ts
└── README.md
```

#### jest.config.cjs 配置

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@supramark/core$': '<rootDir>/../../core/src',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
};
```

#### 多节点类型指导注释

在 `src/feature.ts` 中新增：

```typescript
/**
 * 节点类型说明：
 * - 如果此 Feature 只处理单一节点类型（如 'diagram'），直接使用当前配置即可
 * - 如果此 Feature 需要处理多个节点类型（如 'math_inline' 和 'math_block'），
 *   请参考下面的"多节点类型处理"注释，定义具体的节点接口和 selector
 */

// 多节点类型处理：
// 示例 1：单节点类型（当前配置）
// type: 'diagram',
// selector: (node) => node.engine === 'vega-lite',
//
// 示例 2：多节点类型
// type: 'math_inline' | 'math_block',
// selector: (node) => node.type === 'math_inline' || node.type === 'math_block',
//
// 或者定义具体的节点类型接口：
// interface MathNode extends SupramarkNode {
//   type: 'math_inline' | 'math_block';
//   value: string;
//   katexOptions?: Record<string, any>;
// }
```

### 2. update-feature 工具（全新）

#### 功能特性

- **自动扫描**：检测 `packages/` 下所有 `feature-*` 目录
- **问题分级**：
  - 🚨 关键问题（Critical/High）：缺少必要文件
  - ⚠️ 警告（Medium）：缺少依赖或配置
  - 💡 建议（Low）：代码质量改进
- **自动修复**：生成缺失的配置文件（可选）
- **详细报告**：清晰展示每个包的问题和建议

#### 检查项目

1. **Jest 配置** (High)：`jest.config.cjs` 文件是否存在
2. **TypeScript 配置** (High)：`tsconfig.json` 文件是否存在
3. **导出入口** (High)：`src/index.ts` 文件是否存在
4. **package.json** (Critical)：包配置文件是否存在
5. **ts-jest 依赖** (Medium)：`package.json` 中是否包含 `ts-jest`
6. **多节点类型指导** (Low)：Feature 定义中是否包含指导注释

#### 使用示例

```bash
# 检查所有 Feature 包
npm run update-feature

# 检查特定 Feature 包
npm run update-feature math

# 预览自动修复（不实际执行）
npm run update-feature -- --dry-run --fix

# 执行自动修复
npm run update-feature -- --fix
```

#### 输出示例

```
📊 Feature 包检查报告

============================================================

❌ math
   路径: packages/features/main/feature-math

   🚨 关键问题：
      • Jest 配置: 缺少 Jest 配置文件，测试无法运行

   ⚠️  警告：
      • ts-jest 依赖: package.json 中缺少 ts-jest 依赖

   💡 建议：
      • 多节点类型指导注释: Feature 定义文件缺少多节点类型处理指导

============================================================

📈 统计汇总：
   总包数: 1
   关键问题: 1
   警告: 1
   建议: 1
```

### 3. 文档更新

#### CREATE_FEATURE_GUIDE.md

更新内容：
1. 修复所有 `math` 示例，改用 `admonition` 或明确的多节点类型示例
2. 在"AST 节点类型"部分添加多节点类型说明
3. 在"节点选择器"部分添加两种使用场景说明
4. 添加 `jest.config.cjs` 文件说明

  "devDependencies": {
    "ts-jest": "^29.1.0"  // 新增
  }
}
```

**scripts 新增**：
```json
{
  "scripts": {
    "update-feature": "node scripts/update-feature.js"  // 新增
  }
}
```

### Jest 配置要点

1. **preset**: 使用 `ts-jest` 预设
2. **transform**: 配置 TypeScript 转换，支持 CommonJS
3. **moduleNameMapper**: 映射 workspace 依赖到源码
4. **testMatch**: 支持 `__tests__/*.test.ts` 和 `*.spec.ts`
5. **coverage**: 配置代码覆盖率收集

### update-feature 工具架构

```javascript
// 核心函数流程
main()
  ├─ scanFeaturePackages()      // 扫描 Feature 目录
  ├─ checkFeaturePackage()      // 检查单个包
  │   ├─ 文件存在性检查
  │   ├─ package.json 依赖检查
  │   └─ 代码质量检查
  ├─ generateReport()           // 生成检查报告
  └─ autoFix()                  // 自动修复问题
      ├─ generateJestConfig()
      ├─ generateTsConfig()
      └─ 其他文件生成器
```

## 使用指南

### 创建新 Feature（完整流程）

```bash
# 1. 使用 CLI 创建 Feature 脚手架
npm run create-feature -- \
  --name "Admonition" \
  --node-type "admonition" \
  --description "提示、警告等特殊块"

# 2. 进入 Feature 目录
cd packages/features/container/feature-admonition

# 3. 安装依赖（如果需要）
npm install

# 4. 完善 Feature 定义
# 编辑 src/feature.ts

# 5. 运行测试
npm test

# 6. 编译
npm run build
```

### 更新现有 Feature

```bash
# 1. 检查所有 Feature 的状态
npm run update-feature

# 2. 自动修复可修复的问题
npm run update-feature -- --fix

# 3. 手动处理需要人工介入的问题
# 例如：添加 ts-jest 依赖，需要运行 npm install

# 4. 再次检查确认
npm run update-feature
```

## 对比：更新前后

### 生成的文件数量

| 项目 | 更新前 | 更新后 |
|------|--------|--------|
| 文件总数 | 6 | 7 |
| 配置文件 | 2 | 3 |
| 其中 Jest 配置 | ❌ | ✅ |

### package.json 依赖

| 依赖 | 更新前 | 更新后 |
|------|--------|--------|
| jest | ✅ | ✅ |
| ts-jest | ❌ | ✅ |
| @types/jest | ✅ | ✅ |

### 模板代码质量

| 方面 | 更新前 | 更新后 |
|------|--------|--------|
| 多节点类型指导 | ❌ | ✅ 详细注释 + 示例 |
| 测试可运行性 | ❌ TypeScript 报错 | ✅ 开箱即用 |
| 文档准确性 | ⚠️ 有误导性示例 | ✅ 准确且全面 |

### 维护效率

| 场景 | 更新前 | 更新后 |
|------|--------|--------|
| 检查包状态 | 手动逐个检查 | `npm run update-feature` |
| 修复配置问题 | 手动创建文件 | `--fix` 自动生成 |
| 批量更新 | 不支持 | 一键扫描 + 修复 |

## 测试验证

### create-feature 测试

```bash
# 测试基础创建
npm run create-feature -- \
  -n "Test Feature" \
  -t "test" \
  -d "Test feature for validation"

# 验证生成的文件（v0.2.0 时目录为 packages/feature-test，当前版本为 packages/features/main/feature-test）

# 验证测试可运行
cd packages/features/main/feature-test
npm test
# ✅ 测试执行成功（即使没有实际测试用例）
```

### update-feature 测试

```bash
# 测试检查功能
npm run update-feature
# ✅ 正确识别 feature-math 的问题

# 测试预览修复
npm run update-feature -- --dry-run --fix
# ✅ 显示将要创建的文件

# 测试实际修复
npm run update-feature -- --fix
# ✅ 成功创建 jest.config.cjs
```

## API 变更

### 无 Breaking Changes

本次更新**完全向后兼容**，不会破坏现有代码或工作流。

### 新增 API

**npm scripts**:
- `npm run update-feature` - 检查和更新 Feature 包
- `npm run update-feature -- --fix` - 自动修复问题
- `npm run update-feature -- --help` - 显示帮助

## 后续计划

基于用户反馈，后续可能的改进包括：

### 短期（v0.3.0）
- [ ] 添加 `update-feature --migrate` 模式，支持更复杂的代码迁移
- [ ] 支持自动更新 package.json 依赖版本
- [ ] 添加 `--interactive` 模式，交互式选择要修复的问题

### 中期（v0.4.0）
- [ ] 集成到 `create-feature` 工具，创建后自动检查
- [ ] 支持自定义检查规则配置文件
- [ ] 添加 CI/CD 集成（GitHub Actions 检查）

### 长期（v1.0.0）
- [ ] Feature 依赖关系管理和验证
- [ ] Feature 版本兼容性检查
- [ ] Feature 性能分析和优化建议

## 相关文档

- [CREATE_FEATURE_GUIDE.md](./CREATE_FEATURE_GUIDE.md) - Feature 创建指南
- [FEATURE_LIFECYCLE_AND_CONFIG.md](./FEATURE_LIFECYCLE_AND_CONFIG.md) - Feature 生命周期
- [scripts/create-feature.js](../scripts/create-feature.js) - 创建工具源码
- [scripts/update-feature.js](../scripts/update-feature.js) - 更新工具源码

## 贡献者

- 需求分析：用户及同事反馈
- 设计实现：Claude (AI Assistant)
- 测试验证：基于实际 Feature 包

---

**版本**：v0.2.0
**发布日期**：2025-12-05
**影响范围**：CLI 工具和开发工作流
**Breaking Changes**：无
**升级建议**：所有 Feature 开发者建议运行 `npm run update-feature -- --fix` 更新现有包
