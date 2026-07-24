import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(SUITE_ROOT, '..', '..');
const FIXTURES_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'cases', '_fixtures');
const sourceName = process.argv[2];

if (!sourceName) {
  console.error('Usage: node tests/markdown-conformance/scripts/validate.mjs <source-name>');
  process.exitCode = 2;
} else {
  await validate(sourceName);
}

async function validate(name) {
  const fixtureDirectory = path.join(FIXTURES_ROOT, name);
  const casesText = await readFile(path.join(fixtureDirectory, 'cases.json'), 'utf8');
  const version = JSON.parse(await readFile(path.join(fixtureDirectory, 'version.json'), 'utf8'));
  const document = JSON.parse(casesText);

  assert(document.schemaVersion === 1, 'unsupported cases schema version');
  assert(document.source === name, 'cases source name mismatch');
  assert(document.source === version.source, 'cases/version source mismatch');
  assert(Array.isArray(document.cases), 'cases.json must contain a cases array');
  assert(document.cases.length === version.caseCount, 'case count does not match version.json');
  assert(document.cases.length > 0, 'no cases were imported');
  assert(/^[0-9a-f]{40}$/.test(version.commit), 'version.json does not contain a full commit');
  assert(/^[0-9a-f]{64}$/.test(version.sourceSha256), 'invalid source SHA-256');

  const ids = new Set();
  const sectionCounts = new Map();
  for (let index = 0; index < document.cases.length; index += 1) {
    const testCase = document.cases[index];
    assert(testCase.schemaVersion === 1, `${testCase.id}: unsupported case schema version`);
    assert(!ids.has(testCase.id), `${testCase.id}: duplicate case ID`);
    ids.add(testCase.id);
    assert(testCase.source.revision === version.commit, `${testCase.id}: source commit mismatch`);
    assert(testCase.source.path === version.fixture, `${testCase.id}: fixture path mismatch`);
    assert(testCase.source.upstreamId === index + 1, `${testCase.id}: upstream IDs not sequential`);
    assert(typeof testCase.input.markdown === 'string', `${testCase.id}: missing Markdown input`);
    assert(typeof testCase.expected.html === 'string', `${testCase.id}: missing expected HTML`);
    assert(Array.isArray(testCase.expected.semanticTypes), `${testCase.id}: missing semantic types`);
    assert(Array.isArray(testCase.coverage.candidateNodeTypes), `${testCase.id}: missing node type mapping`);
    assert(
      testCase.coverage.renderers.includes('web') &&
        testCase.coverage.renderers.includes('react-native'),
      `${testCase.id}: renderer mapping incomplete`
    );
    sectionCounts.set(
      testCase.source.section,
      (sectionCounts.get(testCase.source.section) ?? 0) + 1
    );
  }

  const actualSections = Object.fromEntries(
    [...sectionCounts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
  assert(JSON.stringify(actualSections) === JSON.stringify(version.sections), 'section counts mismatch');
  console.log(
    `Validated ${document.cases.length} ${name} cases at commit ${version.commit}; cases.json SHA-256 ${createHash('sha256').update(casesText).digest('hex')}`
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
