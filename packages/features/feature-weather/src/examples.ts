/**
 * Weather Feature 示例
 *
 * @packageDocumentation
 */

import type { ExampleDefinition } from '@supramark/core';

export const weatherExamples: ExampleDefinition[] = [
  {
    name: '天气卡片 - YAML 格式',
    description: '使用 YAML 格式配置天气卡片（默认格式）',
    markdown: `
:::weather yaml
location: Beijing
units: metric
:::
`.trim(),
  },
  {
    name: '天气卡片 - JSON 格式',
    description: '使用 JSON 格式配置天气卡片',
    markdown: `
:::weather json
{
  "location": "Tokyo",
  "units": "metric"
}
:::
`.trim(),
  },
  {
    name: '天气卡片 - TOON 格式',
    description: '使用 TOON 紧凑表格式格式配置天气卡片',
    markdown: `
:::weather toon
location: London
units: imperial
:::
`.trim(),
  },
  {
    name: '多个天气卡片',
    description: '展示不同城市的天气',
    markdown: `
:::weather yaml
location: New York
units: imperial
:::

:::weather yaml
location: Paris
units: metric
:::

:::weather yaml
location: Sydney
units: metric
:::
`.trim(),
  },
];
