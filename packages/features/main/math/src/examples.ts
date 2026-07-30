import type { ExampleDefinition } from '@supramark/core';

/**
 * Math Feature usage examples
 */
export const mathExamples: ExampleDefinition[] = [
  {
    name: 'Math formulas (Math / LaTeX)',
    description: 'Shows the AST and basic rendering of inline `$...$` and block `$$...$$` math formulas.',
    markdown: `
# Math Formula Example

supramark recognizes the inline formula $E = mc^2$ and generates a \`math_inline\` node in the AST.

Below is a block formula (\`math_block\`):

$$
\\frac{1}{\\sqrt{2\\pi\\sigma^2}} e^{-\\frac{(x - \\mu)^2}{2\\sigma^2}}
$$

At the current stage, these formulas are rendered as "code-styled TeX text"; they will later be upgraded to real formula rendering via KaTeX and similar tools.
    `.trim(),
  },
];
