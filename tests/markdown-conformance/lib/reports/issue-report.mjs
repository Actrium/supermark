import { htmlToSemanticTree } from '../semantic/html-semantics.mjs';

const REPRESENTATIVE_LIMIT = 5;
const DETAIL_LIMIT = 4_000;

export function renderCommonMarkIssue({
  summary,
  semanticFailures,
  visualFailures,
  caseById,
  astById,
  actualHtmlById,
  sourceVersion,
}) {
  const workflowUrl = summary.runtime?.workflowUrl;
  const representatives = selectRepresentatives(
    summary.failureGroups ?? [],
    semanticFailures,
    visualFailures
  );
  const lines = [
    '<!-- supramark-commonmark-conformance -->',
    '# CommonMark 语义与视觉对照测试失败',
    '',
    '## **问题描述**',
    '',
    `Supramark 使用主仓库默认 Parser 配置执行 ${summary.total} 条 CommonMark ${sourceVersion} 规范用例。`,
    `语义层有 ${summary.notPassed} 条未通过；视觉层有 ${summary.visual.notPassed} 条未通过；共有 ${summary.overallNotPassedCases} 条用例存在至少一种差异。`,
    '',
    '### 运行摘要',
    '',
    '| 项目 | 结果 |',
    '| --- | --- |',
    `| Supramark commit | \`${escapeTableCell(summary.runtime?.supramarkCommit ?? '未知')}\` |`,
    `| 本地分支/引用 | \`${escapeTableCell(summary.runtime?.gitRef ?? '未知')}\` |`,
    `| 工作区状态 | ${summary.runtime?.workspaceDirty ? '**包含未提交修改**' : '干净'} |`,
    `| CommonMark 数据源 | ${sourceVersion} / \`${summary.sourceCommit}\` |`,
    `| 对照目标 | \`${summary.comparisonTarget}\` |`,
    `| Parser | ${escapeTableCell(summary.runtime?.parserName ?? 'supramark-markdown')} ${escapeTableCell(summary.runtime?.parserVersion ?? '未知')} |`,
    `| Renderer | \`${escapeTableCell(summary.visual.renderer?.implementation ?? '未加载')}\` |`,
    `| 浏览器 | Chromium ${escapeTableCell(summary.visual.browser?.version ?? '未执行')} |`,
    `| 平台 | ${escapeTableCell(summary.runtime?.platform ?? '未知')} / ${escapeTableCell(summary.runtime?.arch ?? '未知')} / Node ${escapeTableCell(summary.runtime?.nodeVersion ?? '未知')} |`,
    `| 语义结果 | **${summary.passed}/${summary.total} 通过**，${summary.notPassed} 未通过 |`,
    `| 视觉结果 | **${summary.visual.passed}/${summary.visual.total} 通过**，${summary.visual.notPassed} 未通过 |`,
    `| 生成时间 | ${summary.generatedAt} |`,
    ...(workflowUrl ? [`| Actions 运行 | [打开运行记录](${workflowUrl}) |`] : []),
    '',
    ...renderBaselineDelta(summary.baseline),
    '### 失败功能簇',
    '',
    '| 功能簇 | 唯一失败用例 | 语义未通过 | 视觉未通过 | 建议定位层 |',
    '| --- | ---: | ---: | ---: | --- |',
  ];

  for (const group of summary.failureGroups ?? []) {
    lines.push(
      `| ${escapeTableCell(`${group.nameZh}（${group.section}）`)} | ${group.uniqueCases} | ${group.semanticNotPassed} | ${group.visualNotPassed} | ${escapeTableCell(group.suspectedLayer)} |`
    );
  }
  if ((summary.failureGroups ?? []).length === 0) {
    lines.push('| - | 0 | 0 | 0 | - |');
  }

  lines.push(
    '',
    '## **复现步骤**',
    '',
    '### 完整复现',
    '',
    '1. 在仓库根目录安装用例依赖：`pnpm --dir tests/markdown-conformance install --frozen-lockfile`。',
    '2. 安装锁定版本的 Chromium：`node tests/markdown-conformance/node_modules/playwright/cli.js install chromium`。',
    '3. 构建解析器：`cargo build -p supramark-markdown --bin supramark-markdown`。',
    '4. 导入锁定数据源：`node tests/markdown-conformance/scripts/import.mjs commonmark`。',
    '5. 校验统一用例：`node tests/markdown-conformance/scripts/validate.mjs commonmark`。',
    '6. 执行语义与视觉对照：`node tests/markdown-conformance/scripts/run-commonmark-visual.mjs`。',
    '',
    '### 单条用例复现（不会覆盖完整报告）',
    '',
    fencedCode([
      `$env:CASE_IDS = "${representatives[0]?.id ?? 'commonmark-0.31.2-0020'}"`,
      '$env:FAIL_ON_FAILURES = "0"',
      '$env:ARTIFACT_DIR = "tests/markdown-conformance/artifacts/manual/$env:CASE_IDS"',
      'node tests/markdown-conformance/scripts/run-commonmark-visual.mjs',
      'Remove-Item Env:CASE_IDS',
      'Remove-Item Env:FAIL_ON_FAILURES',
      'Remove-Item Env:ARTIFACT_DIR',
    ].join('\n'), 'powershell'),
    '',
    '## **预期结果**',
    '',
    `- **规范语义**：全部 ${summary.total} 条用例的最终 HTML/DOM 语义与 CommonMark 规范中的预期 HTML 一致。`,
    '- **派生视觉**：在相同 Chromium、CSS、视口和字体环境中，预期 HTML 与 Supramark 实际 HTML 的截图一致。',
    '',
    '> CommonMark 不规定 CSS 或产品主题；视觉层用于辅助发现最终 DOM、内容和结构差异。',
    '',
    '## **实际结果**',
    '',
    `生产 Web Renderer DOM 语义通过 ${summary.passed}/${summary.total} 条；视觉通过 ${summary.visual.passed}/${summary.visual.total} 条。`,
    '',
    ...renderCompleteResultsInstructions({ summary, workflowUrl }),
    '### 代表性失败用例',
    '',
    '以下用例仅用于在 Issue 中快速定位，按失败功能簇选择，每个功能簇最多展示一条。全部结果和证据请按上一节说明下载 `commonmark-conformance-report` artifact 查看。',
    '',
  );

  for (const representative of representatives) {
    lines.push(...renderRepresentative({
      representative,
      testCase: caseById.get(representative.id),
      ast: astById.get(representative.id),
      actualHtml: actualHtmlById.get(representative.id),
    }));
  }

  if (representatives.length === 0) lines.push('没有可展示的失败用例。', '');
  lines.push(
    '### 下载包内容说明',
    '',
    '- `summary.md`：中文完整汇总。',
    '- `report.html`：可筛选的视觉报告。',
    '- `failures.json` / `visual-failures.json`：机器可读明细。',
    '- `evidence/<用例 ID>/`：实际 AST、实际 HTML、预期及实际语义树。',
    '- `visual/<用例 ID>/`：预期、实际与像素差异图片。',
    ...(workflowUrl ? [`- [打开 Actions 运行并下载完整 artifact](${workflowUrl})。`] : []),
    '',
    `自动生成时间：${summary.generatedAt}`,
    ''
  );
  return `${lines.join('\n')}\n`;
}

function renderCompleteResultsInstructions({ summary, workflowUrl }) {
  const openRunStep = workflowUrl
    ? `1. 打开[本次 GitHub Actions 运行记录](${workflowUrl})。即使工作流最终显示失败，报告 artifact 仍会在运行记录中上传。`
    : '1. 打开仓库的 **Actions** 页面，进入本次 **CommonMark 语义与视觉对照验证**运行记录。';
  return [
    '## **下载并查看全部测试结果**',
    '',
    `Issue 正文只展示 ${REPRESENTATIVE_LIMIT} 个代表性失败用例。完整测试包包含 ${summary.total} 条用例的汇总、全部语义失败明细、全部视觉失败明细、截图和逐用例证据。`,
    '',
    openRunStep,
    '2. 在运行记录的 **Summary** 页面滚动到最下方，找到 **Artifacts** 区域。',
    '3. 点击并下载名为 **`commonmark-conformance-report`** 的 artifact；浏览器会下载一个 ZIP 文件。',
    '4. 将 ZIP **完整解压到同一个目录**。不要只复制或移动 `report.html`，否则其中引用的 `visual/` 截图和 `evidence/` 证据可能无法显示。',
    '5. 双击解压目录根部的 **`report.html`**，即可在浏览器中查看中文汇总、筛选全部视觉失败用例，并对照预期图、实际图和差异图。',
    '6. 打开 **`summary.md`** 查看全部语义和视觉失败清单；需要逐条检查时，再进入 **`evidence/<用例 ID>/`** 查看 Markdown、预期/实际 HTML、AST 和归一化语义树。',
    '',
    '### 本地打开示例',
    '',
    '**Windows PowerShell**',
    '',
    fencedCode([
      'Expand-Archive -LiteralPath .\\commonmark-conformance-report.zip -DestinationPath .\\commonmark-conformance-report',
      'Start-Process .\\commonmark-conformance-report\\report.html',
    ].join('\n'), 'powershell'),
    '',
    '**macOS / Linux**',
    '',
    fencedCode([
      'unzip commonmark-conformance-report.zip -d commonmark-conformance-report',
      '# macOS',
      'open commonmark-conformance-report/report.html',
      '# Linux',
      'xdg-open commonmark-conformance-report/report.html',
    ].join('\n'), 'bash'),
    '',
    '> Artifact 当前保留 30 天。超过保留期后，请打开较新的运行记录下载，或重新运行该工作流。',
    '',
  ];
}
function renderBaselineDelta(baseline) {
  if (!baseline?.configured) {
    return [
      '### 与批准基线对比',
      '',
      '> 未配置批准基线，本次无法区分新增、恢复和持续失败。',
      '',
    ];
  }
  const lines = [
    '### 与批准基线对比',
    '',
    `基线：\`${baseline.path}\`，范围：${baseline.scope === 'selected' ? '本次选中用例' : '全部用例'}。`,
    '',
    '| 对照层 | 新增失败 | 已恢复 | 持续失败 |',
    '| --- | ---: | ---: | ---: |',
    `| 语义 | ${baseline.semantic.added.length} | ${baseline.semantic.resolved.length} | ${baseline.semantic.persistent.length} |`,
    `| 视觉 | ${baseline.visual.added.length} | ${baseline.visual.resolved.length} | ${baseline.visual.persistent.length} |`,
    `| 唯一失败用例 | ${baseline.overall.added.length} | ${baseline.overall.resolved.length} | ${baseline.overall.persistent.length} |`,
    '',
  ];
  const changed = [
    ['新增失败', baseline.overall.added],
    ['已恢复', baseline.overall.resolved],
  ].filter(([, ids]) => ids.length > 0);
  if (changed.length > 0) {
    lines.push('<details>', '<summary>查看基线变化的用例 ID</summary>', '');
    for (const [label, ids] of changed) {
      lines.push(`- ${label}：${ids.map(id => `\`${id}\``).join('、')}`);
    }
    lines.push('', '</details>', '');
  }
  return lines;
}

function renderRepresentative({ representative, testCase, ast, actualHtml }) {
  const { semantic, visual } = representative;
  const expectedSemantic = testCase ? htmlToSemanticTree(testCase.expected.html) : null;
  const actualSemantic = actualHtml === undefined ? null : htmlToSemanticTree(actualHtml);
  const upstreamUrl = testCase ? sourceUrl(testCase.source) : null;
  const evidence = semantic?.evidence ?? visual?.evidence;
  const lines = [
    '<details>',
    `<summary><code>${representative.id}</code> · ${escapeInline(representative.nameZh)} · ${escapeInline(failureHeadline(semantic, visual))}</summary>`,
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 功能簇 | ${escapeTableCell(`${representative.nameZh}（${representative.section}）`)} |`,
    `| 建议定位层 | ${escapeTableCell(representative.suspectedLayer)} |`,
    `| 规范位置 | ${upstreamUrl ? `[${escapeTableCell(`${testCase.source.path} L${testCase.source.startLine}–L${testCase.source.endLine}`)}](${upstreamUrl})` : '-'} |`,
    `| 语义类型 | 预期：${inlineCodeList(semantic?.expectedSemanticTypes)}；实际：${inlineCodeList(semantic?.actualSemanticTypes)} |`,
    `| 首个差异 | ${semantic?.difference ? `\`${escapeTableCell(semantic.difference.path)}\`（${escapeTableCell(semantic.difference.reason)}）` : '-'} |`,
    `| 视觉差异 | ${visual ? `${visual.diffPixels ?? '-'} px / ${formatPercent(visual.diffRatio)}` : '无视觉失败'} |`,
    `| 证据目录 | ${evidence ? `\`${escapeTableCell(evidence.directory)}\`` : '-'} |`,
    '',
  ];
  if (testCase) {
    lines.push('#### Markdown 输入', '', fencedCode(testCase.input.markdown, 'markdown'), '');
    lines.push('#### CommonMark 预期 HTML', '', fencedCode(testCase.expected.html, 'html'), '');
  }
  lines.push('#### Supramark 实际 HTML', '', fencedCode(actualHtml ?? '未生成实际 HTML', 'html'), '');
  lines.push('#### Supramark Parser AST', '', fencedCode(prettyLimited(ast), 'json'), '');
  lines.push('#### 归一化语义树', '');
  lines.push('预期：', '', fencedCode(prettyLimited(expectedSemantic), 'json'), '');
  lines.push('实际：', '', fencedCode(prettyLimited(actualSemantic), 'json'), '');
  if (visual?.images) {
    lines.push(
      `视觉图片位于 artifact：\`${visual.images.expected}\`、\`${visual.images.actual}\`、\`${visual.images.diff}\`。`,
      ''
    );
  }
  lines.push('</details>', '');
  return lines;
}

function selectRepresentatives(groups, semanticFailures, visualFailures) {
  const semanticById = new Map(semanticFailures.map(failure => [failure.id, failure]));
  const visualById = new Map(visualFailures.map(failure => [failure.id, failure]));
  const selected = [];
  const selectedIds = new Set();
  for (const group of groups) {
    const candidates = [...new Set([
      ...semanticFailures.filter(failure => failure.section === group.section).map(failure => failure.id),
      ...visualFailures.filter(failure => failure.section === group.section).map(failure => failure.id),
    ])].sort((left, right) => {
      const leftBoth = Number(semanticById.has(left) && visualById.has(left));
      const rightBoth = Number(semanticById.has(right) && visualById.has(right));
      return rightBoth - leftBoth || left.localeCompare(right);
    });
    const id = candidates.find(candidate => !selectedIds.has(candidate));
    if (!id) continue;
    selectedIds.add(id);
    selected.push({
      id,
      section: group.section,
      nameZh: group.nameZh,
      suspectedLayer: group.suspectedLayer,
      semantic: semanticById.get(id),
      visual: visualById.get(id),
    });
    if (selected.length >= REPRESENTATIVE_LIMIT) break;
  }
  return selected;
}

function sourceUrl(source) {
  const repository = String(source.repository).replace(/\.git$/, '');
  return `${repository}/blob/${source.revision}/${source.path}#L${source.startLine}-L${source.endLine}`;
}

function failureHeadline(semantic, visual) {
  if (semantic?.status === 'error') return '语义执行错误';
  if (semantic?.typeDifference) return '渲染类型不一致';
  if (semantic?.difference) return 'DOM 语义不一致';
  if (visual?.status === 'error') return '视觉执行错误';
  return '浏览器截图不一致';
}

function fencedCode(value, language = '') {
  const content = String(value ?? '');
  const longest = Math.max(2, ...([...content.matchAll(/`+/g)].map(match => match[0].length)));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}

function prettyLimited(value) {
  const content = value === null || value === undefined
    ? '未生成'
    : JSON.stringify(value, null, 2);
  if (content.length <= DETAIL_LIMIT) return content;
  return `${content.slice(0, DETAIL_LIMIT)}\n…（内容已截断，完整文件见 evidence 目录）`;
}

function inlineCodeList(values) {
  return values?.length ? values.map(value => `\`${escapeTableCell(value)}\``).join('、') : '-';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(4)}%` : '-';
}

function escapeTableCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function escapeInline(value) {
  return String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
