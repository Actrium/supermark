import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (PlantUML) Feature 使用示例
 */
export const diagramPlantUmlExamples: ExampleDefinition[] = [
  {
    name: '时序图示例',
    description: '使用 ```plantuml 围栏代码块定义一个最简单的时序图。',
    markdown: `
# PlantUML diagram 示例

\`\`\`plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: World
@enduml
\`\`\`
    `.trim(),
  },
];

