import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findFirstDifference,
  htmlToSemanticTree,
} from '../lib/semantic/html-semantics.mjs';
import { renderWithProductionWebRenderer } from '../lib/visual/production-web-renderer.mjs';

const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(SUITE_ROOT, '..', '..');
const DEFAULT_BINARY = path.join(
  REPOSITORY_ROOT,
  'target',
  'debug',
  process.platform === 'win32' ? 'supramark-markdown.exe' : 'supramark-markdown'
);
const parserBinary = path.resolve(process.env.SUPRAMARK_MARKDOWN_BIN ?? DEFAULT_BINARY);

const fixtureDirectory = path.join(REPOSITORY_ROOT, 'tests', 'cases', '_fixtures', 'commonmark');
const document = JSON.parse(await readFile(path.join(fixtureDirectory, 'cases.json'), 'utf8'));

const SECTION_NAMES = {
  Tabs: '制表符',
  'Backslash escapes': '反斜杠转义',
  Paragraphs: '段落',
  'Hard line breaks': '硬换行',
  'List items': '列表项',
  Lists: '列表',
};

// 18 fixed cases: 9 hard breaks + 9 list boundaries (kept in display order).
const TARGET_IDS = [
  'commonmark-0.31.2-0016',
  'commonmark-0.31.2-0226',
  'commonmark-0.31.2-0633',
  'commonmark-0.31.2-0634',
  'commonmark-0.31.2-0635',
  'commonmark-0.31.2-0636',
  'commonmark-0.31.2-0637',
  'commonmark-0.31.2-0638',
  'commonmark-0.31.2-0639',
  'commonmark-0.31.2-0009',
  'commonmark-0.31.2-0294',
  'commonmark-0.31.2-0296',
  'commonmark-0.31.2-0300',
  'commonmark-0.31.2-0307',
  'commonmark-0.31.2-0319',
  'commonmark-0.31.2-0320',
  'commonmark-0.31.2-0321',
  'commonmark-0.31.2-0323',
];

const GROUPS = [
  { title: '硬换行(Hard line breaks)', ids: TARGET_IDS.slice(0, 9) },
  { title: '列表项 / 列表边界(List items / Lists)', ids: TARGET_IDS.slice(9) },
];

const selectedCases = TARGET_IDS
  .map(id => document.cases.find(c => c.id === id))
  .filter(Boolean);

const astById = new Map();
for (const testCase of selectedCases) {
  const parsed = spawnSync(parserBinary, ['-'], {
    input: testCase.input.markdown,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (parsed.error || parsed.status !== 0) {
    throw new Error(`parser failed for ${testCase.id}: ${parsed.stderr || parsed.error?.message}`);
  }
  astById.set(testCase.id, JSON.parse(parsed.stdout));
}

console.log(`Rendering ${selectedCases.length} cases with production web renderer...`);
const { htmlById, environment } = await renderWithProductionWebRenderer({
  cases: selectedCases,
  astById,
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function sectionName(section) {
  return SECTION_NAMES[section] ?? section;
}

const cards = [];
let passCount = 0;
for (const testCase of selectedCases) {
  const expected = testCase.expected.html;
  const actual = htmlById.get(testCase.id) ?? '';
  const diff = findFirstDifference(htmlToSemanticTree(expected), htmlToSemanticTree(actual));
  const pass = !diff;
  if (pass) passCount += 1;
  const badge = pass
    ? '<span class="badge pass">语义通过</span>'
    : '<span class="badge fail">语义差异</span>';
  const diffHtml = diff
    ? `<p class="diff">首个差异:<code>${escapeHtml(diff.path ?? '-')}</code></p>`
    : '';
  const mdDisplay = escapeHtml(testCase.input.markdown);
  cards.push(`
<article class="case ${pass ? 'pass' : 'fail'}">
  <h3><code>${escapeHtml(testCase.id)}</code> <small>${escapeHtml(sectionName(testCase.source.section))}</small> ${badge}</h3>
  <div class="block">
    <h4>Markdown 输入</h4>
    <pre class="md">${mdDisplay}</pre>
  </div>
  <div class="render-grid">
    <figure>
      <figcaption>官方 expected(CommonMark 0.31.2)</figcaption>
      <iframe srcdoc="${escapeAttr(expected)}" sandbox=""></iframe>
    </figure>
    <figure>
      <figcaption>修复后实际渲染(Supramark web renderer)</figcaption>
      <iframe srcdoc="${escapeAttr(actual)}" sandbox=""></iframe>
    </figure>
  </div>
  ${diffHtml}
  <details>
    <summary>HTML 源码对比</summary>
    <div class="html-grid">
      <div><h5>官方 expected</h5><pre>${escapeHtml(expected)}</pre></div>
      <div><h5>修复后 actual</h5><pre>${escapeHtml(actual)}</pre></div>
    </div>
  </details>
</article>`);
}

function renderGroup(group) {
  const inner = group.ids
    .map(id => cards[TARGET_IDS.indexOf(id)])
    .join('\n');
  return `<section><h2>${escapeHtml(group.title)}</h2>${inner}</section>`;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CommonMark 修复用例对比 · Supramark #107</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #f6f7f9; color: #1f2328; }
  header { background: #1f2328; color: #fff; padding: 28px 32px; }
  header h1 { margin: 0 0 8px; font-size: 22px; }
  header p { margin: 0; color: #adbac7; max-width: 980px; }
  .stats { display: flex; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
  .stat { background: #2d333b; padding: 10px 16px; border-radius: 8px; }
  .stat b { display: block; font-size: 20px; }
  .stat span { color: #adbac7; font-size: 12px; }
  main { max-width: 1280px; margin: 0 auto; padding: 24px 24px 80px; }
  section > h2 { border-left: 4px solid #2f81f7; padding-left: 12px; margin: 32px 0 16px; }
  .case { background: #fff; border: 1px solid #d0d7de; border-radius: 10px; padding: 18px 20px; margin-bottom: 18px; }
  .case.fail { border-color: #f85149; }
  .case h3 { margin: 0 0 14px; font-size: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .case h3 small { color: #656d76; font-weight: 400; }
  .badge { font-size: 12px; padding: 2px 10px; border-radius: 999px; font-weight: 600; }
  .badge.pass { background: #1f883d; color: #fff; }
  .badge.fail { background: #f85149; color: #fff; }
  .block h4 { margin: 0 0 6px; font-size: 12px; color: #656d76; text-transform: uppercase; letter-spacing: .04em; }
  pre { background: #f6f8fa; border: 1px solid #eaeef2; border-radius: 6px; padding: 10px 12px; margin: 0; overflow: auto; font: 12px/1.5 "SF Mono", Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
  pre.md { white-space: pre; }
  .render-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #656d76; margin-bottom: 6px; font-weight: 600; }
  iframe { width: 100%; height: 160px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; }
  .diff { font-size: 12px; color: #cf222e; margin: 4px 0 0; }
  details { margin-top: 12px; }
  summary { cursor: pointer; font-size: 12px; color: #0969da; }
  .html-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
  .html-grid h5 { margin: 0 0 6px; font-size: 11px; color: #656d76; }
  footer { text-align: center; color: #656d76; font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>CommonMark 修复用例 · 官方对比</h1>
  <p>对应 <a style="color:#539bf5" href="https://github.com/Actrium/supramark/issues/107">Actrium/supramark#107</a>。本页聚焦由 web renderer 引起的 18 个失败用例(硬换行 9 + 列表边界 9),展示 markdown 输入、CommonMark 0.31.2 官方预期 HTML、以及修复(<code>packages/renderers/web/src/Supramark.tsx</code>)后的实际渲染,并标注语义一致性。</p>
  <div class="stats">
    <div class="stat"><b>${passCount}/${selectedCases.length}</b><span>本批语义通过</span></div>
    <div class="stat"><b>181 → 87</b><span>整库语义失败(修复前后)</span></div>
    <div class="stat"><b>${escapeHtml(environment.parser)}</b><span>解析器</span></div>
    <div class="stat"><b>${escapeHtml(environment.browser.name)} ${escapeHtml(environment.browser.version)}</b><span>渲染浏览器</span></div>
  </div>
</header>
<main>
${GROUPS.map(renderGroup).join('\n')}
</main>
<footer>由 <code>tests/markdown-conformance/scripts/generate-fix-report.mjs</code> 生成 · 对照目标 production-web-renderer-dom</footer>
</body>
</html>`;

const outDir = path.join(SUITE_ROOT, 'artifacts', 'fix-report');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'report.html');
await writeFile(outPath, html);
console.log(`pass: ${passCount}/${selectedCases.length}`);
console.log(`report: ${outPath}`);
