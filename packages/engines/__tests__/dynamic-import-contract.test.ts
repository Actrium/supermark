import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import * as ts from 'typescript';

/**
 * 源码契约测试:packages/engines/src 里所有 dynamic import 的 specifier
 * 必须是字符串字面量(允许 `as string` 类型断言),禁止抽成变量。
 *
 * 背景:echarts/vega-lite loader 曾把 `import('echarts/core')` 改成
 * `const spec = 'echarts/core'; import(spec)`,Vite/Rollup 无法静态分析,
 * build 产物残留 bare specifier,浏览器抛 `Failed to resolve module specifier`
 * (upstream issue #80 / #79)。这条契约把该回归锁死在源码层,CI 的
 * `bun run test`(engines 包)阶段即可拦截,无需 build。
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

/** 判定 dynamic import 的参数是否为可静态分析的字符串字面量。 */
function classifySpecifier(
  arg: ts.Expression | undefined
): { kind: SpecifierKind; text: string | null } {
  if (!arg) return { kind: 'non-literal', text: null };
  // `import('echarts/core')`
  if (ts.isStringLiteral(arg)) return { kind: 'literal', text: arg.text };
  // `import('echarts/core' as string)` —— TS specifier 类型断言,转译后仍为字面量
  if (ts.isAsExpression(arg) && ts.isStringLiteral(arg.expression)) {
    return { kind: 'as-string', text: arg.expression.text };
  }
  // 变量 / 属性访问 / 模板等 —— Vite/Rollup 无法静态分析,即回归形态
  return { kind: 'non-literal', text: null };
}

function collectDynamicImports(filePath: string): DynamicImportSite[] {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sites: DynamicImportSite[] = [];
  const visit = (node: ts.Node): void => {
    // dynamic import 的 AST:CallExpression,其 expression 是 `import` keyword
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

    // 精确点名:这些 bare specifier 必须以静态字面量形式出现在 loader 里,
    // 防止有人把它们抽成变量(抽变量后该集合里就不再含 bare 串)。
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
