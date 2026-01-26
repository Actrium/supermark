import type { ExampleDefinition } from '@supramark/core';

/**
 * Definition List Feature 使用示例
 */
export const definitionListExamples: ExampleDefinition[] = [
  {
    name: '定义列表（Definition List）',
    description: '展示术语 + 多段描述的定义列表语法。',
    markdown: `
# 定义列表示例

HTTP
:   一种应用层协议，用于超文本传输。
:   目前最常见的 Web 协议。

HTTPS
:   在 HTTP 之上加入 TLS 加密的安全协议。
    `.trim(),
  },
];
