import type { ContainerHookContext } from '@supramark/core';
import { registerContainerHook } from '@supramark/core';
import type { SupramarkContainerNode } from '@supramark/core';

function extractInnerText(ctx: ContainerHookContext): string {
  const { token, sourceLines } = ctx;
  if (!token.map || token.map.length !== 2) return '';
  const [start, end] = token.map;
  const innerStart = start + 1;
  const innerEnd = end - 1 > innerStart ? end - 1 : end;
  return sourceLines.slice(innerStart, innerEnd).join('\n');
}

// Register the HTML Page container hook:
// - name: 'html'
// - opaque: true (tokens inside the container no longer enter the default AST build flow)
registerContainerHook({
  name: 'html',
  opaque: true,
  onOpen(ctx: ContainerHookContext) {
    const html = extractInnerText(ctx);
    const htmlPage: SupramarkContainerNode = {
      type: 'container',
      name: 'html',
      mode: 'opaque',
      value: html,
      data: { html },
      children: [],
    };
    const parent = ctx.stack[ctx.stack.length - 1];
    parent.children.push(htmlPage);
  },
});
