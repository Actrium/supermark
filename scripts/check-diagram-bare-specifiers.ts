#!/usr/bin/env node
/**
 * 构建产物冒烟检查:防止 diagram 引擎的 dynamic import specifier 退化成变量。
 *
 * 背景:echarts/vega-lite loader 若把 `import('echarts/core')` 改成
 * `const spec = 'echarts/core'; import(spec)`,Vite/Rollup 无法静态分析,
 * build 产物里会残留 bare specifier 字符串,浏览器原生 ESM 抛
 * `TypeError: Failed to resolve module specifier "echarts/core"`
 * (upstream issue #80 / #79)。
 *
 * 修复后 specifier 为字符串字面量,Rollup 把 echarts 各子模块拆成独立
 * chunk(core-*.js / renderers-*.js / charts-*.js / components-*.js),
 * 产物中不再出现 bare subpath 字符串。
 *
 * 指纹选择:`echarts/renderers` / `echarts/charts` / `echarts/components`
 * —— 这些 subpath 只可能来自 bare specifier 残留,不会作为普通数据出现
 * (`echarts/core` 在合法产物里偶有 1 次良性出现,故避开)。
 * vega / vega-lite 因作为数据 / 包名频繁出现,字符串指纹不可靠,由
 * 源码契约测试(packages/engines/__tests__/dynamic-import-contract.test.ts)
 * 在 specifier 形态层保障。
 *
 * 用法:bun scripts/check-diagram-bare-specifiers.ts
 *   dist 未构建时 skip(exit 0),构建后若残留 bare specifier 则 exit 1。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distAssets = resolve(import.meta.dir, '..', 'examples', 'react-web-csr', 'dist', 'assets');

// 这些 echarts subpath 只可能源自未被静态分析的 bare specifier。
const FINGERPRINTS = ['echarts/renderers', 'echarts/charts', 'echarts/components'];

if (!existsSync(distAssets)) {
  console.warn('[check:diagram-specifiers] skip: examples/react-web-csr/dist 未构建。');
  console.warn('  本检查在产物构建后生效,运行: bun run docs:preview:build');
  process.exit(0);
}

const jsFiles = readdirSync(distAssets).filter(name => name.endsWith('.js'));

const leaks: Array<{ file: string; specifier: string; count: number }> = [];
for (const name of jsFiles) {
  const content = readFileSync(join(distAssets, name), 'utf8');
  for (const specifier of FINGERPRINTS) {
    const count = content.split(specifier).length - 1;
    if (count > 0) leaks.push({ file: name, specifier, count });
  }
}

if (leaks.length > 0) {
  console.error('[check:diagram-specifiers] FAIL: 产物中检测到 bare specifier 残留:');
  for (const leak of leaks) {
    console.error(`  ${leak.file}: "${leak.specifier}" x${leak.count}`);
  }
  console.error('');
  console.error('某处 dynamic import 的 specifier 退化为变量,Vite/Rollup 无法静态分析,');
  console.error('产物保留了 bare specifier,浏览器会抛 Failed to resolve module specifier。');
  console.error('检查 packages/engines/src/js-chart-loaders.ts 与 web.ts 的 import(...) 写法:');
  console.error('  specifier 必须是字符串字面量(可用 `as string` 断言),禁止抽成变量。');
  console.error('源码契约测试见 packages/engines/__tests__/dynamic-import-contract.test.ts。');
  process.exit(1);
}

console.log(
  `[check:diagram-specifiers] OK: 扫描 ${jsFiles.length} 个产物文件,无 bare specifier 残留。`
);
