export type ContainerParamValue = string | boolean;

export interface ContainerParams {
  raw: string;
  values: Record<string, ContainerParamValue>;
}

/**
 * Parse the parameter string following :::name.
 *
 * Rules:
 * - Supports multiple keys: "a=1 b=two flag" -> { a: "1", b: "two", flag: true }
 * - Supports quotes: title="Hello World" / title='Hello World'
 * - true/false (case-insensitive) are converted to a boolean
 * - No number coercion ("1" stays a string)
 */
export function parseContainerParams(raw: string | undefined | null): ContainerParams {
  const text = (raw ?? '').trim();
  const values: Record<string, ContainerParamValue> = {};
  if (!text) return { raw: '', values };

  // A simple tokenizer: supports values wrapped in double or single quotes
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      continue;
    }

    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }

    cur += ch;
  }
  if (cur) tokens.push(cur);

  for (const t of tokens) {
    const eq = t.indexOf('=');
    if (eq === -1) {
      values[t] = true;
      continue;
    }
    const k = t.slice(0, eq);
    const v = t.slice(eq + 1);
    const lower = v.toLowerCase();
    if (lower === 'true') values[k] = true;
    else if (lower === 'false') values[k] = false;
    else values[k] = v;
  }

  return { raw: text, values };
}

/**
 * A container extension's declaration (manifest).
 *
 * Exported from packages/features/container/feature-xxx/src/extension.ts, used to
 * generate the registry.
 */
export interface ContainerExtensionSpec {
  kind: 'container';

  /** The feature package ID (usually the same as the package name) */
  featureId: string;

  /** The unified container node name: when node.type === 'container', matched via node.name === nodeName */
  nodeName: string;

  /** The list of supported :::xxx names (used to register hooks / parse entry points) */
  containerNames: string[];

  /** The export name of the parser registration function (src/syntax.ts) */
  parserExport: string;

  /** The export name of the Web render function (src/runtime.web.tsx) */
  webRendererExport: string;

  /** The export name of the RN render function (src/runtime.rn.tsx) */
  rnRendererExport: string;

  /** Filled in internally by the generator: the feature directory name */
  featureDir?: string;
}
