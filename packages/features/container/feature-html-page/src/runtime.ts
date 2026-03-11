import type { ContainerHookContext } from '@supramark/core';
import { registerContainerHook } from '@supramark/core';
import type { SupramarkHtmlPageNode } from '@supramark/core';

function extractInnerText(ctx: ContainerHookContext): string {
  const { token, sourceLines } = ctx;
  if (!token.map || token.map.length !== 2) return '';
  const [start, end] = token.map;
  const innerStart = start + 1;
  const innerEnd = end - 1 > innerStart ? end - 1 : end;
  return sourceLines.slice(innerStart, innerEnd).join('\n');
}

// 注册 HTML Page 容器 hook：
// - name: 'html'
// - opaque: true（容器内部 token 不再进入默认 AST 构建流程）
registerContainerHook({
  name: 'html',
  opaque: true,
  onOpen(ctx: ContainerHookContext) {
    const html = extractInnerText(ctx);
    const htmlPage: SupramarkHtmlPageNode = {
      type: 'html_page',
      html,
    };
    const parent = ctx.stack[ctx.stack.length - 1];
    parent.children.push(htmlPage);
  },
});

