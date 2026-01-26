# Supramark 插件系统设计

> **📖 相关文档**:
> - [Feature Interface 接口定义](../packages/core/src/feature.ts) - 完整的 TypeScript 接口定义
> - [Feature Interface 使用示例](./FEATURE_INTERFACE_EXAMPLE.md) - Admonition 功能完整示例

## 核心理念

将 Markdown 扩展开发的通用模式抽象为标准接口，使得：
- 新增语法扩展有标准流程
- 多平台渲染实现有统一规范
- 测试、文档、示例有模板可循

**接口设计哲学**：采用递归展开的分层接口体系，每个 Supramark 功能由顶层 `SupramarkFeature` 接口定义，其子项递归展开为更细粒度的子接口。

## 架构层次

```
┌─────────────────────────────────────┐
│     Supramark Core (核心)           │
│  - AST 基础类型                      │
│  - 插件系统框架                      │
│  - 标准接口定义                      │
└─────────────────────────────────────┘
           ↓ extends
┌─────────────────────────────────────┐
│   Official Extensions (官方扩展)     │
│  - Math (数学公式)                   │
│  - Diagram (图表)                    │
│  - Admonition (提示块)               │
└─────────────────────────────────────┘
           ↓ implements
┌─────────────────────────────────────┐
│  Platform Renderers (平台渲染器)     │
│  - React Native                      │
│  - Web (React)                       │
│  - CLI (终端)                        │
└─────────────────────────────────────┘
```

## 核心接口定义

### 1. SyntaxExtension - 语法扩展

```typescript
interface SyntaxExtension {
  /** 扩展名称 */
  name: string;

  /** 版本号 */
  version: string;

  /** 新增的 AST 节点类型 */
  nodeTypes: ASTNodeDefinition[];

  /** Markdown 解析规则 */
  parseRules: {
    /** markdown-it 插件 */
    markdownIt?: MarkdownItPlugin;
    /** remark 插件 */
    remark?: RemarkPlugin;
  };

  /** 节点验证规则 */
  validate?: (node: ASTNode) => ValidationResult;

  /** 依赖的其他扩展 */
  dependencies?: string[];
}
```

### 2. RendererExtension - 渲染扩展

```typescript
interface RendererExtension<TPlatform> {
  /** 目标平台 */
  platform: 'rn' | 'web' | 'cli';

  /** 节点渲染函数映射 */
  renderMap: Record<string, RenderFunction<TPlatform>>;

  /** 样式定义 */
  styles?: StyleDefinition<TPlatform>;

  /** 依赖的组件/库 */
  dependencies?: PlatformDependency[];
}
```

### 3. Plugin - 完整插件

```typescript
interface Plugin {
  /** 插件元信息 */
  meta: {
    name: string;
    version: string;
    author: string;
    description: string;
    license: string;
  };

  /** 语法扩展 */
  syntax?: SyntaxExtension;

  /** 各平台渲染实现 */
  renderers: {
    rn?: RendererExtension<ReactNative>;
    web?: RendererExtension<React>;
    cli?: RendererExtension<CLI>;
  };

  /** 生命周期钩子 */
  hooks?: {
    beforeParse?: (markdown: string) => string;
    afterParse?: (ast: ASTNode) => ASTNode;
    beforeRender?: (ast: ASTNode) => ASTNode;
    afterRender?: (rendered: any) => any;
  };

  /** 配置 schema */
  configSchema?: JSONSchema;
}
```

## 扩展开发流程

### 标准化开发步骤

1. **定义语法** → `syntax/` 目录
   - AST 节点类型定义
   - 解析规则实现
   - 验证逻辑

2. **实现渲染器** → `renderers/` 目录
   - RN 组件 (`renderers/rn/`)
   - Web 组件 (`renderers/web/`)
   - CLI 输出 (`renderers/cli/`)

3. **编写测试** → `__tests__/` 目录
   - 解析测试（语法 → AST）
   - 渲染测试（AST → 各平台输出）
   - 集成测试

4. **创建示例** → `examples/` 目录
   - RN demo
   - Web demo
   - 使用文档

5. **生成文档** → `docs/` 目录
   - API 文档
   - 使用指南
   - 最佳实践

### 项目模板结构

```
@supramark/extension-[name]/
├── src/
│   ├── syntax/
│   │   ├── ast.ts           # AST 节点定义
│   │   ├── parser.ts        # 解析规则
│   │   └── validator.ts     # 验证逻辑
│   ├── renderers/
│   │   ├── rn/
│   │   │   ├── Component.tsx
│   │   │   └── styles.ts
│   │   ├── web/
│   │   │   ├── Component.tsx
│   │   │   └── styles.css
│   │   └── cli/
│   │       └── renderer.ts
│   └── index.ts             # 插件导出
├── __tests__/
│   ├── syntax.test.ts       # 解析测试
│   ├── rn.test.tsx          # RN 渲染测试
│   └── web.test.tsx         # Web 渲染测试
├── examples/
│   ├── rn/
│   └── web/
├── docs/
│   ├── README.md
│   └── api.md
└── package.json
```

## 实现优先级

### Phase 1: 核心接口定义
- [ ] 定义 `SyntaxExtension` 接口
- [ ] 定义 `RendererExtension` 接口
- [ ] 定义 `Plugin` 接口
- [ ] 实现插件注册和加载机制

### Phase 2: 重构现有扩展
- [ ] Math 重构为标准插件
- [ ] Diagram 重构为标准插件
- [ ] Admonition 重构为标准插件

### Phase 3: 开发者工具
- [ ] CLI 脚手架 (`create-supramark-extension`)
- [ ] 测试工具库
- [ ] 文档生成器

### Phase 4: 插件生态
- [ ] 插件市场设计
- [ ] 版本兼容性检查
- [ ] 插件发现和安装

## 设计原则

1. **Convention over Configuration**
   - 标准化的目录结构
   - 约定的命名规范
   - 默认的最佳实践

2. **渐进式增强**
   - 核心功能最小化
   - 扩展按需加载
   - 向后兼容

3. **类型安全**
   - TypeScript 全覆盖
   - 编译时错误检查
   - 完善的类型推导

4. **测试驱动**
   - 每个扩展必须有测试
   - 测试覆盖率要求
   - 跨平台测试

## 示例：创建一个新扩展

```typescript
// @supramark/extension-callout

import { Plugin } from '@supramark/core';

const calloutPlugin: Plugin = {
  meta: {
    name: '@supramark/extension-callout',
    version: '1.0.0',
    author: 'Supramark Team',
    description: 'GitHub-style callout blocks',
    license: 'Apache-2.0',
  },

  syntax: {
    name: 'callout',
    version: '1.0.0',
    nodeTypes: [{
      type: 'callout',
      parent: 'root',
      children: ['paragraph', 'list', ...],
      attributes: ['variant'],
    }],
    parseRules: {
      markdownIt: calloutMarkdownItPlugin,
    },
  },

  renderers: {
    rn: {
      platform: 'rn',
      renderMap: {
        callout: CalloutRN,
      },
      styles: calloutStylesRN,
    },
    web: {
      platform: 'web',
      renderMap: {
        callout: CalloutWeb,
      },
      styles: calloutStylesWeb,
    },
  },
};

export default calloutPlugin;
```

## 下一步行动

1. 在 `packages/core` 中定义核心接口
2. 创建 `packages/plugin-sdk` 提供开发工具
3. 将 Math/Diagram/Admonition 重构为标准插件
4. 编写插件开发指南和教程
