# TypeDoc API 文档

Supramark Core 的完整类型定义文档由 TypeDoc 自动生成。

## 访问 TypeDoc 文档

TypeDoc 文档已集成到此站点中，点击下方链接访问：

**[查看 TypeDoc 完整文档](/typedoc/index.html)**

## 主要内容

TypeDoc 文档包含以下内容：

### 🎯 AST 节点类型

- `SupramarkNode` - 所有节点的联合类型
- `SupramarkParagraphNode` - 段落节点
- `SupramarkHeadingNode` - 标题节点
- `SupramarkCodeBlockNode` - 代码块节点
- ... 以及 80+ 种节点类型

### 🔧 Feature 接口

- `SupramarkFeature` - Feature 顶层接口
- `FeatureMetadata` - Feature 元信息
- `SyntaxDefinition` - 语法定义
- `RendererDefinitions` - 渲染器定义

### 📦 配置系统

- `SupramarkConfig` - 全局配置接口
- `ParseOptions` - 解析选项
- `FeatureConfig` - Feature 配置

### 🔌 插件系统

- `Plugin` - 插件接口
- `PluginContext` - 插件上下文
- `TokenMapper` - Token 映射器

## 使用建议

- **查找类型定义**: 使用搜索功能快速定位
- **查看类型层级**: 使用 Hierarchy 页面了解继承关系
- **复制类型**: 所有类型都可直接在 TypeScript 中使用

## 在线更新

TypeDoc 文档会在每次构建时自动更新，确保与源代码保持同步。

---

如果 TypeDoc 文档无法访问，请运行：

\`\`\`bash
cd packages/core
npm run docs
\`\`\`
