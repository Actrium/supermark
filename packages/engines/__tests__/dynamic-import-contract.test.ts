import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import * as ts from 'typescript';

/**
 * Source-level contract test: every dynamic import specifier under
 * packages/engines/src must be a string literal (an `as string` type
 * assertion is allowed), never pulled out into a variable.
 *
 * Background: the echarts/vega-lite loaders once turned
 * `import('echarts/core')` into `const spec = 'echarts/core'; import(spec)`.
 * Vite/Rollup can't statically analyze that, so a bare specifier survived
 * into the build output and the browser threw `Failed to resolve module
 * specifier` (upstream issue #80 / #79). This contract locks that regression
 * out at the source level; the `bun run test` step for the engines package
 * catches it without needing a build.
 */

const enginesSrc = resolve(import.meta.dir, '..', 'src');

type SpecifierKind = 'literal' | 'as-string' | 'non-literal';

interface DynamicImportSite {
  file: string;
  line: number;
  specifier: string | null;
  kind: SpecifierKind;
}

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      listTsFiles(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Determines whether a dynamic import's argument is a statically-analyzable string literal. */
function classifySpecifier(
  arg: ts.Expression | undefined
): { kind: SpecifierKind; text: string | null } {
  if (!arg) return { kind: 'non-literal', text: null };
  // `import('echarts/core')`
  if (ts.isStringLiteral(arg)) return { kind: 'literal', text: arg.text };
  // `import('echarts/core' as string)` — a TS type assertion on the specifier, still a literal after transpilation
  if (ts.isAsExpression(arg) && ts.isStringLiteral(arg.expression)) {
    return { kind: 'as-string', text: arg.expression.text };
  }
  // Variable / property access / template literal, etc. — Vite/Rollup can't statically analyze these; this is the regression shape
  return { kind: 'non-literal', text: null };
}

function collectDynamicImports(filePath: string): DynamicImportSite[] {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sites: DynamicImportSite[] = [];
  const visit = (node: ts.Node): void => {
    // AST of a dynamic import: a CallExpression whose expression is the `import` keyword
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const { kind, text } = classifySpecifier(node.arguments[0] as ts.Expression | undefined);
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      sites.push({
        file: relative(enginesSrc, filePath),
        line: line + 1,
        specifier: text,
        kind,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

describe('dynamic import specifier contract', () => {
  const allSites: DynamicImportSite[] = listTsFiles(enginesSrc).flatMap(collectDynamicImports);

  it('every dynamic import in packages/engines/src uses a string-literal specifier, never a variable', () => {
    const violations = allSites.filter(s => s.kind === 'non-literal');
    expect(violations).toEqual([]);
  });

  it('echarts and vega-lite loaders import their bare specifiers as static literals', () => {
    const loadersPath = resolve(enginesSrc, 'js-chart-loaders.ts');
    const sites = collectDynamicImports(loadersPath);
    const literalSpecs = new Set(
      sites.filter(s => s.kind !== 'non-literal' && s.specifier !== null).map(s => s.specifier as string)
    );

    // Named explicitly: these bare specifiers must appear as static literals in
    // the loader, guarding against someone pulling them out into a variable
    // (once extracted, this set would no longer contain the bare string).
    const required = [
      'echarts/core',
      'echarts/renderers',
      'echarts/charts',
      'echarts/components',
      'vega',
      'vega-lite',
    ];
    for (const spec of required) {
      expect(literalSpecs.has(spec)).toBe(true);
    }
  });
});
