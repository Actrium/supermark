import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

import { type SupramarkParentNode, type SupramarkInputNode } from '../ast.js';
import { type SupramarkConfig } from '../feature.js';

/**
 * Input 语法处理上下文。
 *
 * - sourceLines: 按行拆分的原始 Markdown 文本；
 * - stack: 当前 AST 父节点栈（与 parseMarkdown 中保持一致）。
 */
export interface InputProcessorContext {
  config?: SupramarkConfig;
  sourceLines: string[];
  stack: SupramarkParentNode[];
}

/**
 * 供 Feature 级 input hook 使用的上下文。
 *
 * - 在 InputProcessorContext 基础上增加当前 token / name / phase。
 */
export interface InputHookContext extends InputProcessorContext {
  token: Token;
  name: string;
  phase: 'open' | 'close';
}

export interface InputHook {
  /** Input 块名称，对应 %%%name 中的 name */
  name: string;

  /**
   * 是否为"不透明容器"
   *
   * - opaque = true 时，容器内部的 token 将不会进入默认 AST 构建流程；
   * - 典型用法：%%%form 等需要直接基于原始文本进行解析的语法。
   */
  opaque?: boolean;

  onOpen: (ctx: InputHookContext) => void;
  onClose?: (ctx: InputHookContext) => void;
}

const customInputHooks: InputHook[] = [];

export function registerInputHook(hook: InputHook): void {
  customInputHooks.push(hook);
}

function findInputHook(name: string): InputHook | undefined {
  return customInputHooks.find(hook => hook.name === name);
}

/**
 * 在 MarkdownIt 实例上注册 %%% input 块语法。
 *
 * 语法格式：
 * ```
 * %%%name params
 * content
 * %%%
 * ```
 */
export function registerInputSyntax(md: MarkdownIt, _config?: SupramarkConfig): void {
  // 自定义 block rule 来解析 %%% 语法
  md.block.ruler.before('fence', 'input_block', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];
    const lineText = state.src.slice(startPos, maxPos);

    // 检查是否以 %%% 开头
    if (!lineText.startsWith('%%%')) {
      return false;
    }

    // 提取 name 和 params
    const match = lineText.match(/^%%%(\w+)(?:\s+(.*))?$/);
    if (!match) {
      return false;
    }

    if (silent) {
      return true;
    }

    const name = match[1];
    const params = match[2] || '';

    // 查找结束标记 %%%
    let nextLine = startLine + 1;
    let found = false;

    while (nextLine < endLine) {
      const nextLineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const nextLineEnd = state.eMarks[nextLine];
      const nextLineText = state.src.slice(nextLineStart, nextLineEnd);

      if (nextLineText.trim() === '%%%') {
        found = true;
        break;
      }
      nextLine++;
    }

    if (!found) {
      return false;
    }

    // 创建 tokens
    const tokenOpen = state.push('input_open', 'div', 1);
    tokenOpen.info = `${name} ${params}`.trim();
    tokenOpen.map = [startLine, nextLine + 1];
    tokenOpen.block = true;
    tokenOpen.meta = { name, params };

    const tokenClose = state.push('input_close', 'div', -1);
    tokenClose.block = true;

    state.line = nextLine + 1;
    return true;
  });
}

/**
 * 创建 input 语法的 AST 处理器。
 *
 * 返回一个函数，用于在 parseMarkdown 的 token 遍历中处理 input_open / input_close。
 */
export function createInputProcessor(ctx: InputProcessorContext): (token: Token) => boolean {
  const { sourceLines, stack } = ctx;
  const opaqueInputStack: string[] = [];

  return (token: Token): boolean => {
    const tokenType = token.type;

    // input_open / input_close
    if (tokenType === 'input_open' || tokenType === 'input_close') {
      const phase: 'open' | 'close' = tokenType === 'input_open' ? 'open' : 'close';
      const meta = token.meta || {};
      const name = meta.name || '';

      // 查找自定义 hook
      const hook = findInputHook(name);
      if (hook) {
        const hookCtx: InputHookContext = {
          ...ctx,
          token,
          name,
          phase,
        };

        if (phase === 'open') {
          hook.onOpen(hookCtx);
          if (hook.opaque) {
            opaqueInputStack.push(name);
          }
        } else {
          if (hook.onClose) {
            hook.onClose(hookCtx);
          }
          if (hook.opaque && opaqueInputStack[opaqueInputStack.length - 1] === name) {
            opaqueInputStack.pop();
          }
        }
        return true;
      }

      // 默认处理：创建通用 input 节点
      if (phase === 'open') {
        const params = meta.params || '';
        const innerText = extractInputInnerText(token, sourceLines);

        // 解析内容为简单的 key: value 格式
        const data: Record<string, unknown> = {};
        for (const line of innerText.split('\n')) {
          const kvMatch = line.match(/^([\w-]+):\s*(.*)$/);
          if (kvMatch) {
            const [, key, value] = kvMatch;
            // 尝试解析为 number 或 boolean
            if (value === 'true') data[key] = true;
            else if (value === 'false') data[key] = false;
            else if (/^-?\d+(\.\d+)?$/.test(value)) data[key] = parseFloat(value);
            else data[key] = value;
          }
        }

        const inputNode: SupramarkInputNode = {
          type: 'input',
          name,
          params: params || undefined,
          data,
          children: [],
        };

        const parent = stack[stack.length - 1];
        parent.children.push(inputNode);
        // Input 块默认是 opaque，不需要 push 到 stack
      }

      return true;
    }

    // 处于不透明 input 块内部时，跳过所有 token
    if (opaqueInputStack.length > 0) {
      return true;
    }

    return false;
  };
}

/**
 * 从 input_open token 的信息中提取内部原始文本。
 */
export function extractInputInnerText(token: Token, sourceLines: string[]): string {
  if (!token.map || token.map.length !== 2) return '';
  const [start, end] = token.map;
  const innerStart = start + 1;
  const innerEnd = end - 1 > innerStart ? end - 1 : end;
  return sourceLines.slice(innerStart, innerEnd).join('\n');
}
