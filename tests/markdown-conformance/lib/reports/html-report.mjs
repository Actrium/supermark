export function renderCommonMarkHtmlReport({
  summary,
  visualFailures,
  semanticFailures,
  caseById,
  sourceVersion,
}) {
  const visual = summary.visual ?? {};
  const sectionEntries = Object.entries(visual.bySection ?? {}).filter(
    ([, counts]) => counts.failed > 0 || counts.errors > 0
  );
  const cards = visualFailures.map(failure =>
    renderFailureCard(failure, caseById.get(failure.id), visual.bySection?.[failure.section]?.nameZh)
  ).join('\n');
  const sectionRows = sectionEntries.map(([section, counts]) => `
    <tr>
      <td>${escapeHtml(counts.nameZh ?? section)}</td>
      <td>${escapeHtml(section)}</td>
      <td>${counts.total}</td>
      <td>${counts.passed}</td>
      <td class="number-fail">${counts.failed}</td>
      <td class="number-error">${counts.errors}</td>
    </tr>`).join('');
  const sectionOptions = sectionEntries.map(([section, counts]) =>
    `<option value="${escapeAttribute(section)}">${escapeHtml(counts.nameZh ?? section)}（${counts.failed + counts.errors}）</option>`
  ).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CommonMark 语义与视觉对照测试报告</title>
  <style>
    :root {
      color-scheme: light;
      --background: #f4f6f8;
      --surface: #ffffff;
      --border: #d8dee4;
      --text: #1f2328;
      --muted: #59636e;
      --pass: #1a7f37;
      --fail: #cf222e;
      --error: #9a6700;
      --accent: #0969da;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background: var(--background);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      line-height: 1.55;
    }
    main { width: min(1560px, calc(100% - 32px)); margin: 24px auto 64px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    h2 { margin: 0; font-size: 18px; }
    .subtitle { color: var(--muted); margin: 0 0 22px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .metric, .panel, .case {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .metric { padding: 14px 16px; }
    .metric-label { color: var(--muted); font-size: 13px; }
    .metric-value { margin-top: 4px; font-size: 25px; font-weight: 700; }
    .metric-value.pass { color: var(--pass); }
    .metric-value.fail { color: var(--fail); }
    .panel { padding: 16px; margin: 16px 0; overflow-x: auto; }
    .metadata { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: 14px; }
    code { font-family: Consolas, "Liberation Mono", monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
    th { color: var(--muted); font-size: 13px; }
    .number-fail { color: var(--fail); font-weight: 700; }
    .number-error { color: var(--error); font-weight: 700; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(240px, 1fr) minmax(220px, 360px) auto;
      gap: 10px;
      align-items: center;
      margin: 20px 0 14px;
      padding: 12px;
      background: rgba(244, 246, 248, 0.96);
      border: 1px solid var(--border);
      border-radius: 10px;
      backdrop-filter: blur(8px);
    }
    input, select {
      width: 100%;
      min-height: 38px;
      padding: 7px 10px;
      color: var(--text);
      background: white;
      border: 1px solid var(--border);
      border-radius: 6px;
      font: inherit;
    }
    .visible-count { color: var(--muted); white-space: nowrap; }
    .case {
      border-left: 6px solid var(--fail);
      padding: 16px;
      margin: 16px 0;
    }
    .case-error { border-left-color: var(--error); }
    .case-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .case-id { overflow-wrap: anywhere; }
    .status {
      flex: none;
      padding: 3px 9px;
      color: white;
      background: var(--fail);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .case-error .status { background: var(--error); }
    .case-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0 14px; color: var(--muted); font-size: 14px; }
    .images { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
    figure { margin: 0; min-width: 0; padding: 9px; border: 1px solid var(--border); border-radius: 7px; background: #fff; }
    figcaption { margin-bottom: 8px; color: var(--muted); font-size: 13px; font-weight: 600; }
    figure a { display: block; overflow: auto; border: 1px solid #eef0f2; background: #fff; }
    figure img { display: block; width: 100%; height: auto; min-height: 60px; object-fit: contain; background: #fff; }
    .missing-image { display: grid; min-height: 120px; place-items: center; color: var(--muted); background: #f6f8fa; }
    details { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
    summary { cursor: pointer; color: var(--accent); font-weight: 600; }
    pre { margin: 10px 0 0; padding: 12px; overflow: auto; white-space: pre-wrap; background: #f6f8fa; border-radius: 6px; }
    .error-message { color: #82071e; background: #ffebe9; }
    .empty { padding: 42px 16px; color: var(--muted); text-align: center; }
    .case[hidden] { display: none; }
    @media (max-width: 980px) {
      .images { grid-template-columns: 1fr; }
      .toolbar { grid-template-columns: 1fr; position: static; }
    }
  </style>
</head>
<body>
<main>
  <h1>CommonMark 语义与视觉对照测试报告</h1>
  <p class="subtitle">数据源 CommonMark ${escapeHtml(sourceVersion)}，固定提交 <code>${escapeHtml(summary.sourceCommit)}</code></p>

  <section class="summary-grid" aria-label="测试汇总">
    ${renderMetric('总用例数', summary.total)}
    ${renderMetric('生产 DOM 语义通过', `${summary.passed}/${summary.total}`, summary.notPassed === 0 ? 'pass' : 'fail')}
    ${renderMetric('视觉通过', `${visual.passed ?? 0}/${visual.total ?? 0}`, visual.notPassed === 0 ? 'pass' : 'fail')}
    ${renderMetric('视觉失败', visual.failed ?? 0, visual.failed > 0 ? 'fail' : 'pass')}
    ${renderMetric('视觉执行错误', visual.errors ?? 0, visual.errors > 0 ? 'fail' : 'pass')}
    ${renderMetric('语义未通过', semanticFailures.length, semanticFailures.length > 0 ? 'fail' : 'pass')}
  </section>

  <section class="panel">
    <div class="metadata">
      <span>语义对照对象：<code>${escapeHtml(summary.comparisonTarget)}</code></span>
      <span>生产渲染实现：<code>${escapeHtml(visual.renderer?.implementation ?? '未加载')}</code></span>
      <span>浏览器：Chromium ${escapeHtml(visual.browser?.version ?? '未执行')}</span>
      <span>视口：${escapeHtml(visual.viewport?.width ?? '-')}px / dSF ${escapeHtml(visual.viewport?.deviceScaleFactor ?? '-')}</span>
      <span>像素差异阈值：${escapeHtml(visual.thresholds?.maxDiffPixels ?? '-')}</span>
      <span>差异比例阈值：${formatPercent(visual.thresholds?.maxDiffRatio)}</span>
    </div>
  </section>

  <section class="panel">
    <h2>未通过视觉用例的章节分布</h2>
    ${sectionEntries.length === 0 ? '<p class="empty">没有未通过的视觉用例。</p>' : `
    <table>
      <thead><tr><th>中文章节</th><th>CommonMark 章节</th><th>总数</th><th>通过</th><th>失败</th><th>错误</th></tr></thead>
      <tbody>${sectionRows}</tbody>
    </table>`}
  </section>

  <div class="toolbar" aria-label="失败用例筛选">
    <input id="case-search" type="search" placeholder="搜索用例 ID、章节或 Markdown 内容" />
    <select id="section-filter">
      <option value="">全部失败章节</option>
      ${sectionOptions}
    </select>
    <span id="visible-count" class="visible-count">显示 ${visualFailures.length} 条</span>
  </div>

  <section id="failure-list">
    ${cards || '<div class="panel empty">本次没有未通过的视觉用例。</div>'}
  </section>
</main>
<script>
  const search = document.querySelector('#case-search');
  const section = document.querySelector('#section-filter');
  const count = document.querySelector('#visible-count');
  const cases = [...document.querySelectorAll('.case')];
  function applyFilter() {
    const query = search.value.trim().toLocaleLowerCase('zh-CN');
    const selectedSection = section.value;
    let visible = 0;
    for (const card of cases) {
      const matchesText = !query || card.dataset.search.includes(query);
      const matchesSection = !selectedSection || card.dataset.section === selectedSection;
      card.hidden = !(matchesText && matchesSection);
      if (!card.hidden) visible += 1;
    }
    count.textContent = '显示 ' + visible + ' 条';
  }
  search.addEventListener('input', applyFilter);
  section.addEventListener('change', applyFilter);
</script>
</body>
</html>`;
}

function renderFailureCard(failure, testCase, sectionNameZh) {
  const images = failure.images ?? {};
  const markdown = testCase?.input?.markdown ?? '';
  const expectedHtml = testCase?.expected?.html ?? '';
  const section = failure.section ?? '未知章节';
  const searchValue = [failure.id, section, sectionNameZh, markdown].join(' ').toLocaleLowerCase('zh-CN');
  const isError = failure.status === 'error';
  return `<article class="case ${isError ? 'case-error' : 'case-fail'}" data-section="${escapeAttribute(section)}" data-search="${escapeAttribute(searchValue)}">
    <div class="case-header">
      <h2 class="case-id"><code>${escapeHtml(failure.id)}</code></h2>
      <span class="status">${isError ? '执行错误' : '视觉不一致'}</span>
    </div>
    <div class="case-meta">
      <span>章节：${escapeHtml(sectionNameZh ?? section)}（${escapeHtml(section)}）</span>
      <span>差异像素：${escapeHtml(failure.diffPixels ?? '-')}</span>
      <span>差异比例：${formatPercent(failure.diffRatio)}</span>
      <span>画布：${escapeHtml(failure.width ?? '-')} × ${escapeHtml(failure.height ?? '-')} px</span>
    </div>
    ${failure.error ? `<pre class="error-message">${escapeHtml(failure.error)}</pre>` : ''}
    <div class="images">
      ${renderImage('CommonMark 预期效果', images.expected, `${failure.id} 预期效果`)}
      ${renderImage('Supramark 实际效果', images.actual, `${failure.id} 实际效果`)}
      ${renderImage('像素差异图', images.diff, `${failure.id} 像素差异`)}
    </div>
    ${testCase ? `<details>
      <summary>查看 Markdown 输入与 CommonMark 预期 HTML</summary>
      <h3>Markdown 输入</h3>
      <pre>${escapeHtml(markdown)}</pre>
      <h3>CommonMark 预期 HTML</h3>
      <pre>${escapeHtml(expectedHtml)}</pre>
    </details>` : ''}
  </article>`;
}

function renderImage(label, imagePath, alt) {
  if (!imagePath) {
    return `<figure><figcaption>${escapeHtml(label)}</figcaption><div class="missing-image">未生成图片</div></figure>`;
  }
  const source = `./${String(imagePath).replaceAll('\\', '/')}`;
  return `<figure>
    <figcaption>${escapeHtml(label)}（点击查看原图）</figcaption>
    <a href="${escapeAttribute(source)}" target="_blank" rel="noopener"><img src="${escapeAttribute(source)}" alt="${escapeAttribute(alt)}" loading="lazy" /></a>
  </figure>`;
}

function renderMetric(label, value, className = '') {
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value ${className}">${escapeHtml(value)}</div></div>`;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(4)}%` : '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
