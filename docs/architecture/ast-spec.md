# Supramark AST 规范

本文档定义了 supramark 的抽象语法树（AST）结构，包括所有节点类型、属性及其与 [mdast](https://github.com/syntax-tree/mdast) 的映射关系。

## 设计原则

1. **兼容 mdast**：尽可能与 mdast 保持一致，便于集成 unified/remark 生态
2. **扩展性**：支持扩展节点类型（如 diagram、admonition）
3. **跨平台**：AST 定义平台无关，适用于 RN / Web / Node
4. **类型安全**：完整的 TypeScript 类型定义

## 节点分类

### Block-level 节点（块级）

- root
- paragraph
- heading
- code
- math_block
- list
- list_item
- blockquote
- thematic_break
- diagram（扩展）
- table（GFM 扩展）
- table_row（GFM 扩展）
- table_cell（GFM 扩展）

### Inline-level 节点（行内）

- text
- strong
- emphasis
- inline_code
- math_inline
- link
- image
- break
- delete（GFM 删除线）

### 特殊节点

- html（原始 HTML）
- comment（注释）

---

## 核心节点类型

### Root（根节点）

文档的根节点，包含所有顶层块级节点。

**类型定义：**

```typescript
interface SupramarkRootNode extends SupramarkParentNode {
  type: 'root';
  children: SupramarkNode[];
}
```

**与 mdast 映射：**

- mdast: `Root`
- 一一对应

**示例：**

```json
{
  "type": "root",
  "children": [
    { "type": "paragraph", "children": [...] }
  ]
}
```

---

### Paragraph（段落）

普通段落，包含 inline 节点。

**类型定义：**

```typescript
interface SupramarkParagraphNode extends SupramarkParentNode {
  type: 'paragraph';
  children: SupramarkInlineNode[];
}
```

**与 mdast 映射：**

- mdast: `Paragraph`
- 一一对应

**Markdown 示例：**

```markdown
This is a paragraph with **bold** and _italic_ text.
```

**AST 示例：**

```json
{
  "type": "paragraph",
  "children": [
    { "type": "text", "value": "This is a paragraph with " },
    {
      "type": "strong",
      "children": [{ "type": "text", "value": "bold" }]
    },
    { "type": "text", "value": " and " },
    {
      "type": "emphasis",
      "children": [{ "type": "text", "value": "italic" }]
    },
    { "type": "text", "value": " text." }
  ]
}
```

---

### Heading（标题）

标题节点，支持 1-6 级。

**类型定义：**

```typescript
interface SupramarkHeadingNode extends SupramarkParentNode {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: SupramarkInlineNode[];
}
```

**与 mdast 映射：**

- mdast: `Heading`
- 一一对应

**Markdown 示例：**

```markdown
# H1 Title

## H2 with **bold**
```

**AST 示例：**

```json
{
  "type": "heading",
  "depth": 1,
  "children": [{ "type": "text", "value": "H1 Title" }]
}
```

---

### Text（文本）

纯文本节点，不包含格式。

**类型定义：**

```typescript
interface SupramarkTextNode extends SupramarkBaseNode {
  type: 'text';
  value: string;
}
```

**与 mdast 映射：**

- mdast: `Text`
- 一一对应

---

### Strong（加粗）

加粗文本，包含 inline 节点。

**类型定义：**

```typescript
interface SupramarkStrongNode extends SupramarkParentNode {
  type: 'strong';
  children: SupramarkInlineNode[];
}
```

**与 mdast 映射：**

- mdast: `Strong`
- 一一对应

**Markdown 示例：**

```markdown
**bold text**
**also bold**
```

---

### Emphasis（斜体）

斜体文本，包含 inline 节点。

**类型定义：**

```typescript
interface SupramarkEmphasisNode extends SupramarkParentNode {
  type: 'emphasis';
  children: SupramarkInlineNode[];
}
```

**与 mdast 映射：**

- mdast: `Emphasis`
- 一一对应

**Markdown 示例：**

```markdown
_italic text_
_also italic_
```

---

### InlineCode（行内代码）

行内代码，单行无语法高亮。

**类型定义：**

```typescript
interface SupramarkInlineCodeNode extends SupramarkBaseNode {
  type: 'inline_code';
  value: string;
}
```

**与 mdast 映射：**

- mdast: `InlineCode`
- 一一对应（仅 camelCase → snake_case）

**Markdown 示例：**

```markdown
Use `const x = 1` in your code.
```

**AST 示例：**

```json
{
  "type": "inline_code",
  "value": "const x = 1"
}
```

---

### Code（代码块）

多行代码块，支持语言标识和语法高亮。

**类型定义：**

```typescript
interface SupramarkCodeNode extends SupramarkBaseNode {
  type: 'code';
  value: string;
  lang?: string; // 语言标识，如 'javascript'
  meta?: string; // 元信息，如行号、高亮行等
}
```

**与 mdast 映射：**

- mdast: `Code`
- 一一对应

**Markdown 示例：**

````markdown
```javascript
function hello() {
  console.log('Hello');
}
```
````

**AST 示例：**

```json
{
  "type": "code",
  "lang": "javascript",
  "value": "function hello() {\n  console.log('Hello');\n}"
}
```

---

### Link（链接）

超链接，包含 URL 和可选的 title。

**类型定义：**

```typescript
interface SupramarkLinkNode extends SupramarkParentNode {
  type: 'link';
  url: string;
  title?: string;
  children: SupramarkInlineNode[];
}
```

**与 mdast 映射：**

- mdast: `Link`
- 一一对应

**Markdown 示例：**

```markdown
[Example](https://example.com 'Example Site')
[Simple Link](https://example.com)
```

**AST 示例：**

```json
{
  "type": "link",
  "url": "https://example.com",
  "title": "Example Site",
  "children": [{ "type": "text", "value": "Example" }]
}
```

---

### Image（图片）

图片节点。

**类型定义：**

```typescript
interface SupramarkImageNode extends SupramarkBaseNode {
  type: 'image';
  url: string;
  alt?: string;
  title?: string;
}
```

**与 mdast 映射：**

- mdast: `Image`
- 一一对应

**Markdown 示例：**

```markdown
![Alt text](image.png 'Image Title')
```

---

### List（列表）

有序或无序列表。

**类型定义：**

```typescript
interface SupramarkListNode extends SupramarkParentNode {
  type: 'list';
  ordered: boolean; // true = 有序，false = 无序
  start: number | null; // 起始序号（仅有序列表）
  tight?: boolean; // 紧凑模式（列表项之间无空行）
  children: SupramarkListItemNode[];
}
```

**与 mdast 映射：**

- mdast: `List`
- 一一对应

**Markdown 示例：**

```markdown
- Item 1
- Item 2

1. First
2. Second
```

---

### List Item（列表项）

列表中的单个项。

**类型定义：**

```typescript
interface SupramarkListItemNode extends SupramarkParentNode {
  type: 'list_item';
  checked?: boolean | null; // 任务列表状态：true=已完成，false=未完成，null=普通列表
  children: SupramarkNode[];
}
```

**与 mdast 映射：**

- mdast: `ListItem`
- 一一对应

**Markdown 示例：**

```markdown
- [ ] Task 1
- [x] Task 2
- Regular item
```

**AST 示例：**

```json
{
  "type": "list_item",
  "checked": false,
  "children": [
    {
      "type": "paragraph",
      "children": [{ "type": "text", "value": "Task 1" }]
    }
  ]
}
```

---

### Blockquote（引用）

块引用。

**类型定义：**

```typescript
interface SupramarkBlockquoteNode extends SupramarkParentNode {
  type: 'blockquote';
  children: SupramarkNode[];
}
```

**与 mdast 映射：**

- mdast: `Blockquote`
- 一一对应

**Markdown 示例：**

```markdown
> This is a quote
> with multiple lines
```

---

### Thematic Break（分隔线）

水平分隔线。

**类型定义：**

```typescript
interface SupramarkThematicBreakNode extends SupramarkBaseNode {
  type: 'thematic_break';
}
```

**与 mdast 映射：**

- mdast: `ThematicBreak`
- 名称不同，概念一致

**Markdown 示例：**

```markdown
---

---

---
```

---

### Line Break（换行）

强制换行（`<br>`）。

**类型定义：**

```typescript
interface SupramarkBreakNode extends SupramarkBaseNode {
  type: 'break';
}
```

**与 mdast 映射：**

- mdast: `Break`
- 一一对应

**Markdown 示例：**

```markdown
Line 1·· (两个空格)
Line 2
```

---

## 扩展节点：Diagram / Math 等

### Diagram（图表）

supramark 的扩展节点，用于支持 Mermaid、PlantUML、Vega 等图表。

**类型定义：**

```typescript
interface SupramarkDiagramNode extends SupramarkBaseNode {
  type: 'diagram';
  engine: 'mermaid' | 'plantuml' | 'vega' | 'vega-lite' | 'chart' | string;
  code: string;
  meta?: Record<string, unknown>; // 引擎特定的元信息
}
```

**与 mdast 映射：**

- mdast: **无对应节点**（扩展）
- 在 mdast 中会被解析为 `Code` 节点

**Markdown 示例：**

````markdown
```mermaid
graph TD
  A --> B
```
````

**AST 示例：**

```json
{
  "type": "diagram",
  "engine": "mermaid",
  "code": "graph TD\n  A --> B"
}
```

**渲染策略：**

- **RN**：通过 `@supramark/rn-diagram-worker` 的 headless WebView 渲染为 SVG
- **Web**：通过浏览器端脚本（Mermaid.js 等）渲染为 SVG/Canvas

---

### Math（数学公式）

用于表示 LaTeX 数学公式，区分行内与块级两种形态。

**类型定义：**

```typescript
interface SupramarkMathInlineNode extends SupramarkBaseNode {
  type: 'math_inline';
  value: string; // 原始 TeX 文本（不含分隔符）
}

interface SupramarkMathBlockNode extends SupramarkBaseNode {
  type: 'math_block';
  value: string; // 原始 TeX 文本（不含分隔符）
  data?: {
    /**
     * 可选的公式编号（例如 $$ ... $$(1.1) 中的 "1.1"）
     */
    equationNumber?: string;
  };
}
```

**与 mdast 映射：**

- 对应 mdast 生态中的 `Math` / `InlineMath`（例如 `mdast-util-math`），但在 supramark 中拆分为两个明确的节点类型；
- 属于 supramark 的扩展节点，核心 mdast 规范中没有直接定义。

**Markdown 示例：**

行内公式：

```markdown
这是行内公式 $E = mc^2$ 示例。
```

块级公式：

```markdown
$$
E = mc^2
$$
```

**AST 示例：**

行内：

```json
{
  "type": "paragraph",
  "children": [
    { "type": "text", "value": "这是行内公式 " },
    { "type": "math_inline", "value": "E = mc^2" },
    { "type": "text", "value": " 示例。" }
  ]
}
```

块级：

```json
{
  "type": "math_block",
  "value": "E = mc^2"
}
```

> 注意：当前版本中，Math 节点只承担「语义标记」职责，具体渲染（KaTeX / MathJax / WebView 等）由上层 RN / Web 渲染器及其子系统负责。

---

### Footnote（脚注）

用于表示 Markdown 中的脚注引用与定义。

**类型定义：**

```ts
interface SupramarkFootnoteReferenceNode extends SupramarkBaseNode {
  type: 'footnote_reference';
  index: number; // 用户可见编号（从 1 开始）
  label?: string; // 原始 label，如 "1" 或 "note"
  subId?: number; // 同一脚注多次引用时的子编号（从 0 开始）
}

interface SupramarkFootnoteDefinitionNode extends SupramarkParentNode {
  type: 'footnote_definition';
  index: number; // 对应脚注编号（与引用的 index 对齐）
  label?: string; // 原始 label
  children: SupramarkNode[];
}
```

**与 mdast 映射：**

- 与 `mdast-util-footnote` 中的 `FootnoteReference` / `FootnoteDefinition` 概念一致，但在 supramark 中没有额外的列表容器节点，所有定义直接作为 `root.children` 的一部分追加在文末。

**Markdown 示例：**

```markdown
这里有一个脚注引用[^1]，以及一个内联脚注 ^[内联脚注内容]。

[^1]: 这里是脚注定义。
```

**AST 示例（结构示意）：**

```json
{
  "type": "root",
  "children": [
    {
      "type": "paragraph",
      "children": [
        { "type": "text", "value": "这里有一个脚注引用" },
        { "type": "footnote_reference", "index": 1, "label": "1" },
        { "type": "text", "value": "，以及一个内联脚注 " },
        { "type": "footnote_reference", "index": 2 },
        { "type": "text", "value": "。" }
      ]
    },
    {
      "type": "footnote_definition",
      "index": 1,
      "label": "1",
      "children": [
        {
          "type": "paragraph",
          "children": [{ "type": "text", "value": "这里是脚注定义。" }]
        }
      ]
    },
    {
      "type": "footnote_definition",
      "index": 2,
      "children": [
        {
          "type": "paragraph",
          "children": [{ "type": "text", "value": "内联脚注内容" }]
        }
      ]
    }
  ]
}
```

---

### Admonition（提示框容器）

用于表示文档中的「提示 / 注意 / 警告」等容器块。

**类型定义：**

```ts
interface SupramarkAdmonitionNode extends SupramarkParentNode {
  type: 'admonition';
  kind: string; // 如 'note' | 'tip' | 'info' | 'warning' | 'danger'
  title?: string; // 可选标题，来自容器语法第一行
  children: SupramarkNode[];
}
```

**Markdown 示例：**

```markdown
::: note 提示标题
这里是提示内容。
:::
```

**AST 示例（结构示意）：**

```json
{
  "type": "admonition",
  "kind": "note",
  "title": "提示标题",
  "children": [
    {
      "type": "paragraph",
      "children": [{ "type": "text", "value": "这里是提示内容。" }]
    }
  ]
}
```

> 解析上依赖 `markdown-it-container`，在 core 中预注册了 `note` / `tip` / `info` / `warning` / `danger` 五种 kind。

---

### Definition List（定义列表）

用于术语解释等场景。

**类型定义：**

```ts
interface SupramarkDefinitionListNode extends SupramarkParentNode {
  type: 'definition_list';
  children: SupramarkDefinitionItemNode[];
}

interface SupramarkDefinitionItemNode extends SupramarkBaseNode {
  type: 'definition_item';
  term: SupramarkNode[]; // 术语部分（通常是一行 inline 节点）
  descriptions: SupramarkNode[][]; // 描述列表，每个元素是一段描述的节点序列
}
```

**Markdown 示例：**

```markdown
术语一
: 描述一
: 描述一的补充说明

术语二
: 描述二
```

**AST 示例（结构示意）：**

```json
{
  "type": "definition_list",
  "children": [
    {
      "type": "definition_item",
      "term": [{ "type": "text", "value": "术语一" }],
      "descriptions": [
        [{ "type": "text", "value": "描述一" }],
        [{ "type": "text", "value": "描述一的补充说明" }]
      ]
    }
  ]
}
```

> 当前实现对描述部分按「段落级」拆分，复杂嵌套（如列表中的定义列表）会被简化为若干描述段落。

---

## 类型系统

### 基础接口

```typescript
interface SupramarkBaseNode {
  type: SupramarkNodeType;
  position?: Position; // 可选的源码位置信息
  data?: Record<string, unknown>; // 插件自定义数据
}

interface SupramarkParentNode extends SupramarkBaseNode {
  children: SupramarkNode[];
}

interface Position {
  start: Point;
  end: Point;
}

interface Point {
  line: number; // 从 1 开始
  column: number; // 从 1 开始
  offset?: number; // 从 0 开始的字符偏移
}
```

### 节点类型联合

```typescript
type SupramarkBlockNode =
  | SupramarkParagraphNode
  | SupramarkHeadingNode
  | SupramarkCodeNode
  | SupramarkMathBlockNode
  | SupramarkListNode
  | SupramarkListItemNode
  | SupramarkBlockquoteNode
  | SupramarkThematicBreakNode
  | SupramarkDiagramNode
  | SupramarkTableNode
  | SupramarkTableRowNode
  | SupramarkTableCellNode;

type SupramarkInlineNode =
  | SupramarkTextNode
  | SupramarkStrongNode
  | SupramarkEmphasisNode
  | SupramarkInlineCodeNode
  | SupramarkMathInlineNode
  | SupramarkLinkNode
  | SupramarkImageNode
  | SupramarkBreakNode
  | SupramarkDeleteNode;

type SupramarkNode = SupramarkRootNode | SupramarkBlockNode | SupramarkInlineNode;
```

---

## 与 mdast 的完整映射表

| Supramark             | mdast                | 说明                                             |
| --------------------- | -------------------- | ------------------------------------------------ |
| `root`                | `Root`               | ✅ 一一对应                                      |
| `paragraph`           | `Paragraph`          | ✅ 一一对应                                      |
| `heading`             | `Heading`            | ✅ 一一对应                                      |
| `text`                | `Text`               | ✅ 一一对应                                      |
| `strong`              | `Strong`             | ✅ 一一对应                                      |
| `emphasis`            | `Emphasis`           | ✅ 一一对应                                      |
| `inline_code`         | `InlineCode`         | ✅ 一一对应                                      |
| `code`                | `Code`               | ✅ 一一对应                                      |
| `link`                | `Link`               | ✅ 一一对应                                      |
| `image`               | `Image`              | ✅ 一一对应                                      |
| `list`                | `List`               | ✅ 一一对应                                      |
| `list_item`           | `ListItem`           | ✅ 一一对应                                      |
| `blockquote`          | `Blockquote`         | ✅ 一一对应                                      |
| `thematic_break`      | `ThematicBreak`      | ✅ 一一对应                                      |
| `break`               | `Break`              | ✅ 一一对应                                      |
| `diagram`             | -                    | ⭐ supramark 扩展                                |
| `table`               | `Table`              | ✅ 与 mdast-GFM 对齐                             |
| `table_row`           | `TableRow`           | ✅ 与 mdast-GFM 对齐                             |
| `table_cell`          | `TableCell`          | ✅ 与 mdast-GFM 对齐                             |
| `delete`              | `Delete`             | ✅ 与 mdast-GFM 对齐                             |
| `math_inline`         | `InlineMath`         | ⭐ 通过 mdast math 生态映射                      |
| `math_block`          | `Math`               | ⭐ 通过 mdast math 生态映射                      |
| `footnote_reference`  | `FootnoteReference`  | ⭐ 通过 mdast footnote 生态映射                  |
| `footnote_definition` | `FootnoteDefinition` | ⭐ 通过 mdast footnote 生态映射                  |
| `admonition`          | -                    | ⭐ supramark 扩展（常见于文档系统）              |
| `definition_list`     | -                    | ⭐ supramark 扩展（可与 mdast deflist 生态衔接） |
| `definition_item`     | -                    | ⭐ supramark 扩展                                |

---

## 未来扩展节点示例

以下节点目前尚未正式进入核心实现，仅作为未来扩展设计的草案示意。

### Admonition（提示框）

常见于文档系统。

```typescript
interface SupramarkAdmonitionNode extends SupramarkParentNode {
  type: 'admonition';
  kind: 'note' | 'tip' | 'warning' | 'danger' | 'info';
  title?: string;
  children: SupramarkNode[];
}
```

> Emoji / 短代码不引入独立节点，统一作为 `text.value` 中的 Unicode 字符出现。

---

## 插件系统集成

插件可以：

1. 在 `transform(root, context)` 阶段修改 AST
2. 添加自定义节点类型（需在 `SupramarkNodeType` 中声明）
3. 为节点添加 `data` 字段存储元信息

**示例：**

```typescript
const myPlugin: SupramarkPlugin = {
  name: 'my-plugin',
  transform(root, context) {
    // 遍历 AST，修改节点
    visit(root, 'paragraph', node => {
      node.data = { processed: true };
    });
  },
};
```

---

## 版本历史

- **v0.1.0** (2025-12-05)
  - 初始版本
  - 定义核心 block/inline 节点
  - diagram 扩展节点
  - 与 mdast 映射关系

---

## 参考资料

- [mdast (Markdown Abstract Syntax Tree)](https://github.com/syntax-tree/mdast)
- [unist (Universal Syntax Tree)](https://github.com/syntax-tree/unist)
- [CommonMark Spec](https://commonmark.org/)
