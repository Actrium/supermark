import type { ExampleDefinition } from '@supramark/core';

/**
 * Math Feature 使用示例
 */
export const mathExamples: ExampleDefinition[] = [
  {
    name: '数学公式（Math / LaTeX）',
    description: '展示行内 `$...$` 与块级 `$$...$$` 数学公式的 AST 与基础渲染效果。',
    markdown: `
# 数学公式示例

supramark 会识别行内公式 $E = mc^2$，并在 AST 中生成 \`math_inline\` 节点。

下面是一个块级公式（\`math_block\`）：

$$
\\frac{1}{\\sqrt{2\\pi\\sigma^2}} e^{-\\frac{(x - \\mu)^2}{2\\sigma^2}}
$$

当前阶段，这些公式会以「代码样式的 TeX 文本」渲染，后续会通过 KaTeX 等方式升级为真正的公式渲染。
    `.trim(),
  },
];
