# 数学公式支持（Math / LaTeX）

本文档介绍 supramark 中 **数学公式支持** 的设计与当前实现进度。

## 1. 目标与范围

支持常见的 LaTeX 数学公式语法：

- 行内公式：`$ ... $`；
- 块级公式：`$$ ... $$`；
- 与现有 LaTeX / mdast math 生态兼容（便于未来接入 KaTeX、MathJax 等）。

同时满足：

- **跨平台**：RN / Web 共用一套 AST；
- **分层清晰**：core 只负责「识别 + 建模」，实际渲染由上层负责；
- **可增量演进**：可以先作为纯文本展示，后续再逐步升级为 KaTeX 渲染。

---

## 2. AST 设计

在 `@supramark/core` 中，Math 相关节点定义如下（详见 `docs/architecture/ast-spec.md`）：

```ts
interface SupramarkMathInlineNode extends SupramarkBaseNode {
  type: 'math_inline';
  value: string;  // 原始 TeX 文本（不含分隔符）
}

interface SupramarkMathBlockNode extends SupramarkBaseNode {
  type: 'math_block';
  value: string;  // 原始 TeX 文本（不含分隔符）
  data?: {
    /**
     * 可选的公式编号（例如 $$ ... $$(1.1) 中的 "1.1"）
     */
    equationNumber?: string;
  };
}
```

在节点分类中：

- `math_inline` 属于 **行内节点（Inline）**；
- `math_block` 属于 **块级节点（Block）**。

与 mdast 的关系：

- `math_inline` ≈ `InlineMath`；
- `math_block` ≈ `Math`。

---

## 3. 解析管线（当前实现）

目前，默认解析器 `parseMarkdown()` 基于 **markdown-it**，并在内部启用了 [`markdown-it-texmath`](https://github.com/goessner/markdown-it-texmath)：

```ts
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';

const md = new MarkdownIt({ /* ... */ });

md.use(texmath, {
  // 仅使用 $ / $$ 分隔符，engine 使用空对象占位，避免在 core 中直接引入 KaTeX。
  engine: {},
  delimiters: 'dollars',
} as any);
```

`markdown-it-texmath` 会在解析阶段产生以下 token：

- 行内：`math_inline` / `math_inline_double`；
- 块级：`math_block` / `math_block_eqno`。

在 supramark 的 token → AST 映射阶段，这些 token 会被转换为 Math 节点：

```ts
// 行内
case 'math_inline':
case 'math_inline_double': {
  const mathInlineNode: SupramarkMathInlineNode = {
    type: 'math_inline',
    value: token.content,
  };
  if (token.type === 'math_inline_double') {
    mathInlineNode.data = { ...(mathInlineNode.data ?? {}), displayMode: true };
  }
  current.children.push(mathInlineNode);
  break;
}

// 块级
case 'math_block':
case 'math_block_eqno': {
  const mathBlock: SupramarkMathBlockNode = {
    type: 'math_block',
    value: token.content,
  };
  if (token.type === 'math_block_eqno' && typeof token.info === 'string' && token.info) {
    mathBlock.data = { ...(mathBlock.data ?? {}), equationNumber: token.info };
  }
  parent.children.push(mathBlock);
  break;
}
```

> 小结：**core 层已经可以稳定产生 `math_inline` / `math_block` AST 节点**，后续渲染层可以直接消费这些节点。

---

## 4. 渲染策略（当前实现）

### 4.1 Web 端：KaTeX 渲染

在 Web 端，supramark 提供了与 diagram 类似的辅助方法：

- 通过 `@supramark/web` 导出的 `buildMathSupportScripts()`；
- 在服务端生成 HTML 时，将该函数返回的脚本片段拼接到页面中；
- 浏览器加载完成后：
  - 从 CDN 引入 KaTeX CSS + JS；
  - 扫描 `data-suprimark-math="inline"` / `"block"` 的节点；
  - 调用 `katex.render(tex, element, { displayMode })` 完成渲染。

占位 DOM 结构：

- 行内公式（React / SSR）：

  ```html
  <span data-suprimark-math="inline">E = mc^2</span>
  ```

- 块级公式：

  ```html
  <div data-suprimark-math="block"><code>...</code></div>
  ```

所有这些由 `@supramark/web` 内部完成，业务只需：

```ts
import {
  Supramark,
  parseMarkdown,
  buildDiagramSupportScripts,
  buildMathSupportScripts,
} from '@supramark/web';

const scripts = buildDiagramSupportScripts() + buildMathSupportScripts();
```

### 4.2 React Native 端：headless WebView + MathJax

在 RN 端，Math 通过 `@supramark/rn-diagram-worker` 的 headless WebView 实现：

- WebView 内加载 MathJax v3（`tex-svg` bundle），暴露 `MathJax.tex2svgPromise()`；
- worker 收到 `{ engine: 'math', code, options }` 请求后：
  - 调用 `MathJax.tex2svgPromise(tex, { display })` 生成 SVG DOM；
  - 抽取 `<svg>` 元素，序列化为字符串，并通过 `postMessage` 回传；
- RN 端通过 `DiagramRenderProvider` / `useDiagramRender()` 获取 SVG 字符串，再交给 `@supramark/rn` 的 SVG 渲染管线展示。

这一实现与图表渲染子系统共用同一个 headless WebView，实现：

- 多种 engine 统一缓存和超时控制；
- 与 Mermaid / Vega-Lite / ECharts 一致的错误协议。

### 4.3 历史兼容：占位渲染模式

在最早期版本中，Math 仅以「带特殊样式的文本」形式渲染（不经过 KaTeX/MathJax）。  
当前仍保留这种行为作为降级选项：当浏览器或 WebView 无法正常加载 KaTeX/MathJax 时，占位文本仍然可读，保证不会出现空白区域或崩溃。

---

## 5. 当前状态与下一步计划

**当前状态：**

- ✅ 在 AST 中定义 `math_inline` / `math_block` 节点；
- ✅ 在 `parseMarkdown()` 中集成 `markdown-it-texmath` 并映射为 supramark AST；
- ✅ Web 端通过 `buildMathSupportScripts()` + KaTeX 完成真实公式渲染；
- ✅ RN 端通过 headless WebView + MathJax v3（SVG 输出）完成真实公式渲染；
- ✅ 示例项目中已包含 Math 演示（见 `examples/demos（从各 Feature 包聚合）` 与各端示例）。

**后续可能的增强：**

- 提供更精细的公式样式与对齐控制（行距、公式编号位置等）；
- 支持更多 KaTeX/MathJax 配置项的透传（宏、自定义命令、字体等）；
- 在 CLI / Feature 级别提供 Math 渲染开关与主题化配置。
