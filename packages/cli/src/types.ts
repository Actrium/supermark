/**
 * TypeScript shape of supramark.config.json (kept aligned with src/schema/config.v1.json).
 *
 * See the schema file for field-level comments; only the type structure is kept here.
 */

export type Platform = 'web' | 'rn';

export type EchartsChart =
  | 'Line' | 'Bar' | 'Pie' | 'Scatter' | 'EffectScatter' | 'Radar'
  | 'Tree' | 'TreeMap' | 'Sunburst' | 'Boxplot' | 'Candlestick'
  | 'Heatmap' | 'Map' | 'Parallel' | 'Lines' | 'Graph' | 'Sankey'
  | 'Funnel' | 'Gauge' | 'PictorialBar' | 'ThemeRiver' | 'Custom';

export type EchartsComponent =
  | 'Grid' | 'Polar' | 'GeoComponent' | 'SingleAxis' | 'Parallel'
  | 'Calendar' | 'Graphic' | 'Toolbox' | 'Tooltip' | 'AxisPointer'
  | 'Brush' | 'Title' | 'Timeline' | 'MarkPoint' | 'MarkLine' | 'MarkArea'
  | 'Legend' | 'DataZoom' | 'VisualMap' | 'Dataset' | 'Transform' | 'Aria';

export type EchartsRenderer = 'svg' | 'canvas';

export type AdmonitionKind = 'note' | 'tip' | 'info' | 'warning' | 'danger';

export interface FeaturesConfig {
  gfm?: boolean | { tables?: boolean; taskListItems?: boolean; strikethrough?: boolean };
  math?: boolean | { engine?: 'mathjax' | 'katex' };
  footnote?: boolean;
  emoji?: boolean | { nativeOnly?: boolean };
  admonition?: boolean | { kinds?: AdmonitionKind[] };
  'definition-list'?: boolean;
}

export interface EchartsConfig {
  charts: '*' | EchartsChart[];
  components?: '*' | EchartsComponent[];
  renderers?: EchartsRenderer[];
}

export interface VegaLiteConfig {
  dialect?: 'vega' | 'vega-lite';
}

export interface SupramarkConfig {
  $schema?: string;
  out?: string;
  platform?: Platform;
  features?: FeaturesConfig;
  mermaid?: boolean | { theme?: 'default' | 'dark' | 'neutral' | 'forest' };
  mathjax?: boolean;
  graphviz?: false | 'web' | 'rn';
  echarts?: EchartsConfig;
  'vega-lite'?: boolean | VegaLiteConfig;
}
