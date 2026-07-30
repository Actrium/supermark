/**
 * Weather Feature definition
 *
 * Implements the ContainerFeature interface, providing a weather card container.
 *
 * @example
 * ```markdown
 * :::weather json
 * {
 *   "location": "Beijing",
 *   "units": "metric"
 * }
 * :::
 *
 * :::weather yaml
 * location: Tokyo
 * units: imperial
 * :::
 *
 * :::weather toon
 * location: London
 * units: metric
 * :::
 * ```
 *
 * @packageDocumentation
 */

import {
  registerContainerHook,
  extractContainerInnerText,
  type ContainerFeature,
  type ContainerHook,
  type ContainerHookContext,
  type SupramarkContainerNode,
} from '@supramark/core';

// ============================================================================
// Container name definition (single source of truth)
// ============================================================================

/**
 * Container names supported by Weather
 */
export const WEATHER_CONTAINER_NAMES = ['weather'] as const;

export type WeatherContainerName = (typeof WEATHER_CONTAINER_NAMES)[number];

/**
 * Supported config formats
 *
 * - json: standard JSON format
 * - yaml: YAML format (default, most readable)
 * - toon: compact tabular format, e.g. `key[n]{fields}: val1,val2,...`
 */
export type WeatherConfigFormat = 'json' | 'yaml' | 'toon';

/**
 * Weather node data structure
 */
export interface WeatherData {
  /** Config format */
  format: WeatherConfigFormat;
  /** Location / city */
  location?: string;
  /** Temperature unit: metric (Celsius) / imperial (Fahrenheit) */
  units?: 'metric' | 'imperial';
  /** Whether to show the forecast */
  showForecast?: boolean;
  /** Number of forecast days */
  days?: number;
  /** Raw config text (kept when parsing fails) */
  rawConfig?: string;
  /** Parse error message */
  parseError?: string;
}

// ============================================================================
// Config parsing
// ============================================================================

/**
 * Parse JSON config
 */
function parseJsonConfig(content: string): Partial<WeatherData> {
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    return {
      location: obj.location as string | undefined,
      units: obj.units as 'metric' | 'imperial' | undefined,
      showForecast: (obj.showForecast ?? obj.show_forecast) as boolean | undefined,
      days: obj.days as number | undefined,
    };
  } catch (e) {
    return { parseError: `JSON parse error: ${(e as Error).message}` };
  }
}

/**
 * Parse YAML config (simple implementation, supports basic key: value format)
 */
function parseYamlConfig(content: string): Partial<WeatherData> {
  try {
    const result: Record<string, unknown> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([\w_]+):\s*(.*)$/);
      if (match) {
        const [, key, rawValue] = match;
        let value: unknown = rawValue;

        // Type coercion
        if (rawValue === 'true') value = true;
        else if (rawValue === 'false') value = false;
        else if (/^-?\d+$/.test(rawValue)) value = parseInt(rawValue, 10);
        else if (/^-?\d+\.\d+$/.test(rawValue)) value = parseFloat(rawValue);
        else if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
                 (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
          value = rawValue.slice(1, -1);
        }

        result[key] = value;
      }
    }

    return {
      location: result.location as string | undefined,
      units: result.units as 'metric' | 'imperial' | undefined,
      showForecast: (result.showForecast ?? result.show_forecast) as boolean | undefined,
      days: result.days as number | undefined,
    };
  } catch (e) {
    return { parseError: `YAML parse error: ${(e as Error).message}` };
  }
}

/**
 * Parse TOON config
 *
 * TOON is a compact tabular data format:
 * - Simple key:value format (one per line)
 * - Array format: `key[count]{field1,field2}: val1,val2`
 *
 * @example
 * ```
 * location: Beijing
 * units: metric
 * ```
 *
 * @example
 * ```
 * forecast[3]{day,high,low}:
 *   Mon,25,18
 *   Tue,27,19
 *   Wed,24,17
 * ```
 */
function parseToonConfig(content: string): Partial<WeatherData> {
  try {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      i++;

      if (!line || line.startsWith('#')) continue;

      // Try to match array format: key[count]{fields}:
      const arrayMatch = line.match(/^([\w_]+)\[(\d+)\]\{([^}]+)\}:\s*$/);
      if (arrayMatch) {
        const [, key, countStr, fieldsStr] = arrayMatch;
        const count = parseInt(countStr, 10);
        const fields = fieldsStr.split(',').map(f => f.trim());
        const items: Record<string, unknown>[] = [];

        // Read the next `count` data lines
        for (let j = 0; j < count && i < lines.length; j++) {
          const dataLine = lines[i].trim();
          i++;
          if (!dataLine) {
            j--; // Skip blank lines
            continue;
          }

          const values = dataLine.split(',').map(v => v.trim());
          const item: Record<string, unknown> = {};
          fields.forEach((field, idx) => {
            let val: unknown = values[idx] ?? '';
            // Type coercion
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (typeof val === 'string' && /^-?\d+$/.test(val)) val = parseInt(val, 10);
            else if (typeof val === 'string' && /^-?\d+\.\d+$/.test(val)) val = parseFloat(val);
            item[field] = val;
          });
          items.push(item);
        }

        result[key] = items;
        continue;
      }

      // Simple key: value format
      const kvMatch = line.match(/^([\w_]+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, rawValue] = kvMatch;
        let value: unknown = rawValue;

        // Type coercion
        if (rawValue === 'true') value = true;
        else if (rawValue === 'false') value = false;
        else if (/^-?\d+$/.test(rawValue)) value = parseInt(rawValue, 10);
        else if (/^-?\d+\.\d+$/.test(rawValue)) value = parseFloat(rawValue);

        result[key] = value;
      }
    }

    return {
      location: result.location as string | undefined,
      units: result.units as 'metric' | 'imperial' | undefined,
      showForecast: (result.showForecast ?? result.show_forecast) as boolean | undefined,
      days: result.days as number | undefined,
    };
  } catch (e) {
    return { parseError: `TOON parse error: ${(e as Error).message}` };
  }
}

/**
 * Parse config content based on format
 */
function parseConfig(content: string, format: WeatherConfigFormat): Partial<WeatherData> {
  switch (format) {
    case 'json':
      return parseJsonConfig(content);
    case 'yaml':
      return parseYamlConfig(content);
    case 'toon':
      return parseToonConfig(content);
    default:
      return { parseError: `Unsupported format: ${String(format)}` };
  }
}

/**
 * Parse the format argument from token.info
 */
function parseFormat(info: string): WeatherConfigFormat {
  const parts = (info || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const format = parts[1].toLowerCase();
    if (format === 'json' || format === 'yaml' || format === 'toon') {
      return format;
    }
  }
  // Default to yaml (most readable)
  return 'yaml';
}

// ============================================================================
// Parsing logic
// ============================================================================

function createWeatherContainerHook(name: string): ContainerHook {
  return {
    name,
    opaque: true,
    onOpen(ctx: ContainerHookContext) {
      const { token, stack, sourceLines } = ctx;
      const format = parseFormat(token.info || '');

      // Extract container content
      const innerText = extractContainerInnerText(token, sourceLines);

      // Parse config
      const parsed = parseConfig(innerText, format);

      const data: WeatherData = {
        format,
        location: parsed.location,
        units: parsed.units,
        showForecast: parsed.showForecast,
        days: parsed.days,
        parseError: parsed.parseError,
        rawConfig: parsed.parseError ? innerText : undefined,
      };

      const node: SupramarkContainerNode = {
        type: 'container' as const,
        name: 'weather',
        params: token.info ? String(token.info) : undefined,
        data: { ...data },
        children: [],
      };

      const parent = stack[stack.length - 1];
      parent.children.push(node);
      stack.push(node);
    },
    onClose(ctx: ContainerHookContext) {
      const top = ctx.stack[ctx.stack.length - 1] as SupramarkContainerNode;
      if (top && top.type === 'container' && top.name === 'weather') {
        ctx.stack.pop();
      }
    },
  };
}

/**
 * Register the Weather parser
 */
function registerWeatherParser(): void {
  for (const name of WEATHER_CONTAINER_NAMES) {
    registerContainerHook(createWeatherContainerHook(name));
  }
}

// ============================================================================
// Feature definition (implements the ContainerFeature interface)
// ============================================================================

/**
 * Weather Feature
 *
 * A weather card container, supporting JSON/YAML/TOML config formats
 */
export const weatherFeature: ContainerFeature = {
  id: '@supramark/feature-weather',
  name: 'Weather',
  version: '0.1.0',
  description: 'A weather card container, supporting JSON/YAML/TOML config formats',

  containerNames: [...WEATHER_CONTAINER_NAMES],

  registerParser: registerWeatherParser,

  webRendererExport: 'renderWeatherContainerWeb',
  rnRendererExport: 'renderWeatherContainerRN',
};
