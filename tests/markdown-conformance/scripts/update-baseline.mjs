import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(SUITE_ROOT, '..', '..');
const sourceName = process.argv[2];
if (!sourceName || !/^[a-z0-9][a-z0-9-]*$/.test(sourceName)) {
  throw new Error('Usage: node tests/markdown-conformance/scripts/update-baseline.mjs <source-name>');
}
const artifactDirectory = path.join(SUITE_ROOT, 'artifacts', sourceName);
const baselinePath = path.join(SUITE_ROOT, 'baselines', `${sourceName}.json`);
const fixtureDirectory = path.join(REPOSITORY_ROOT, 'tests', 'cases', '_fixtures', sourceName);

const [summary, semanticFailures, visualFailures, version] = await Promise.all([
  readJson(path.join(artifactDirectory, 'summary.json')),
  readJson(path.join(artifactDirectory, 'failures.json')),
  readJson(path.join(artifactDirectory, 'visual-failures.json')),
  readJson(path.join(fixtureDirectory, 'version.json')),
]);

if (summary.source !== sourceName || version.source !== sourceName) {
  throw new Error(`Source mismatch: argument ${sourceName}, report ${summary.source}, version ${version.source}`);
}
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
  source: sourceName,
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
  `Updated ${summary.sourceDisplayName ?? sourceName} baseline: semantic ${baseline.semanticFailureIds.length}, visual ${baseline.visualFailureIds.length} -> ${baselinePath}`
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
