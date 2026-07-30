import type { SupramarkConfig } from './types.js';

/**
 * Lightweight validator — avoids ajv so the CLI doesn't pull in a heavy dependency.
 * Only performs structural checks plus a handful of key semantic checks.
 */

export class ConfigError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`[supramark.config] ${path}: ${message}`);
    this.name = 'ConfigError';
    this.path = path;
  }
}

const ECHARTS_CHARTS = new Set([
  'Line', 'Bar', 'Pie', 'Scatter', 'EffectScatter', 'Radar',
  'Tree', 'TreeMap', 'Sunburst', 'Boxplot', 'Candlestick',
  'Heatmap', 'Map', 'Parallel', 'Lines', 'Graph', 'Sankey',
  'Funnel', 'Gauge', 'PictorialBar', 'ThemeRiver', 'Custom',
]);

const ECHARTS_COMPONENTS = new Set([
  'Grid', 'Polar', 'GeoComponent', 'SingleAxis', 'Parallel',
  'Calendar', 'Graphic', 'Toolbox', 'Tooltip', 'AxisPointer',
  'Brush', 'Title', 'Timeline', 'MarkPoint', 'MarkLine', 'MarkArea',
  'Legend', 'DataZoom', 'VisualMap', 'Dataset', 'Transform', 'Aria',
]);

const ADMONITION_KINDS = new Set(['note', 'tip', 'info', 'warning', 'danger']);

export function validate(config: unknown): asserts config is SupramarkConfig {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new ConfigError('/', 'config must be a JSON object');
  }
  const c = config as Record<string, unknown>;

  if (c.platform !== undefined && c.platform !== 'web' && c.platform !== 'rn') {
    throw new ConfigError('/platform', `must be "web" | "rn", got ${JSON.stringify(c.platform)}`);
  }

  if (c.out !== undefined && typeof c.out !== 'string') {
    throw new ConfigError('/out', 'must be a string');
  }

  if (c.graphviz !== undefined) {
    const gv = c.graphviz;
    if (gv !== false && gv !== 'web' && gv !== 'rn') {
      throw new ConfigError('/graphviz', `must be false | "web" | "rn", got ${JSON.stringify(gv)}`);
    }
  }

  if (c.echarts !== undefined) {
    if (c.echarts === null || typeof c.echarts !== 'object' || Array.isArray(c.echarts)) {
      throw new ConfigError('/echarts', 'must be an object');
    }
    const ec = c.echarts as Record<string, unknown>;
    if (!('charts' in ec)) {
      throw new ConfigError('/echarts/charts', 'required');
    }
    validateEchartsList('/echarts/charts', ec.charts, ECHARTS_CHARTS);
    if (ec.components !== undefined) {
      validateEchartsList('/echarts/components', ec.components, ECHARTS_COMPONENTS);
    }
    if (ec.renderers !== undefined) {
      if (!Array.isArray(ec.renderers)) {
        throw new ConfigError('/echarts/renderers', 'must be an array');
      }
      for (const r of ec.renderers) {
        if (r !== 'svg' && r !== 'canvas') {
          throw new ConfigError('/echarts/renderers', `invalid renderer ${JSON.stringify(r)}`);
        }
      }
    }
  }

  if (c.features !== undefined) {
    if (c.features === null || typeof c.features !== 'object' || Array.isArray(c.features)) {
      throw new ConfigError('/features', 'must be an object');
    }
    const f = c.features as Record<string, unknown>;
    if (f.admonition !== undefined && typeof f.admonition === 'object' && f.admonition !== null) {
      const kinds = (f.admonition as { kinds?: unknown }).kinds;
      if (kinds !== undefined) {
        if (!Array.isArray(kinds)) {
          throw new ConfigError('/features/admonition/kinds', 'must be an array');
        }
        for (const k of kinds) {
          if (typeof k !== 'string' || !ADMONITION_KINDS.has(k)) {
            throw new ConfigError(
              '/features/admonition/kinds',
              `invalid kind ${JSON.stringify(k)}; valid: ${[...ADMONITION_KINDS].join(', ')}`
            );
          }
        }
      }
    }
  }
}

function validateEchartsList(
  path: string,
  value: unknown,
  validSet: Set<string>
): void {
  if (value === '*') return;
  if (!Array.isArray(value)) {
    throw new ConfigError(path, 'must be "*" or an array');
  }
  for (const name of value) {
    if (typeof name !== 'string' || !validSet.has(name)) {
      throw new ConfigError(
        path,
        `unknown name ${JSON.stringify(name)}; valid: ${[...validSet].slice(0, 8).join(', ')}...`
      );
    }
  }
}
