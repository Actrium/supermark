import type MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import type Token from 'markdown-it/lib/token.mjs';

import {
  SUPRAMARK_ADMONITION_KINDS,
  type SupramarkAdmonitionKind,
  type SupramarkParentNode,
  type SupramarkContainerNode,
} from '../ast.js';
import { type SupramarkConfig, isFeatureEnabled, getFeatureOptionsAs } from '../feature.js';

interface AdmonitionOptions {
  kinds?: SupramarkAdmonitionKind[];
}

interface ContainerRuntimeConfig {
  htmlEnabled: boolean;
  admonitionKinds: SupramarkAdmonitionKind[];
}

/**
 * 容器语法处理上下文。
 *
 * - sourceLines: 按行拆分的原始 Markdown 文本；
 * - stack: 当前 AST 父节点栈（与 parseMarkdown 中保持一致）。
 */
export interface ContainerProcessorContext {
  config?: SupramarkConfig;
  sourceLines: string[];
  stack: SupramarkParentNode[];
}

/**
 * 供 Feature 级容器 hook 使用的上下文。
 *
 * - 在 ContainerProcessorContext 基础上增加当前 token / name / phase。
 */
export interface ContainerHookContext extends ContainerProcessorContext {
  token: Token;
  name: string;
  phase: 'open' | 'close';
}

export interface ContainerHook {
  /** 容器名称，对应 :::name 中的 name */
  name: string;

  /**
   * 是否为“不透明容器”
   *
   * - opaque = true 时，容器内部的 token 将不会进入默认 AST 构建流程；
   * - 典型用法：:::map / :::html 等需要直接基于原始文本进行解析的语法。
   */
  opaque?: boolean;

  onOpen: (ctx: ContainerHookContext) => void;
  onClose?: (ctx: ContainerHookContext) => void;
}

const customContainerHooks: ContainerHook[] = [];

export function registerContainerHook(hook: ContainerHook): void {
  customContainerHooks.push(hook);
}

function findContainerHook(name: string): ContainerHook | undefined {
  return customContainerHooks.find(hook => hook.name === name);
}

/**
 * 根据配置，在 MarkdownIt 实例上注册所有需要的容器语法。
 *
 * 当前支持：
 * - Admonition：::: note / ::: warning 等；
 * - HTML Page：:::html；
 * - Map：:::map；
 * - 通过 registerContainerHook() 注册的自定义容器。
 */
export function registerContainerSyntax(md: MarkdownIt, config?: SupramarkConfig): void {
  const containerConfig = resolveContainerRuntimeConfig(config);

  // Admonition 容器块
  if (containerConfig.admonitionKinds.length > 0) {
    for (const kind of containerConfig.admonitionKinds) {
      container(md, kind, {});
    }
  }

  // HTML Page 容器（:::html）
  if (containerConfig.htmlEnabled) {
    container(md, 'html', {});
  }

  // Map 容器（:::map）由 feature-map 提供语义解析，这里仅注册语法。
  if (config && isFeatureEnabled(config, '@supramark/feature-map')) {
    container(md, 'map', {});
  }

  // 自定义容器 hook（通过 registerContainerHook 注册的）
  const registeredNames = new Set<string>([
    ...containerConfig.admonitionKinds,
    ...(containerConfig.htmlEnabled ? ['html'] : []),
  ]);
  for (const hook of customContainerHooks) {
    if (!registeredNames.has(hook.name)) {
      container(md, hook.name, {});
      registeredNames.add(hook.name);
    }
  }
}

/**
 * 创建一个容器语法 token 处理器。
 *
 * - 在 parseMarkdown 主循环中调用；
 * - 如果返回 true，表示当前 token 已被容器层消费，调用方应跳过后续处理；
 * - 支持“透明容器”（admonition）和“不透明容器”（html/map）。
 */
export function createContainerTokenProcessor(
  context: ContainerProcessorContext
): (token: Token) => boolean {
  const { config, sourceLines, stack } = context;
  const containerConfig = resolveContainerRuntimeConfig(config);

  // 记录当前是否处于“不透明容器”（例如 html / map）内部：
  // 一旦进入不透明容器，直到对应 close token 之前，所有 token 都会被跳过。
  const opaqueContainerStack: string[] = [];

  return (token: Token): boolean => {
    const match = /^container_(.+)_(open|close)$/.exec(token.type);

    if (match) {
      const name = match[1];
      const phase = match[2] as 'open' | 'close';

      // Feature 级容器 hook（允许覆盖内置行为）
      const hook = findContainerHook(name);
      if (hook) {
        const hookCtx: ContainerHookContext = {
          config,
          sourceLines,
          stack,
          token,
          name,
          phase,
        };
        if (phase === 'open') {
          hook.onOpen(hookCtx);
          if (hook.opaque) {
            opaqueContainerStack.push(name);
          }
        } else {
          if (hook.onClose) {
            hook.onClose(hookCtx);
          }
          if (hook.opaque && opaqueContainerStack[opaqueContainerStack.length - 1] === name) {
            opaqueContainerStack.pop();
          }
        }
        return true;
      }

      // Admonition 容器块（::: note / ::: warning 等）——透明容器，内部继续按普通 Markdown 解析
      // 现在使用统一的 container 节点，通过 name 字段区分类型
      if (containerConfig.admonitionKinds.includes(name as SupramarkAdmonitionKind)) {
        if (phase === 'open') {
          const info = (token.info || '').trim();
          const parts = info.split(/\s+/);
          // info 形如 "note 标题..."，去掉第一个单词（容器名），剩余部分作为标题
          const titleParts = parts.length > 1 ? parts.slice(1) : [];
          const title = titleParts.length > 0 ? titleParts.join(' ') : undefined;
          const admonitionContainer: SupramarkContainerNode = {
            type: 'container',
            name: name, // 'note', 'warning', 'tip', etc.
            params: title,
            data: { kind: name, title },
            children: [],
          };
          const parentForAdmonition = stack[stack.length - 1];
          parentForAdmonition.children.push(admonitionContainer);
          stack.push(admonitionContainer);
        } else {
          const maybeContainer = stack[stack.length - 1];
          if (maybeContainer.type === 'container' && containerConfig.admonitionKinds.includes((maybeContainer as SupramarkContainerNode).name as SupramarkAdmonitionKind)) {
            stack.pop();
          }
        }
        return true;
      }
    }

    // 处于不透明容器内部时，跳过所有非容器 token
    if (opaqueContainerStack.length > 0) {
      return true;
    }

    return false;
  };
}

// ----------------------------------------------------------------------------
// 内部工具函数
// ----------------------------------------------------------------------------

function resolveContainerRuntimeConfig(config?: SupramarkConfig): ContainerRuntimeConfig {
  const hasConfig = !!config && !!config.features && config.features.length > 0;
  const isFeatureOn = (id: string): boolean => {
    if (!hasConfig) return true;
    return isFeatureEnabled(config!, id);
  };

  const result: ContainerRuntimeConfig = {
    htmlEnabled: false,
    admonitionKinds: [],
  };

  // Admonition
  if (isFeatureOn('@supramark/feature-admonition')) {
    const adOptions =
      getFeatureOptionsAs<AdmonitionOptions>(config, '@supramark/feature-admonition') ?? {};

    const kinds =
      adOptions.kinds && adOptions.kinds.length > 0 ? adOptions.kinds : SUPRAMARK_ADMONITION_KINDS;

    result.admonitionKinds = kinds.slice();
  }

  // HTML Page
  if (isFeatureOn('@supramark/feature-html-page')) {
    result.htmlEnabled = true;
  }

  return result;
}

/**
 * 从 container_open token 的信息中提取容器内部原始文本。
 *
 * markdown-it-container 约定：
 * - token.map[0] 为起始行（含 :::name）；
 * - token.map[1] 为结束行之后的行号；
 * - 因此内部内容行范围为 [start + 1, end - 1]。
 */
export function extractContainerInnerText(token: Token, sourceLines: string[]): string {
  if (!token.map || token.map.length !== 2) return '';
  const [start, end] = token.map;
  const innerStart = start + 1;
  const innerEnd = end - 1 > innerStart ? end - 1 : end;
  return sourceLines.slice(innerStart, innerEnd).join('\n');
}
