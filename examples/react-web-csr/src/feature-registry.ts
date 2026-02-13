/**
 * Lazy feature registry for preview app.
 *
 * Keeps the initial bundle small by loading feature packages on demand.
 */

import type { ExampleDefinition } from '@supramark/core';

export type FeatureCategory = 'container' | 'basic' | 'diagram';

export interface FeatureEntry {
  shortName: string;
  displayName: string;
  description?: string;
  category?: FeatureCategory;
}

export interface LoadedFeature extends FeatureEntry {
  version: string;
  examples: ExampleDefinition[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  containerRenderers?: Record<string, any>;
}

type FeatureModule = Record<string, unknown>;

const FEATURE_LIST: FeatureEntry[] = [
  {
    shortName: 'admonition',
    displayName: 'Admonition',
    description: '提示框容器块（note / tip / warning 等）',
    category: 'container',
  },
  {
    shortName: 'weather',
    displayName: 'Weather',
    description: '天气卡片容器，支持 JSON / YAML / TOML 配置',
    category: 'container',
  },
  {
    shortName: 'core-markdown',
    displayName: 'Core Markdown',
    description: '基础 Markdown 语法（段落 / 标题 / 列表等）',
    category: 'basic',
  },
  {
    shortName: 'gfm',
    displayName: 'GFM',
    description: 'GitHub Flavored Markdown（删除线 / 任务列表 / 表格）',
    category: 'basic',
  },
  {
    shortName: 'emoji',
    displayName: 'Emoji',
    description: 'Emoji 短代码支持（:smile: → 😄）',
    category: 'basic',
  },
  { shortName: 'math', displayName: 'Math', description: 'LaTeX 数学公式支持', category: 'basic' },
  {
    shortName: 'footnote',
    displayName: 'Footnote',
    description: '脚注语法支持（引用 + 定义）',
    category: 'basic',
  },
  {
    shortName: 'definition-list',
    displayName: 'Definition List',
    description: '定义列表语法支持（Term + 多段描述）',
    category: 'basic',
  },
  {
    shortName: 'diagram-dot',
    displayName: 'Diagram DOT',
    description: 'DOT / Graphviz 图表',
    category: 'diagram',
  },
  {
    shortName: 'diagram-echarts',
    displayName: 'Diagram ECharts',
    description: 'ECharts 图表',
    category: 'diagram',
  },
  {
    shortName: 'diagram-plantuml',
    displayName: 'Diagram PlantUML',
    description: 'PlantUML 图表（SVG 远程渲染）',
    category: 'diagram',
  },
  {
    shortName: 'diagram-vega-lite',
    displayName: 'Diagram Vega-Lite',
    description: 'Vega-Lite 数据可视化图表',
    category: 'diagram',
  },
];

export const featureRegistry = FEATURE_LIST;

const featureLoaders: Record<string, () => Promise<FeatureModule>> = {
  admonition: () => import('@supramark/feature-admonition/web'),
  'core-markdown': () => import('@supramark/feature-core-markdown'),
  'definition-list': () => import('@supramark/feature-definition-list'),
  'diagram-dot': () => import('@supramark/feature-diagram-dot'),
  'diagram-echarts': () => import('@supramark/feature-diagram-echarts'),
  'diagram-plantuml': () => import('@supramark/feature-diagram-plantuml'),
  'diagram-vega-lite': () => import('@supramark/feature-diagram-vega-lite'),
  emoji: () => import('@supramark/feature-emoji'),
  footnote: () => import('@supramark/feature-footnote'),
  gfm: () => import('@supramark/feature-gfm'),
  math: () => import('@supramark/feature-math'),
  weather: () => import('@supramark/feature-weather/web'),
};

const featureCache = new Map<string, LoadedFeature>();
const parserRegistered = new Set<string>();

function isExamplesArray(value: unknown): value is ExampleDefinition[] {
  return (
    Array.isArray(value) &&
    value.every(item => item && typeof item === 'object' && 'markdown' in item)
  );
}

function extractFeatureObject(mod: FeatureModule): Record<string, unknown> | undefined {
  return Object.values(mod).find(value => {
    if (!value || typeof value !== 'object') return false;
    const maybeFeature = value as Record<string, unknown>;
    return (
      (maybeFeature.metadata && typeof maybeFeature.metadata === 'object') ||
      (typeof maybeFeature.id === 'string' && typeof maybeFeature.version === 'string')
    );
  }) as Record<string, unknown> | undefined;
}

function extractExamples(mod: FeatureModule): ExampleDefinition[] {
  for (const value of Object.values(mod)) {
    if (isExamplesArray(value)) return value;
  }
  return [];
}

function extractWebRenderer(
  shortName: string,
  mod: FeatureModule
): Record<string, unknown> | undefined {
  for (const [key, value] of Object.entries(mod)) {
    if (/^render.*ContainerWeb$/.test(key) && typeof value === 'function') {
      return { [shortName]: value };
    }
  }
  return undefined;
}

function metadataName(featureObj: Record<string, unknown>): string | undefined {
  const metadata = featureObj.metadata as Record<string, unknown> | undefined;
  if (metadata && typeof metadata.name === 'string') return metadata.name;
  if (typeof featureObj.name === 'string') return featureObj.name;
  return undefined;
}

function metadataVersion(featureObj: Record<string, unknown>): string {
  const metadata = featureObj.metadata as Record<string, unknown> | undefined;
  if (metadata && typeof metadata.version === 'string') return metadata.version;
  if (typeof featureObj.version === 'string') return featureObj.version;
  return 'unknown';
}

function registerParserIfNeeded(shortName: string, featureObj: Record<string, unknown>): void {
  if (parserRegistered.has(shortName)) return;
  if (typeof featureObj.registerParser === 'function') {
    (featureObj.registerParser as () => void)();
    parserRegistered.add(shortName);
  }
}

export function findFeature(name: string): FeatureEntry | undefined {
  const lowered = name.toLowerCase();
  return featureRegistry.find(
    feature => feature.shortName === name || feature.displayName.toLowerCase() === lowered
  );
}

export async function loadFeature(shortName: string): Promise<LoadedFeature> {
  const cached = featureCache.get(shortName);
  if (cached) return cached;

  const base = featureRegistry.find(feature => feature.shortName === shortName);
  if (!base) throw new Error(`Unknown feature: ${shortName}`);

  const load = featureLoaders[shortName];
  if (!load) throw new Error(`No loader configured for feature: ${shortName}`);

  const mod = await load();
  const featureObj = extractFeatureObject(mod) ?? {};
  registerParserIfNeeded(shortName, featureObj);

  const loaded: LoadedFeature = {
    shortName,
    displayName: metadataName(featureObj) ?? base.displayName,
    version: metadataVersion(featureObj),
    examples: extractExamples(mod),
    containerRenderers: extractWebRenderer(shortName, mod),
  };

  featureCache.set(shortName, loaded);
  return loaded;
}
