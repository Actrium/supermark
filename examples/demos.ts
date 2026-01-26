/**
 * 聚合所有 Feature 的示例数据
 * 每个 Feature 现在自包含其示例，这里只负责聚合和导出
 */

import { mathExamples } from '@supramark/feature-math';
import { gfmExamples } from '@supramark/feature-gfm';
import { admonitionExamples } from '@supramark/feature-admonition';
import { definitionListExamples } from '@supramark/feature-definition-list';
import { emojiExamples } from '@supramark/feature-emoji';
import { footnoteExamples } from '@supramark/feature-footnote';
import { coreMarkdownExamples } from '@supramark/feature-core-markdown';
import { htmlPageExamples } from '@supramark/feature-html-page';
import { mapExamples } from '@supramark/feature-map';

// 聚合所有示例，添加唯一 id 字段
export const DEMOS = [
  ...coreMarkdownExamples.map((ex, idx) => ({ ...ex, id: `core-${idx}` })),
  ...mathExamples.map((ex, idx) => ({ ...ex, id: `math-${idx}` })),
  ...gfmExamples.map((ex, idx) => ({ ...ex, id: `gfm-${idx}` })),
  ...admonitionExamples.map((ex, idx) => ({ ...ex, id: `admonition-${idx}` })),
  ...definitionListExamples.map((ex, idx) => ({ ...ex, id: `definition-list-${idx}` })),
  ...emojiExamples.map((ex, idx) => ({ ...ex, id: `emoji-${idx}` })),
  ...footnoteExamples.map((ex, idx) => ({ ...ex, id: `footnote-${idx}` })),
  ...htmlPageExamples.map((ex, idx) => ({ ...ex, id: `html-page-${idx}` })),
  ...mapExamples.map((ex, idx) => ({ ...ex, id: `map-${idx}` })),
];
