# 脚注支持（Footnotes）

本文档介绍 supramark 中 **脚注语法** 的设计与当前实现。

## 1. 支持范围

基于 `markdown-it-footnote`，当前支持：

- 典型脚注引用与定义：

  ```markdown
  这是正文[^1]

  [^1]: 这里是脚注内容
  ```

- 内联脚注：

  ```markdown
  这是带有内联脚注的文本 ^[内联脚注内容]。
  ```

解析后会生成：

- 行内脚注引用节点：`footnote_reference`；
- 文末脚注定义节点：`footnote_definition`。

---

## 2. AST 设计

详见 `docs/architecture/ast-spec.md`，核心结构为：

```ts
interface SupramarkFootnoteReferenceNode extends SupramarkBaseNode {
  type: 'footnote_reference';
  index: number;    // 用户可见编号（从 1 开始）
  label?: string;   // 原始 label，如 "1" 或 "note"
  subId?: number;   // 同一脚注多次引用时的子编号（从 0 开始）
}

interface SupramarkFootnoteDefinitionNode extends SupramarkParentNode {
  type: 'footnote_definition';
  index: number;    // 对应脚注编号（与引用的 index 对齐）
  label?: string;   // 原始 label
  children: SupramarkNode[];
}
```

特点：

- **引用与定义分离**：
  - 正文中只出现 `footnote_reference`；
  - 所有定义作为 `footnote_definition`，被追加在 `root.children` 的末尾；
- **编号逻辑统一**：
  - `index = id + 1`，其中 `id` 来自 `markdown-it-footnote` 的内部 footnote 列表；
  - label（`[^label]` 中的 `label`）仅在显式 label 存在时填充。

---

## 3. 解析管线

默认解析器 `parseMarkdown()` 内部使用 `markdown-it-footnote`：

```ts
import footnote from 'markdown-it-footnote';

const md = new MarkdownIt({ /* ... */ });

md.use(footnote as any);
```

`markdown-it-footnote` 会产生如下 token：

- 正文内：
  - `footnote_ref`：脚注引用（包含 `{ id, subId, label }`）；
- 文末：
  - `footnote_block_open` / `footnote_block_close`：脚注块容器；
  - `footnote_open` / `footnote_close`：单条脚注定义；
  - 以及其中的 `paragraph_open` / `inline` 等普通 token。

在 supramark 的 token → AST 映射阶段：

### 3.1 行内引用

在 `mapInlineTokens` 中：

```ts
case 'footnote_ref': {
  const meta = token.meta || {};
  const id = typeof meta.id === 'number' ? meta.id : 0;
  const index = id + 1;
  const refNode: SupramarkFootnoteReferenceNode = {
    type: 'footnote_reference',
    index,
  };
  if (typeof meta.label === 'string') {
    refNode.label = meta.label;
  }
  if (typeof meta.subId === 'number') {
    refNode.subId = meta.subId;
  }
  current.children.push(refNode);
  break;
}
```

### 3.2 文末定义

在 `parseMarkdown()` 的主循环中：

```ts
case 'footnote_block_open': {
  // 容器本身对 AST 透明，具体定义在 footnote_open/close 中处理
  break;
}
case 'footnote_open': {
  const meta = token.meta || {};
  const id = typeof meta.id === 'number' ? meta.id : 0;
  const index = id + 1;
  const definition: SupramarkFootnoteDefinitionNode = {
    type: 'footnote_definition',
    index,
    label: typeof meta.label === 'string' ? meta.label : undefined,
    children: [],
  };
  parent.children.push(definition);
  stack.push(definition);
  break;
}
case 'footnote_close': {
  stack.pop();
  break;
}
```

在 `footnote_open` 与 `footnote_close` 之间的普通 token（段落、inline 等）会自然成为 `footnote_definition.children` 的一部分。

---

## 4. 当前渲染策略（占位版）

> 后续会根据需要升级为更精细的脚注区域布局，此处先实现简单且可读的默认行为。

### React Native（`@supramark/rn`）

- 引用节点 `footnote_reference`：
  - 渲染为行内的 `[n]` 文本，复用 `inlineCode` 风格，保证在 RN 中易于与普通文本区分；
- 定义节点 `footnote_definition`：
  - 目前作为附加「列表项」渲染，形式为：

    ```txt
    [1] 这里是脚注内容
    ```

  - 使用现有 `listItem` / `bullet` / `listItemText` 样式，简单而统一。

### React Web（`@supramark/web`）

- 引用节点：
  - 渲染为 `<sup>[n]</sup>`，复用 `inlineCode` 的 className；
- 定义节点：
  - 暂时渲染为普通段落 `<p>`，内容为：

    ```html
    <p><sup>[1]</sup> 这里是脚注内容</p>
    ```

  - 后续可以调整为 `<section class="footnotes"><ol>...</ol></section>` 等更语义化的结构。

---

## 5. 示例

在共享示例数据中（`examples/demos（从各 Feature 包聚合）`），可以添加脚注示例，例如：

```markdown
# 脚注示例

这里有一个脚注引用[^1]，以及一个内联脚注 ^[内联脚注内容]。

[^1]: 这里是脚注定义。
```

在 React Native / React Web 示例应用中，可以通过菜单切换到「脚注」示例，观察：

- 正文中 `[1]`、`[2]` 的行内标记；
- 页面下方追加的脚注定义列表。

---

## 6. 后续演进方向

- 提供更语义化的脚注容器节点（例如 `footnote_list`），便于渲染层做集中布局；
- 在 Web 端增加滚动跳转与返回链接（类似 HTML 中的锚点）；
- 在 RN 端支持点击脚注引用后滚动到定义区域，或弹出浮层；
- 与 remark / mdast 的脚注生态（`remark-footnotes` 等）对齐，在 `parseMarkdownWithRemark()` 管线中保持等价建模。

