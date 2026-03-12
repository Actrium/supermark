import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (Mermaid) Feature 使用示例
 */
export const diagramMermaidExamples: ExampleDefinition[] = [
  {
    name: '流程图示例',
    description: '使用 ```mermaid 围栏代码块定义一个流程图。',
    markdown: `
# Mermaid 流程图示例

\`\`\`mermaid
graph TD
  A[开始] --> B{条件判断}
  B -->|是| C[执行操作]
  B -->|否| D[跳过]
  C --> E[结束]
  D --> E
\`\`\`
    `.trim(),
  },
  {
    name: '时序图示例',
    description: '使用 ```mermaid 围栏代码块定义一个时序图。',
    markdown: `
# Mermaid 时序图示例

\`\`\`mermaid
sequenceDiagram
  participant Client
  participant Server
  participant DB
  Client->>Server: POST /api/login
  Server->>DB: 查询用户
  DB-->>Server: 返回用户数据
  Server-->>Client: 200 OK + token
\`\`\`
    `.trim(),
  },
  {
    name: '类图示例',
    description: '使用 ```mermaid 围栏代码块定义一个类图。',
    markdown: `
# Mermaid 类图示例

\`\`\`mermaid
classDiagram
  class Animal {
    +String name
    +int age
    +makeSound()
  }
  class Dog {
    +fetch()
  }
  class Cat {
    +purr()
  }
  Animal <|-- Dog
  Animal <|-- Cat
\`\`\`
    `.trim(),
  },
];
