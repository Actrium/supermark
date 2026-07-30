import type { ExampleDefinition } from '@supramark/core';

/**
 * PlantUML Feature usage examples
 *
 * Each example is kept as short as possible for fast rendering in the preview app. Examples cover
 * common UML diagram families: sequence diagrams / class diagrams / activity diagrams.
 */
export const plantumlExamples: ExampleDefinition[] = [
  {
    name: 'Sequence diagram example',
    description: 'Uses a ```plantuml fence to define a minimal sequence diagram.',
    markdown: `
# PlantUML sequence diagram

\`\`\`plantuml
@startuml
Bob -> Alice : hello
Alice -> Bob : hi
@enduml
\`\`\`
    `.trim(),
  },
  {
    name: 'Class diagram example',
    description: 'Shows PlantUML class diagram syntax.',
    markdown: `
# PlantUML class diagram

\`\`\`plantuml
@startuml
class Animal {
  +name: String
  +eat(): void
}
class Dog extends Animal {
  +bark(): void
}
@enduml
\`\`\`
    `.trim(),
  },
  {
    name: 'Activity diagram example',
    description: 'Shows PlantUML activity diagram syntax.',
    markdown: `
# PlantUML activity diagram

\`\`\`plantuml
@startuml
start
:Read input;
if (valid?) then (yes)
  :Process;
else (no)
  :Reject;
endif
stop
@enduml
\`\`\`
    `.trim(),
  },
];
