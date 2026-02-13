# Supramark 插件系统设计

> **📖 相关文档**:
>
> - [Feature Interface 接口定义](../packages/core/src/feature.ts) - 完整的 TypeScript 接口定义
> - [创建新 Feature 指南](../guide/CREATE_FEATURE_GUIDE.md)

## 核心设计哲学

Supramark 的插件（Feature）不仅仅是一段解析代码，它被定义为一个**包含了“代码 + 文档 + 测试 + AI 提示词”的完整产品单元**。

我们通过 `SupramarkFeature` 顶层接口定义了 **7 个核心 Trait (特征)**，它们共同构成了一个 Feature 的完整生命周期：

### 1. 身份特征 (`metadata`)

- **作用**：自我介绍。
- **包含**：ID、版本、描述、作者、许可证、分类标签。
- **用途**：用于插件市场的展示、依赖解析和防止 ID 冲突。

### 2. AI 交互特征 (`prompt`) ✨

- **作用**：教 AI 怎么用我。
- **包含**：功能描述、语法结构（BNF/Regex）、Few-Shot 示例（Markdown + 说明）。
- **用途**：自动生成 System Prompt，让 Agent 能理解并正确生成该 Feature 的语法。

### 3. 语法特征 (`syntax`)

- **作用**：定义数据结构。
- **包含**：
  - `ast`: 节点类型 (`type`)、接口定义 (`interface`)。
  - `parser`: (可选) 自定义解析规则。
- **用途**：指导 Markdown 解析器如何将文本转换为结构化的 AST 树。

### 4. 渲染特征 (`renderers`)

- **作用**：定义视觉表现。
- **包含**：`web` / `rn` / `cli` 等平台的渲染实现、样式定义、外部依赖声明。
- **用途**：指导渲染引擎将 AST 节点转换为 UI 组件。

### 5. 示例特征 (`examples`)

- **作用**：Showcase。
- **包含**：Markdown 源码、预期输出截图/描述。
- **用途**：用于生成文档站的演示页、以及作为视觉回归测试的基准。

### 6. 测试特征 (`testing`)

- **作用**：质量契约。
- **包含**：语法测试用例（Input -> Expected AST）、集成测试用例。
- **用途**：CI/CD 自动化验证，确保 Feature 逻辑不退化。

### 7. 文档特征 (`documentation`)

- **作用**：用户手册。
- **包含**：README、API 说明、FAQ、最佳实践。
- **用途**：自动生成静态文档站 (`docs/features/*.md`)。

---

## 架构层次

```mermaid
graph TD
    UserConfig[用户配置 config.features] --> FeatureRegistry

    subgraph Feature Package
        Metadata[Metadata]
        Syntax[Syntax (Parser)]
        Renderers[Renderers (Web/RN)]
        Prompt[AI Prompt]
    end

    FeatureRegistry -- 解析 --> Syntax
    FeatureRegistry -- 渲染 --> Renderers
    FeatureRegistry -- AI生成 --> Prompt
```

## 渲染机制 (Passive Rendering)

为了保证架构的纯净性和可移植性，渲染器采用了**被动式 (Passive)** 设计：

1.  **无全局注册表**：Core 库不维护全局单例。
2.  **按需加载**：宿主应用通过 `<Supramark config={{ features: [...] }} />` 显式注入插件。
3.  **动态映射**：渲染组件在运行时根据传入的 `features` 数组，动态构建 `Node.type -> Component` 的映射表。

这种设计确保了：

- **Tree Shaking 友好**：未使用的插件代码不会被打包。
- **多实例隔离**：同一页面上的两个 Supramark 实例可以使用完全不同的插件组合。
- **无副作用**：加载插件不会污染全局环境。
