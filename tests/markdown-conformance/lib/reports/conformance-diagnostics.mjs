import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { htmlToSemanticTree } from '../semantic/html-semantics.mjs';

const SUSPECTED_LAYERS = {
  'HTML blocks': 'Block Parser / Raw HTML Renderer',
  'Raw HTML': 'Inline Parser / HTML 安全策略',
  Autolinks: 'Inline Parser',
  'Hard line breaks': 'Inline Parser / 空白处理',
  Lists: 'Block Parser / List Renderer',
  'List items': 'Block Parser / List Renderer',
  'Emphasis and strong emphasis': 'Inline Parser',
  Links: 'Inline Parser / Link Renderer',
  'Code spans': 'Inline Parser / Code Renderer',
  'Backslash escapes': 'Inline Parser / 转义处理',
  'Entity and numeric character references': 'Inline Parser / 实体解码',
};

export async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function buildRuntimeMetadata({ repositoryRoot, parserBinary, astById, workflowUrl }) {
  const firstAst = astById.values().next().value;
  const commit = process.env.GITHUB_SHA ?? git(repositoryRoot, ['rev-parse', 'HEAD']);
  const gitRef = process.env.GITHUB_REF_NAME ?? git(repositoryRoot, ['branch', '--show-current']);
  const status = git(repositoryRoot, ['status', '--porcelain', '--untracked-files=normal'], true);
  return {
    supramarkCommit: commit || '未知',
    gitRef: gitRef || 'detached',
    workspaceDirty: status.length > 0,
    parserBinary,
    parserName: firstAst?.parser?.name ?? 'supramark-markdown',
    parserVersion: firstAst?.parser?.version ?? '未知',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    workflowUrl,
  };
}

export function buildFailureGroups(semanticFailures, visualFailures, sectionName) {
  const groups = new Map();
  function ensure(section) {
    if (!groups.has(section)) {
      groups.set(section, {
        section,
        nameZh: sectionName(section),
        suspectedLayer: SUSPECTED_LAYERS[section] ?? 'Parser / Renderer 待定位',
        semanticIds: new Set(),
        visualIds: new Set(),
      });
    }
    return groups.get(section);
  }
  for (const failure of semanticFailures) ensure(failure.section).semanticIds.add(failure.id);
  for (const failure of visualFailures) ensure(failure.section).visualIds.add(failure.id);
  return [...groups.values()].map(group => ({
    section: group.section,
    nameZh: group.nameZh,
    suspectedLayer: group.suspectedLayer,
    uniqueCases: new Set([...group.semanticIds, ...group.visualIds]).size,
    semanticNotPassed: group.semanticIds.size,
    visualNotPassed: group.visualIds.size,
  })).sort((left, right) =>
    right.uniqueCases - left.uniqueCases ||
    right.semanticNotPassed - left.semanticNotPassed ||
    left.section.localeCompare(right.section)
  );
}

export function compareWithBaseline({
  baseline,
  baselinePath,
  sourceCommit,
  parserProfile,
  comparisonTarget,
  allCaseCount,
  selectedCaseIds,
  semanticFailures,
  visualFailures,
}) {
  if (!baseline) {
    return { configured: false, reason: 'baseline-missing', path: relativePath(baselinePath) };
  }
  if (baseline.sourceCommit !== sourceCommit || baseline.caseCount !== allCaseCount) {
    return {
      configured: false,
      reason: 'baseline-source-mismatch',
      path: relativePath(baselinePath),
      expectedSourceCommit: baseline.sourceCommit,
      actualSourceCommit: sourceCommit,
    };
  }
  if (
    baseline.parserProfile !== parserProfile ||
    baseline.comparisonTarget !== comparisonTarget
  ) {
    return {
      configured: false,
      reason: 'baseline-target-mismatch',
      path: relativePath(baselinePath),
      expectedParserProfile: baseline.parserProfile,
      actualParserProfile: parserProfile,
      expectedComparisonTarget: baseline.comparisonTarget,
      actualComparisonTarget: comparisonTarget,
    };
  }
  const selected = new Set(selectedCaseIds);
  const isPartial = selected.size !== allCaseCount;
  const filterSelected = ids => isPartial ? ids.filter(id => selected.has(id)) : ids;
  const baselineSemantic = filterSelected(baseline.semanticFailureIds ?? []);
  const baselineVisual = filterSelected(baseline.visualFailureIds ?? []);
  const currentSemantic = semanticFailures.map(failure => failure.id);
  const currentVisual = visualFailures.map(failure => failure.id);
  const semantic = compareIds(baselineSemantic, currentSemantic);
  const visual = compareIds(baselineVisual, currentVisual);
  const overall = compareIds(
    [...new Set([...baselineSemantic, ...baselineVisual])],
    [...new Set([...currentSemantic, ...currentVisual])]
  );
  return {
    configured: true,
    path: relativePath(baselinePath),
    sourceCommit: baseline.sourceCommit,
    parserProfile: baseline.parserProfile,
    comparisonTarget: baseline.comparisonTarget,
    scope: isPartial ? 'selected' : 'all',
    semantic,
    visual,
    overall,
  };
}

export async function writeFailureEvidence({
  artifactDirectory,
  semanticFailures,
  visualFailures,
  caseById,
  astById,
  actualHtmlById,
}) {
  const evidenceRoot = path.join(artifactDirectory, 'evidence');
  const ids = [...new Set([
    ...semanticFailures.map(failure => failure.id),
    ...visualFailures.map(failure => failure.id),
  ])].filter(id => caseById.has(id));
  const evidenceById = new Map();
  const index = [];
  await mkdir(evidenceRoot, { recursive: true });

  for (const id of ids) {
    const testCase = caseById.get(id);
    const ast = astById.get(id);
    const actualHtml = actualHtmlById.get(id);
    const directoryName = safeCaseId(id);
    const outputDirectory = path.join(evidenceRoot, directoryName);
    const relativeDirectory = toReportPath(path.join('evidence', directoryName));
    await mkdir(outputDirectory, { recursive: true });
    const files = {};
    const writes = [];
    if (ast !== undefined) {
      files.actualAst = `${relativeDirectory}/actual.ast.json`;
      writes.push(writeJson(path.join(outputDirectory, 'actual.ast.json'), ast));
    }
    if (actualHtml !== undefined) {
      files.actualHtml = `${relativeDirectory}/actual.html`;
      files.actualSemantic = `${relativeDirectory}/actual.semantic.json`;
      writes.push(
        writeFile(path.join(outputDirectory, 'actual.html'), actualHtml, 'utf8'),
        writeJson(path.join(outputDirectory, 'actual.semantic.json'), htmlToSemanticTree(actualHtml))
      );
    }
    files.expectedSemantic = `${relativeDirectory}/expected.semantic.json`;
    files.case = `${relativeDirectory}/case.json`;
    writes.push(
      writeJson(path.join(outputDirectory, 'expected.semantic.json'), htmlToSemanticTree(testCase.expected.html)),
      writeJson(path.join(outputDirectory, 'case.json'), testCase)
    );
    await Promise.all(writes);
    const evidence = { directory: relativeDirectory, files };
    evidenceById.set(id, evidence);
    index.push({ id, ...evidence });
  }
  await writeJson(path.join(artifactDirectory, 'evidence-index.json'), {
    schemaVersion: 1,
    caseCount: index.length,
    cases: index,
  });
  return evidenceById;
}

export function attachEvidence(failures, evidenceById) {
  return failures.map(failure => {
    const evidence = evidenceById.get(failure.id);
    return evidence ? { ...failure, evidence } : failure;
  });
}

function compareIds(baselineIds, currentIds) {
  const baseline = new Set(baselineIds);
  const current = new Set(currentIds);
  return {
    added: [...current].filter(id => !baseline.has(id)).sort(),
    resolved: [...baseline].filter(id => !current.has(id)).sort(),
    persistent: [...current].filter(id => baseline.has(id)).sort(),
  };
}

function git(repositoryRoot, args, allowFailure = false) {
  const result = spawnSync(process.env.GIT ?? 'git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) return '';
  return result.status === 0 ? result.stdout.trim() : '';
}

function safeCaseId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function toReportPath(value) {
  return value.split(path.sep).join('/');
}

function relativePath(value) {
  return toReportPath(path.relative(process.cwd(), value));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
