import type { ExampleDefinition } from '@supramark/core';

/**
 * GFM Feature usage examples
 */
export const gfmExamples: ExampleDefinition[] = [
  {
    name: 'GFM extensions',
    description: 'Shows GitHub Flavored Markdown extensions such as strikethrough, task lists, and tables.',
    markdown: `
# GFM feature examples

## Strikethrough

Use the \`~~text~~\` syntax to create ~~strikethrough~~ text.

For example: this is a piece of ~~wrong~~ correct text.

## Task lists

Use \`- [ ]\` and \`- [x]\` to create a task list:

- [x] Completed task
- [ ] Incomplete task
- [x] Another completed task
- [ ] A to-do item

## Combining formats

You can combine strikethrough with other formatting:

- **bold** and ~~strikethrough~~
- *italic* and ~~strikethrough~~
- \`code\` and ~~strikethrough~~

~~**Bold strikethrough for a whole sentence**~~

## Tables

Use GFM table syntax to create tables, with support for column alignment:

| Feature | Status | Notes |
| --- | :---: | ---: |
| Strikethrough | ✅ | Uses \`~~\` syntax |
| Task list | ✅ | Uses \`[ ]\` and \`[x]\` |
| Table | ✅ | Standard GFM table |
| Alignment | ✅ | Left, center, right |
    `.trim(),
  },
];
