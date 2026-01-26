import type { ContainerHookContext, SupramarkContainerNode } from '@supramark/core';
import { registerContainerHook } from '@supramark/core';

export interface WeatherContainerData {
  city?: string;
  condition?: string;
  /** Temperature in Celsius */
  tempC?: number;
  /** Optional icon url */
  icon?: string;
  /** Any extra key/values */
  meta?: Record<string, string>;
}

function extractInnerText(ctx: ContainerHookContext): string {
  const { token, sourceLines } = ctx;
  if (!token.map || token.map.length !== 2) return '';
  const [start, end] = token.map;
  const innerStart = start + 1;
  const innerEnd = end - 1 > innerStart ? end - 1 : end;
  return sourceLines.slice(innerStart, innerEnd).join('\n');
}

function parseWeatherConfig(raw: string): WeatherContainerData {
  const lines = raw.split(/\r?\n/);
  const data: WeatherContainerData = {};
  const meta: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();

    switch (key) {
      case 'city':
        data.city = value;
        break;
      case 'condition':
        data.condition = value;
        break;
      case 'tempC':
      case 'temp': {
        const num = Number.parseFloat(value);
        if (!Number.isNaN(num)) data.tempC = num;
        break;
      }
      case 'icon':
        data.icon = value;
        break;
      default:
        meta[key] = value;
    }
  }

  if (Object.keys(meta).length > 0) {
    data.meta = meta;
  }

  return data;
}

/**
 * Register :::weather container hook.
 *
 * The parser produces a generic `type: 'container'` node:
 * `{ type: 'container', name: 'weather', data: WeatherContainerData }`
 */
registerContainerHook({
  name: 'weather',
  opaque: true,
  onOpen(ctx: ContainerHookContext) {
    const raw = extractInnerText(ctx);
    const data = parseWeatherConfig(raw);

    const node: SupramarkContainerNode = {
      type: 'container',
      name: 'weather',
      data: data as Record<string, unknown>,
      children: [],
    };

    const parent = ctx.stack[ctx.stack.length - 1];
    parent.children.push(node);
  },
});

