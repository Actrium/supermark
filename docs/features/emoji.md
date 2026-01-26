# Emoji

> Emoji / 短代码支持（:smile: → 😄）

# Emoji Feature

为 Supramark 提供 Emoji 短代码支持。

## 功能

- GitHub 风格短代码
- 原生 Emoji

## 使用

查看 examples 目录获取更多示例。

## API 参考

### 函数

#### `createEmojiFeatureConfig`

创建 Emoji Feature 配置对象，用于在 SupramarkConfig 中启用 Emoji 短代码支持

#### `options`

Emoji Feature 配置选项（当前为空对象）

### 接口

#### `EmojiFeatureOptions`

Emoji Feature 的配置选项接口（当前为空，保留用于未来扩展）

## 最佳实践

- 使用 GitHub 风格的短代码格式，例如 :smile: :rocket: :heart:
- 短代码使用英文冒号包裹，中间为 emoji 名称
- 也可以直接输入原生 Unicode Emoji 字符
- 常用 emoji 短代码：:+1: (👍)、:-1: (👎)、:tada: (🎉)、:sparkles: (✨)

## 常见问题

### Emoji Feature 支持哪些短代码？

支持 GitHub 风格的 emoji 短代码，完整列表可参考 GitHub Emoji API 或 markdown-it-emoji 文档。

### Emoji 在 AST 中如何表示？

Emoji Feature 不创建单独的 AST 节点类型，而是将短代码转换为 Unicode 字符后嵌入到 text 节点的 value 中。

### 可以直接使用 Unicode Emoji 吗？

可以。除了使用短代码，也可以直接在 Markdown 中输入原生 Unicode Emoji 字符。

