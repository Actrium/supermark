import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(SUITE_ROOT, '..', '..');
const artifactDirectory = path.join(SUITE_ROOT, 'artifacts', 'commonmark');
const baselinePath = path.join(SUITE_ROOT, 'baselines', 'commonmark.json');
const fixtureDirectory = path.join(REPOSITORY_ROOT, 'tests', 'cases', '_fixtures', 'commonmark');

const [summary, semanticFailures, visualFailures, version] = await Promise.all([
  readJson(path.join(artifactDirectory, 'summary.json')),
  readJson(path.join(artifactDirectory, 'failures.json')),
  readJson(path.join(artifactDirectory, 'visual-failures.json')),
  readJson(path.join(fixtureDirectory, 'version.json')),
]);

if (summary.total !== version.caseCount) {
  throw new Error(`拒绝更新部分运行基线：报告 ${summary.total} 条，数据源 ${version.caseCount} 条。`);
}
if (!summary.visual?.enabled || summary.errors !== 0 || summary.visual.errors !== 0) {
  throw new Error('拒绝更新异常运行基线：必须完成视觉测试且语义、视觉执行错误均为 0。');
}
if (summary.sourceCommit !== version.commit) {
  throw new Error(`拒绝更新数据源不一致的基线：${summary.sourceCommit} != ${version.commit}`);
}

const baseline = {
  schemaVersion: 2,
  source: 'commonmark',
  sourceVersion: version.version,
  sourceCommit: version.commit,
  caseCount: version.caseCount,
  parserProfile: summary.profile,
  comparisonTarget: summary.comparisonTarget,
  semanticFailureIds: uniqueSorted(semanticFailures.map(failure => failure.id)),
  visualFailureIds: uniqueSorted(visualFailures.map(failure => failure.id)),
};

await mkdir(path.dirname(baselinePath), { recursive: true });
await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
console.log(
  `已更新 CommonMark 批准基线：语义 ${baseline.semanticFailureIds.length} 条，视觉 ${baseline.visualFailureIds.length} 条 -> ${baselinePath}`
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
