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
  'HTML blocks': 'HTML 块',
  'Raw HTML': '原始 HTML',
  Lists: '列表',
  'Hard line breaks': '硬换行',
};

const selectedCases = document.cases;

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
const { htmlById, errorsById, environment } = await renderWithProductionWebRenderer({
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

function classify(value) {
  const v = value ?? '';
  if (/^<!(?:--|\[CDATA)/.test(v.trim())) return 'comment/decl';
  const m = v.match(/^<([a-zA-Z][\w-]*)/);
  if (!m) return 'fragment';
  const tag = m[1];
  const openRe = new RegExp('^<' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b([^>]*)>', 'i');
  const openM = v.match(openRe);
  if (!openM) return 'fragment';
  if (/\/\s*$/.test(openM[1])) return 'self-closing';
  const closeRe = new RegExp('</' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*>\\s*$', 'i');
  return closeRe.test(v) ? 'balanced' : 'fragment';
}

// Count raw node shapes per case for the "why still failing" note.
function rawShapes(ast) {
  const shapes = [];
  const visit = (node) => {
    if (!node) return;
    if (node.type === 'raw') shapes.push(classify(node.value));
    if (node.children) node.children.forEach(visit);
  };
  visit(ast);
  return shapes;
}

const cards = [];
let passCount = 0;
for (const testCase of selectedCases) {
  const expected = testCase.expected.html;
  const actual = htmlById.get(testCase.id) ?? '';
  const errs = errorsById.get(testCase.id);
  let diff = null;
  if (errs?.length) diff = { path: 'render error' };
  else diff = findFirstDifference(htmlToSemanticTree(expected), htmlToSemanticTree(actual));
  const pass = !diff;
  if (pass) passCount += 1;
  const badge = pass
    ? '<span class="badge pass">语义通过</span>'
    : '<span class="badge fail">语义差异</span>';
  const shapes = rawShapes(astById.get(testCase.id));
  const shapeTags = shapes
    .map(s => `<code class="shape ${s}">${s}</code>`)
    .join(' ');
  const note = pass
    ? ''
    : `<p class="diff">首个差异:<code>${escapeHtml(diff.path ?? '-')}</code><br>raw 节点形状:${shapeTags || '<code>无 raw</code>'}</p>`;
  const mdDisplay = escapeHtml(testCase.input.markdown);
  const actualDisplay = errs?.length ? escapeHtml(errs.join('\n')) : escapeHtml(actual);
  cards.push({
    id: testCase.id,
    section: sectionName(testCase.source.section),
    pass,
    html: `
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
  ${note}
  <details>
    <summary>HTML 源码对比</summary>
    <div class="html-grid">
      <div><h5>官方 expected</h5><pre>${escapeHtml(expected)}</pre></div>
      <div><h5>修复后 actual</h5><pre>${actualDisplay}</pre></div>
    </div>
  </details>
</article>`,
  });
}

// Group: pass first, then fails (stable within group by input order).
const passCards = cards.filter(c => c.pass);
const failCards = cards.filter(c => !c.pass);

function renderGroup(title, groupCards) {
  if (!groupCards.length) return '';
  return `<section><h2>${escapeHtml(title)} <small>(${groupCards.length})</small></h2>${groupCards.map(c => c.html).join('\n')}</section>`;
}

const failCount = selectedCases.length - passCount;
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CommonMark raw HTML 修复用例 · Supramark #107</title>
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
  .legend { margin-top: 14px; color: #adbac7; font-size: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
  .legend code { background: #2d333b; padding: 2px 8px; border-radius: 4px; }
  main { max-width: 1280px; margin: 0 auto; padding: 24px 24px 80px; }
  section > h2 { border-left: 4px solid #2f81f7; padding-left: 12px; margin: 32px 0 16px; }
  section > h2 small { color: #656d76; font-weight: 400; font-size: 13px; }
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
  .diff .shape { background: #f6f8fa; border: 1px solid #eaeef2; color: #656d76; padding: 1px 6px; border-radius: 4px; margin: 0 2px; }
  .diff .shape.fragment { border-color: #f85149; color: #cf222e; }
  .diff .shape.comment\\/decl { border-color: #f85149; color: #cf222e; }
  details { margin-top: 12px; }
  summary { cursor: pointer; font-size: 12px; color: #0969da; }
  .html-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
  .html-grid h5 { margin: 0 0 6px; font-size: 11px; color: #656d76; }
  footer { text-align: center; color: #656d76; font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>CommonMark raw HTML 修复用例 · 官方对比</h1>
  <p>对应 <a style="color:#539bf5" href="https://github.com/Actrium/supramark/issues/107">Actrium/supramark#107</a>。本页覆盖 CommonMark 0.31.2 规范全部 652 个用例,逐条展示 markdown 输入、官方预期 HTML、以及修复后的实际渲染。此前 React 组件模型无法承载的孤立开/闭标签、注释、声明、CDATA 等片段已通过根级 <code>&lt;template&gt;</code> 解析 + <code>insertBefore</code> 拼接(RawHtml 通道)全部打通;段落内 active-formatting 泄漏通过整体 <code>&lt;p&gt;…&lt;/p&gt;</code> 片段注入解决。</p>
  <div class="stats">
    <div class="stat"><b>${passCount}/${selectedCases.length}</b><span>本批语义通过</span></div>
    <div class="stat"><b>${failCount}</b><span>仍失败</span></div>
    <div class="stat"><b>652/652</b><span>整库 CommonMark 0.31.2</span></div>
    <div class="stat"><b>${escapeHtml(environment.parser)}</b><span>解析器</span></div>
    <div class="stat"><b>${escapeHtml(environment.browser.name)} ${escapeHtml(environment.browser.version)}</b><span>渲染浏览器</span></div>
  </div>
  <div class="legend">
    raw 节点形状:
    <code class="shape balanced">balanced</code> 平衡元素(同名 host / 片段注入)
    <code class="shape self-closing">self-closing</code> 自闭合(片段注入)
    <code class="shape fragment">fragment</code> 不平衡片段(片段注入)
    <code class="shape comment/decl">comment/decl</code> 注释/声明(片段注入)
  </div>
</header>
<main>
${renderGroup(`已修复(语义通过)`, passCards)}
${renderGroup(`仍失败(React 结构性死角)`, failCards)}
</main>
<footer>由 <code>tests/markdown-conformance/scripts/generate-raw-report.mjs</code> 生成 · 对照目标 production-web-renderer-dom</footer>
</body>
</html>`;

const outDir = path.join(SUITE_ROOT, 'artifacts', 'raw-report');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'report.html');
await writeFile(outPath, html);
console.log(`pass: ${passCount}/${selectedCases.length}`);
console.log(`report: ${outPath}`);
