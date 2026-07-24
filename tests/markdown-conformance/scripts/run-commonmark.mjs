import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { astToHtml } from '../lib/semantic/ast-semantics.mjs';
import { renderCommonMarkHtmlReport } from '../lib/reports/html-report.mjs';
import { renderCommonMarkIssue } from '../lib/reports/issue-report.mjs';
import {
  attachEvidence,
  buildFailureGroups,
  buildRuntimeMetadata,
  compareWithBaseline,
  readOptionalJson,
  writeFailureEvidence,
} from '../lib/reports/conformance-diagnostics.mjs';
import {
  collectSemanticTypesFromTree,
  findFirstDifference,
  htmlToSemanticTree,
} from '../lib/semantic/html-semantics.mjs';
const SECTION_NAMES = {
  Tabs: '制表符',
  'Backslash escapes': '反斜杠转义',
  'Entity and numeric character references': '实体与数字字符引用',
  Precedence: '优先级',
  'Thematic breaks': '主题分隔线',
  'ATX headings': 'ATX 标题',
  'Setext headings': 'Setext 标题',
  'Indented code blocks': '缩进代码块',
  'Fenced code blocks': '围栏代码块',
  'HTML blocks': 'HTML 块',
  'Link reference definitions': '链接引用定义',
  Paragraphs: '段落',
  'Blank lines': '空行',
  'Block quotes': '块引用',
  'List items': '列表项',
  Lists: '列表',
  Inlines: '行内内容',
  'Code spans': '代码片段',
  'Emphasis and strong emphasis': '强调与加粗',
  Links: '链接',
  Images: '图片',
  Autolinks: '自动链接',
  'Raw HTML': '原始 HTML',
  'Hard line breaks': '硬换行',
  'Soft line breaks': '软换行',
  'Textual content': '文本内容',
};


const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(SUITE_ROOT, '..', '..');
const BASELINE_PATH = path.join(SUITE_ROOT, 'baselines', 'commonmark.json');
const DEFAULT_BINARY = path.join(
  REPOSITORY_ROOT,
  'target',
  'debug',
  process.platform === 'win32' ? 'supramark-markdown.exe' : 'supramark-markdown'
);
const parserBinary = path.resolve(process.env.SUPRAMARK_MARKDOWN_BIN ?? DEFAULT_BINARY);
const failOnFailures = process.env.FAIL_ON_FAILURES !== '0';
const visualEnabled = process.env.VISUAL_COMPARE === '1';
const parserProfile = 'supramark-default';
const filter = process.env.CASE_IDS
  ? new Set(process.env.CASE_IDS.split(',').map(value => value.trim()).filter(Boolean))
  : null;
const fixtureDirectory = path.join(
  REPOSITORY_ROOT,
  'tests',
  'cases',
  '_fixtures',
  'commonmark'
);
const document = JSON.parse(await readFile(path.join(fixtureDirectory, 'cases.json'), 'utf8'));
const version = JSON.parse(await readFile(path.join(fixtureDirectory, 'version.json'), 'utf8'));
const baselineDocument = await readOptionalJson(BASELINE_PATH);
const selectedCases = filter
  ? document.cases.filter(testCase => filter.has(testCase.id))
  : document.cases;
const caseById = new Map(selectedCases.map(testCase => [testCase.id, testCase]));
const artifactDirectory = process.env.ARTIFACT_DIR
  ? path.resolve(REPOSITORY_ROOT, process.env.ARTIFACT_DIR)
  : path.join(SUITE_ROOT, 'artifacts', 'commonmark');
const actualHtmlById = new Map();
const astById = new Map();
let productionRendererErrorsById = new Map();
let semanticTarget = 'ast-projection';
let results = selectedCases.map(runCase);
await mkdir(artifactDirectory, { recursive: true });

let visualExecution = {
  enabled: false,
  result: '未执行',
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  notPassed: 0,
  bySection: {},
  failures: [],
};
if (visualEnabled) {
  try {
    const { renderWithProductionWebRenderer } = await import(
      '../lib/visual/production-web-renderer.mjs'
    );
    const { compareVisualCases } = await import('../lib/visual/visual-compare.mjs');
    const productionRenderer = await renderWithProductionWebRenderer({
      cases: selectedCases,
      astById,
    });
    actualHtmlById.clear();
    for (const [id, html] of productionRenderer.htmlById) {
      actualHtmlById.set(id, html);
    }
    productionRendererErrorsById = productionRenderer.errorsById;
    semanticTarget = 'production-web-renderer-dom';
    results = selectedCases.map(compareProductionCase);
    visualExecution = {
      enabled: true,
      ...(await compareVisualCases({
        cases: selectedCases,
        actualHtmlById,
        rendererErrorsById: productionRenderer.errorsById,
        artifactDirectory,
        sectionName,
      })),
      renderer: productionRenderer.environment,
    };
  } catch (error) {
    visualExecution = {
      enabled: true,
      result: '错误',
      profile: 'commonmark-visual-v1',
      browser: null,
      total: selectedCases.length,
      passed: 0,
      failed: 0,
      errors: selectedCases.length,
      notPassed: selectedCases.length,
      bySection: {},
      failures: [{
        id: 'commonmark-visual-environment',
        section: '视觉测试环境',
        status: 'error',
        error: error.stack ?? error.message,
      }],
    };
  }
}
const failedCases = results.filter(result => result.status === 'fail');
const errors = results.filter(result => result.status === 'error');
const notPassed = [...failedCases, ...errors];
const typeMismatchCount = failedCases.filter(result => result.typeDifference).length;
const sectionSummary = summarize(results, result => result.section);
const { failures: visualFailures, ...visualSummary } = visualExecution;
const overallNotPassedCases = new Set([
  ...notPassed.map(result => result.id),
  ...visualFailures.map(result => result.id),
]);
const generatedAt = new Date().toISOString();
const failureGroups = buildFailureGroups(notPassed, visualFailures, sectionName);
const baseline = compareWithBaseline({
  baseline: baselineDocument,
  baselinePath: BASELINE_PATH,
  sourceCommit: version.commit,
  parserProfile,
  comparisonTarget: semanticTarget,
  allCaseCount: document.cases.length,
  selectedCaseIds: selectedCases.map(testCase => testCase.id),
  semanticFailures: notPassed,
  visualFailures,
});
const runtime = buildRuntimeMetadata({
  repositoryRoot: REPOSITORY_ROOT,
  parserBinary,
  astById,
  workflowUrl: githubWorkflowUrl(),
});
const summary = {
  schemaVersion: 3,
  generatedAt,
  runtime,
  baseline,
  failureGroups,
  locale: 'zh-CN',
  result: notPassed.length === 0 && visualExecution.notPassed === 0 ? '通过' : '失败',
  source: 'commonmark',
  profile: parserProfile,
  comparisonTarget: semanticTarget,
  sourceCommit: version.commit,
  parserBinary,
  total: results.length,
  passed: results.length - notPassed.length,
  failed: failedCases.length,
  errors: errors.length,
  notPassed: notPassed.length,
  typeMismatches: typeMismatchCount,
  overallNotPassedCases: overallNotPassedCases.size,
  bySection: Object.fromEntries(
    Object.entries(sectionSummary).map(([section, counts]) => [
      section,
      { nameZh: sectionName(section), ...counts },
    ])
  ),
  visual: visualSummary,
};
const evidenceById = await writeFailureEvidence({
  artifactDirectory,
  semanticFailures: notPassed,
  visualFailures,
  caseById,
  astById,
  actualHtmlById,
});
const semanticFailureRecords = attachEvidence(notPassed, evidenceById);
const visualFailureRecords = attachEvidence(visualFailures, evidenceById);
const issuePath = path.join(artifactDirectory, 'issue.md');
await mkdir(artifactDirectory, { recursive: true });
await writeFile(path.join(artifactDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(
  path.join(artifactDirectory, 'failures.json'),
  `${JSON.stringify(semanticFailureRecords, null, 2)}\n`
);
await writeFile(
  path.join(artifactDirectory, 'visual-failures.json'),
  `${JSON.stringify(visualFailureRecords, null, 2)}\n`
);
await writeFile(
  path.join(artifactDirectory, 'summary.md'),
  renderChineseSummary(summary, semanticFailureRecords, visualFailureRecords)
);
await writeFile(
  path.join(artifactDirectory, 'report.html'),
  renderCommonMarkHtmlReport({
    summary,
    visualFailures,
    semanticFailures: semanticFailureRecords,
    caseById,
    sourceVersion: version.version,
  })
);
if (summary.result === '失败') {
  await writeFile(issuePath, renderCommonMarkIssue({
    summary,
    semanticFailures: semanticFailureRecords,
    visualFailures: visualFailureRecords,
    caseById,
    astById,
    actualHtmlById,
    sourceVersion: version.version,
  }));
} else {
  await rm(issuePath, { force: true });
}

console.log(`CommonMark 语义对照：通过 ${summary.passed}/${summary.total}，未通过 ${summary.notPassed}`);
if (summary.visual.enabled) {
  console.log(`CommonMark 视觉对照：通过 ${summary.visual.passed}/${summary.visual.total}，未通过 ${summary.visual.notPassed}`);
} else {
  console.log('CommonMark 视觉对照：未执行（使用 run-commonmark-visual.mjs 启用）');
}
console.log(`中文总结：${path.join(artifactDirectory, 'summary.md')}`);
console.log(`HTML 可视化报告：${path.join(artifactDirectory, 'report.html')}`);
if (summary.result === '失败') console.log(`Issue 内容：${issuePath}`);
if (summary.result === '失败' && failOnFailures) process.exitCode = 1;

function runCase(testCase) {
  const parsed = spawnSync(parserBinary, ['-'], {
    input: testCase.input.markdown,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (parsed.error || parsed.status !== 0) {
    return {
      id: testCase.id,
      section: testCase.source.section,
      status: 'error',
      exitCode: parsed.status,
      signal: parsed.signal,
      error:
        parsed.error?.message ||
        parsed.stderr.trim() ||
        `Parser exited with status ${parsed.status} and signal ${parsed.signal ?? 'none'}`,
    };
  }

  try {
    const ast = JSON.parse(parsed.stdout);
    astById.set(testCase.id, ast);
    const actualHtml = astToHtml(ast);
    actualHtmlById.set(testCase.id, actualHtml);
    return compareHtmlCase(testCase, ast, actualHtml);
  } catch (error) {
    return {
      id: testCase.id,
      section: testCase.source.section,
      status: 'error',
      error: error.stack ?? error.message,
    };
  }
}

function compareProductionCase(testCase) {
  const rendererErrors = productionRendererErrorsById.get(testCase.id);
  if (rendererErrors?.length) {
    return {
      id: testCase.id,
      section: testCase.source.section,
      status: 'error',
      stage: 'production-web-renderer',
      error: rendererErrors.join('\n'),
    };
  }
  const ast = astById.get(testCase.id);
  const actualHtml = actualHtmlById.get(testCase.id);
  if (!ast || actualHtml === undefined) {
    return {
      id: testCase.id,
      section: testCase.source.section,
      status: 'error',
      stage: 'production-web-renderer',
      error: 'Supramark 生产 Web Renderer 未生成实际 HTML。',
    };
  }
  return compareHtmlCase(testCase, ast, actualHtml);
}

function compareHtmlCase(testCase, ast, actualHtml) {
  const expected = htmlToSemanticTree(testCase.expected.html);
  const actual = htmlToSemanticTree(actualHtml);
  const difference = findFirstDifference(expected, actual);
  const actualSemanticTypes = collectSemanticTypesFromTree(actual);
  const actualNodeTypes = collectAstTypes(ast);
  const typeDifference = compareTypes(testCase.expected.semanticTypes, actualSemanticTypes);
  return {
    id: testCase.id,
    section: testCase.source.section,
    status: difference || typeDifference ? 'fail' : 'pass',
    expectedSemanticTypes: testCase.expected.semanticTypes,
    actualSemanticTypes,
    actualNodeTypes,
    ...(typeDifference ? { typeDifference } : {}),
    ...(difference ? { difference } : {}),
  };
}

function renderChineseSummary(summaryDocument, semanticFailures, visualFailures) {
  const lines = [
    '# CommonMark 语义与视觉对照测试总结',
    '',
    `- 总体结果：**${summaryDocument.result}**`,
    `- 数据源：CommonMark ${version.version}`,
    `- 固定提交：\`${summaryDocument.sourceCommit}\``,
    `- 解析配置：\`${summaryDocument.profile}\``,
    `- 语义对照对象：${summaryDocument.comparisonTarget}`,
    `- 总用例数：${summaryDocument.total}`,
    `- 存在任一差异的用例：${summaryDocument.overallNotPassedCases}`,
    '',
    '## 语义对照结果',
    '',
    `- 通过：${summaryDocument.passed}`,
    `- 语义差异：${summaryDocument.failed}`,
    `- 执行错误：${summaryDocument.errors}`,
    `- 渲染类型不一致：${summaryDocument.typeMismatches}`,
    '',
    '### 分章节语义结果',
    '',
    '| 章节 | 总数 | 通过 | 语义差异 | 执行错误 |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [section, counts] of Object.entries(summaryDocument.bySection)) {
    lines.push(
      `| ${escapeTableCell(`${counts.nameZh}（${section}）`)} | ${counts.total} | ${counts.passed} | ${counts.failed} | ${counts.errors} |`
    );
  }
  lines.push('', '### 未通过的语义用例', '');
  if (semanticFailures.length === 0) {
    lines.push('全部语义用例通过。');
  } else {
    lines.push('| 用例 | 章节 | 分类 | 首个差异位置 |', '| --- | --- | --- | --- |');
    for (const failure of semanticFailures) {
      lines.push(
        `| \`${failure.id}\` | ${escapeTableCell(sectionName(failure.section))} | ${failureCategory(failure)} | \`${escapeTableCell(failure.difference?.path ?? '-')}\` |`
      );
    }
  }

  lines.push('', '## 浏览器视觉对照结果', '');
  if (!summaryDocument.visual.enabled) {
    lines.push('本次未启用视觉对照。运行 `node tests/markdown-conformance/scripts/run-commonmark-visual.mjs` 可启用。');
  } else {
    lines.push(
      `- 测试结果：**${summaryDocument.visual.result}**`,
      '- 中文 HTML 可视化报告：[打开报告](./report.html)',
      `- 浏览器：Chromium ${summaryDocument.visual.browser?.version ?? '启动失败'}`,
      `- 实际渲染实现：${summaryDocument.visual.renderer?.implementation ?? '未加载'}`,
      `- 样式配置：\`${summaryDocument.visual.profile}\``,
      `- 固定宽度：${summaryDocument.visual.viewport?.width ?? '-'}px`,
      `- 通过：${summaryDocument.visual.passed}/${summaryDocument.visual.total}`,
      `- 像素差异：${summaryDocument.visual.failed}`,
      `- 执行错误：${summaryDocument.visual.errors}`,
      '',
      '### 分章节视觉结果',
      '',
      '| 章节 | 总数 | 通过 | 像素差异 | 执行错误 |',
      '| --- | ---: | ---: | ---: | ---: |'
    );
    for (const [section, counts] of Object.entries(summaryDocument.visual.bySection ?? {})) {
      lines.push(
        `| ${escapeTableCell(`${counts.nameZh}（${section}）`)} | ${counts.total} | ${counts.passed} | ${counts.failed} | ${counts.errors} |`
      );
    }
    lines.push('', '### 未通过的视觉用例', '');
    if (visualFailures.length === 0) {
      lines.push('全部视觉用例通过。');
    } else {
      lines.push('| 用例 | 章节 | 分类 | 差异像素 | 差异比例 | 图片 |', '| --- | --- | --- | ---: | ---: | --- |');
      for (const failure of visualFailures) {
        const images = failure.images
          ? `[预期](${failure.images.expected}) · [实际](${failure.images.actual}) · [差异](${failure.images.diff})`
          : '-';
        lines.push(
          `| \`${failure.id}\` | ${escapeTableCell(sectionName(failure.section))} | ${visualFailureCategory(failure)} | ${failure.diffPixels ?? '-'} | ${formatPercent(failure.diffRatio)} | ${images} |`
        );
      }
    }
  }
  lines.push('', '详细机器数据见 `summary.json`、`failures.json` 和 `visual-failures.json`。', '');
  return `${lines.join('\n')}\n`;
}

function visualFailureCategory(failure) {
  return failure.status === 'error' ? '视觉执行错误' : '浏览器截图不一致';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(4)}%` : '-';
}

function collectAstTypes(root) {
  const result = [];
  const seen = new Set();
  function walk(node) {
    if (!seen.has(node.type)) {
      seen.add(node.type);
      result.push(node.type);
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(root);
  return result.filter(type => type !== 'root');
}

function compareTypes(expectedTypes, actualTypes) {
  const expected = new Set(expectedTypes);
  const actual = new Set(actualTypes);
  const missing = expectedTypes.filter(type => !actual.has(type));
  const unexpected = actualTypes.filter(type => !expected.has(type));
  return missing.length > 0 || unexpected.length > 0 ? { missing, unexpected } : null;
}

function summarize(values, getKey) {
  const result = {};
  for (const value of values) {
    const key = getKey(value);
    result[key] ??= { total: 0, passed: 0, failed: 0, errors: 0 };
    result[key].total += 1;
    if (value.status === 'pass') result[key].passed += 1;
    else if (value.status === 'error') result[key].errors += 1;
    else result[key].failed += 1;
  }
  return result;
}

function failureCategory(failure) {
  if (failure.status === 'error') return '执行错误';
  if (failure.typeDifference) return '渲染类型不一致';
  const reasons = {
    value: '文本或属性值不一致',
    type: '值类型不一致',
    'array-type': '节点集合类型不一致',
    'array-length': '子节点数量不一致',
    'object-keys': '节点结构或属性不一致',
  };
  return reasons[failure.difference?.reason] ?? '语义结构不一致';
}

function sectionName(section) {
  return SECTION_NAMES[section] ?? section;
}

function escapeTableCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function githubWorkflowUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : null;
}
