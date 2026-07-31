export function renderConformanceHtmlReport({
  summary,
  visualFailures,
  semanticFailures,
  caseById,
  sourceVersion,
}) {
  const sourceDisplayName = escapeHtml(summary.sourceDisplayName ?? summary.source);
  const visual = summary.visual ?? {};
  const sectionEntries = Object.entries(visual.bySection ?? {}).filter(
    ([, counts]) => counts.failed > 0 || counts.errors > 0
  );
  const cards = visualFailures.map(failure =>
    renderFailureCard(failure, caseById.get(failure.id), visual.bySection?.[failure.section]?.sectionLabel)
  ).join('\n');
  const sectionRows = sectionEntries.map(([section, counts]) => `
    <tr>
      <td>${escapeHtml(counts.sectionLabel ?? section)}</td>
      <td>${escapeHtml(section)}</td>
      <td>${counts.total}</td>
      <td>${counts.passed}</td>
      <td class="number-fail">${counts.failed}</td>
      <td class="number-error">${counts.errors}</td>
    </tr>`).join('');
  const sectionOptions = sectionEntries.map(([section, counts]) =>
    `<option value="${escapeAttribute(section)}">${escapeHtml(counts.sectionLabel ?? section)} (${counts.failed + counts.errors})</option>`
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CommonMark semantic &amp; visual conformance report</title>
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
  <h1>CommonMark semantic &amp; visual conformance report</h1>
  <p class="subtitle">Source CommonMark ${escapeHtml(sourceVersion)}, pinned commit <code>${escapeHtml(summary.sourceCommit)}</code></p>

  <section class="summary-grid" aria-label="Test summary">
    ${renderMetric('Total cases', summary.total)}
    ${renderMetric('Production DOM semantic pass', `${summary.passed}/${summary.total}`, summary.notPassed === 0 ? 'pass' : 'fail')}
    ${renderMetric('Visual pass', `${visual.passed ?? 0}/${visual.total ?? 0}`, visual.notPassed === 0 ? 'pass' : 'fail')}
    ${renderMetric('Visual failures', visual.failed ?? 0, visual.failed > 0 ? 'fail' : 'pass')}
    ${renderMetric('Visual execution errors', visual.errors ?? 0, visual.errors > 0 ? 'fail' : 'pass')}
    ${renderMetric('Semantic not passed', semanticFailures.length, semanticFailures.length > 0 ? 'fail' : 'pass')}
  </section>

  <section class="panel">
    <div class="metadata">
      <span>Semantic comparison target: <code>${escapeHtml(summary.comparisonTarget)}</code></span>
      <span>Production renderer implementation: <code>${escapeHtml(visual.renderer?.implementation ?? 'not loaded')}</code></span>
      <span>Browser: Chromium ${escapeHtml(visual.browser?.version ?? 'not run')}</span>
      <span>Viewport: ${escapeHtml(visual.viewport?.width ?? '-')}px / dSF ${escapeHtml(visual.viewport?.deviceScaleFactor ?? '-')}</span>
      <span>Pixel diff threshold: ${escapeHtml(visual.thresholds?.maxDiffPixels ?? '-')}</span>
      <span>Diff ratio threshold: ${formatPercent(visual.thresholds?.maxDiffRatio)}</span>
    </div>
  </section>

  <section class="panel">
    <h2>Section breakdown of not-passing visual cases</h2>
    ${sectionEntries.length === 0 ? '<p class="empty">No not-passing visual cases.</p>' : `
    <table>
      <thead><tr><th>Section label</th><th>CommonMark section</th><th>Total</th><th>Passed</th><th>Failed</th><th>Errors</th></tr></thead>
      <tbody>${sectionRows}</tbody>
    </table>`}
  </section>

  <div class="toolbar" aria-label="Failure case filters">
    <input id="case-search" type="search" placeholder="Search case ID, section, or Markdown content" />
    <select id="section-filter">
      <option value="">All failing sections</option>
      ${sectionOptions}
    </select>
    <span id="visible-count" class="visible-count">Showing ${visualFailures.length} case(s)</span>
  </div>

  <section id="failure-list">
    ${cards || '<div class="panel empty">No not-passing visual cases this run.</div>'}
  </section>
</main>
<script>
  const search = document.querySelector('#case-search');
  const section = document.querySelector('#section-filter');
  const count = document.querySelector('#visible-count');
  const cases = [...document.querySelectorAll('.case')];
  function applyFilter() {
    const query = search.value.trim().toLocaleLowerCase('en-US');
    const selectedSection = section.value;
    let visible = 0;
    for (const card of cases) {
      const matchesText = !query || card.dataset.search.includes(query);
      const matchesSection = !selectedSection || card.dataset.section === selectedSection;
      card.hidden = !(matchesText && matchesSection);
      if (!card.hidden) visible += 1;
    }
    count.textContent = 'Showing ' + visible + ' case(s)';
  }
  search.addEventListener('input', applyFilter);
  section.addEventListener('change', applyFilter);
</script>
</body>
</html>`.replaceAll('CommonMark', sourceDisplayName);
}

function renderFailureCard(failure, testCase, sectionLabel) {
  const images = failure.images ?? {};
  const markdown = testCase?.input?.markdown ?? '';
  const expectedHtml = testCase?.expected?.html ?? '';
  const section = failure.section ?? 'unknown section';
  const searchValue = [failure.id, section, sectionLabel, markdown].join(' ').toLocaleLowerCase('en-US');
  const isError = failure.status === 'error';
  return `<article class="case ${isError ? 'case-error' : 'case-fail'}" data-section="${escapeAttribute(section)}" data-search="${escapeAttribute(searchValue)}">
    <div class="case-header">
      <h2 class="case-id"><code>${escapeHtml(failure.id)}</code></h2>
      <span class="status">${isError ? 'Execution error' : 'Visual mismatch'}</span>
    </div>
    <div class="case-meta">
      <span>Section: ${escapeHtml(sectionLabel ?? section)} (${escapeHtml(section)})</span>
      <span>Diff pixels: ${escapeHtml(failure.diffPixels ?? '-')}</span>
      <span>Diff ratio: ${formatPercent(failure.diffRatio)}</span>
      <span>Canvas: ${escapeHtml(failure.width ?? '-')} × ${escapeHtml(failure.height ?? '-')} px</span>
    </div>
    ${failure.error ? `<pre class="error-message">${escapeHtml(failure.error)}</pre>` : ''}
    <div class="images">
      ${renderImage('CommonMark expected', images.expected, `${failure.id} expected`)}
      ${renderImage('Supramark actual', images.actual, `${failure.id} actual`)}
      ${renderImage('Pixel diff', images.diff, `${failure.id} pixel diff`)}
    </div>
    ${testCase ? `<details>
      <summary>View Markdown input and CommonMark expected HTML</summary>
      <h3>Markdown input</h3>
      <pre>${escapeHtml(markdown)}</pre>
      <h3>CommonMark expected HTML</h3>
      <pre>${escapeHtml(expectedHtml)}</pre>
    </details>` : ''}
  </article>`;
}

function renderImage(label, imagePath, alt) {
  if (!imagePath) {
    return `<figure><figcaption>${escapeHtml(label)}</figcaption><div class="missing-image">No image generated</div></figure>`;
  }
  const source = `./${String(imagePath).replaceAll('\\', '/')}`;
  return `<figure>
    <figcaption>${escapeHtml(label)} (click to view full size)</figcaption>
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
