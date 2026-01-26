# Emoji / 短代码支持

本文档介绍 supramark 中 Emoji / 短代码（如 `:smile:` / `:rocket:`）的支持方式。

## 1. 设计原则

- **不新增 AST 节点**：Emoji 直接体现在 `text.value` 中，避免额外的节点类型；
- **兼容 GitHub 风格短代码**：支持常见的 `:smile:`, `:joy:`, `:thumbsup:` 等；
- **跨平台一致**：RN / Web 共用同一解析结果，只要字体支持，就能正确显示 emoji。

---

## 2. 解析实现（markdown-it-emoji）

在 `@supramark/core` 中，默认解析器 `parseMarkdown()` 启用了 [`markdown-it-emoji`](https://github.com/markdown-it/markdown-it-emoji)：

```ts
import emoji from 'markdown-it-emoji';

md.use(emoji as any);
```

该插件会在 inline 阶段将 `:smile:` 等短代码解析为 `emoji` token，最终合并回普通的 `text` token，`text.content` 即为真实的 Unicode Emoji 字符。

对于 supramark AST 来说：

- 不引入新的 `emoji` 节点；
- 现有的 `SupramarkTextNode.value` 中会直接包含 emoji 字符；
- RN / Web 渲染器无需任何特殊处理，只要正常渲染文本即可。

---

## 3. AST 行为示例

示例 Markdown：

```markdown
这是一个带有 emoji 的文本 :smile:，还有一个火箭 :rocket:。
```

解析后的 supramark AST 段落节点（简化）：

```json
{
  "type": "paragraph",
  "children": [
    { "type": "text", "value": "这是一个带有 emoji 的文本 " },
    { "type": "text", "value": "😄" },
    { "type": "text", "value": "，还有一个火箭 " },
    { "type": "text", "value": "🚀" },
    { "type": "text", "value": "。" }
  ]
}
```

可以看到，`:smile:` 和 `:rocket:` 已经被转换为真实的 Emoji 字符。

---

## 4. RN / Web 渲染

由于 Emoji 直接出现在 `text` 节点中：

- `@supramark/rn`：
  - `<Supramark />` 中的 `renderInlineNode` 对 `text` 节点直接返回 `textNode.value`；
  - 因此 Emoji 会随系统字体正常渲染。
- `@supramark/web`：
  - Web 端同样将 `text` 节点内容输出为 DOM 文本节点；
  - 浏览器会按当前字体/系统渲染 Emoji。

这意味着：Emoji 支持对业务而言是「零侵入」的，不需要任何额外组件或样式。

---

## 5. 示例

在共享 demo 数据中，可以添加一个简单示例（`examples/demos（从各 Feature 包聚合）`）：

```markdown
# Emoji 示例

支持 GitHub 风格短代码：

- :smile: :joy: :wink:
- :rocket: :tada: :warning:

也可以直接输入原生 Emoji 😄🚀🎉。
```

在 RN / Web 示例应用中，选择「Emoji 示例」即可看到效果。

---

## 6. 后续可能的增强

- 提供开关，允许宿主选择是否启用短代码解析（例如在某些严格场景关闭）；
- 支持自定义短代码映射（如公司内部表情或图标字体）：
  - 通过扩展 markdown-it-emoji 的 `defs` 和 `shortcuts` 选项；
  - 或在 supramark 插件阶段遍历 `text` 节点进行二次替换。

