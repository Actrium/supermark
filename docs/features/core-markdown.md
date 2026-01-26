# Core Markdown

> 基础 Markdown 语法（段落 / 标题 / 列表等）

# Core Markdown Feature

为 Supramark 提供核心 Markdown 语法支持。

## 功能

- 标题
- 段落
- 列表
- 代码块
- 强调

## 使用

查看 examples 目录获取更多示例。

## API 参考

### 函数

#### `createCoreMarkdownFeatureConfig`

创建 Core Markdown Feature 配置对象，用于在 SupramarkConfig 中启用基础 Markdown 语法支持

#### `options`

Core Markdown Feature 配置选项（当前为空对象）

### 接口

#### `CoreMarkdownFeatureOptions`

Core Markdown Feature 的配置选项接口（当前为空，保留用于未来扩展）

## 最佳实践

- 使用 # 表示标题，数量代表标题级别（# 到 ######）
- 段落之间使用空行分隔
- 列表项使用 - 或 * 表示无序列表，使用数字加点表示有序列表
- 代码块使用三个反引号包裹，并指定语言以启用语法高亮
- 行内格式：**粗体**、*斜体*、`代码`

## 常见问题

### Core Markdown Feature 包含哪些功能？

Core Markdown Feature 包含所有基础 Markdown 语法，包括标题、段落、列表、代码块、引用、强调、链接、图片等核心元素。

### Core Markdown 与扩展功能有什么区别？

Core Markdown 提供标准 Markdown 语法支持，扩展功能（如 GFM、Math、Footnote 等）提供额外的语法能力。

### 是否必须启用 Core Markdown Feature？

是的。Core Markdown Feature 提供了基础的 Markdown 解析能力，是其他扩展功能的基础。

