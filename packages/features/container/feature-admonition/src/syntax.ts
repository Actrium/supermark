import type Token from 'markdown-it/lib/token.mjs';
import {
  registerContainerHook,
  type ContainerHook,
  type ContainerHookContext,
} from '@supramark/core';

function parseTitle(token: Token, kind: string): string | undefined {
  const info = (token.info || '').trim();
  // info 形如 "note 标题..."，第一个单词是容器名(kind)
  const parts = info.split(/\s+/).filter(Boolean);
  const titleParts = parts.length > 1 ? parts.slice(1) : [];
  return titleParts.length > 0 ? titleParts.join(' ') : undefined;
}

export function createAdmonitionContainerHook(kind: string): ContainerHook {
  return {
    name: kind,
    opaque: false,
    onOpen(ctx: ContainerHookContext) {
      const title = parseTitle(ctx.token, kind);
      const node = {
        type: 'container' as const,
        name: 'admonition',
        params: ctx.token.info ? String(ctx.token.info) : undefined,
        data: {
          kind,
          title,
        },
        children: [],
      };
      const parent = ctx.stack[ctx.stack.length - 1];
      parent.children.push(node as any);
      ctx.stack.push(node as any);
    },
    onClose(ctx: ContainerHookContext) {
      const top = ctx.stack[ctx.stack.length - 1] as any;
      if (top && top.type === 'container' && top.name === 'admonition') {
        ctx.stack.pop();
      }
    },
  };
}

/**
 * 供 generated registry 调用的注册入口（强约定）。
 *
 * - 会为 note/tip/info/warning/danger 都注册 hook
 * - 允许覆盖 core 内置的 admonition 解析（前提：core 侧优先执行 hook）
 */
export function registerAdmonitionContainer(): void {
  for (const kind of ['note', 'tip', 'info', 'warning', 'danger'] as const) {
    registerContainerHook(createAdmonitionContainerHook(kind));
  }
}
