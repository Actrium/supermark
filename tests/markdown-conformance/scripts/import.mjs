import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(SUITE_ROOT, '..', '..');
const FIXTURES_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'cases', '_fixtures');

const { sourceName, sourceDirectory } = parseArguments(process.argv.slice(2));
if (!sourceName || !/^[a-z0-9][a-z0-9-]*$/.test(sourceName)) {
  console.error('Usage: node tests/markdown-conformance/scripts/import.mjs <source-name> [--source-dir <repository>]');
  process.exitCode = 2;
} else {
  await run(sourceName, sourceDirectory);
}

async function run(name, suppliedSourceDirectory) {
  const sourceConfig = JSON.parse(
    await readFile(path.join(SUITE_ROOT, 'config', 'sources', `${name}.json`), 'utf8')
  );
  if (sourceConfig.name !== name || !/^[a-z0-9][a-z0-9-]*$/.test(sourceConfig.importer)) {
    throw new Error(`Invalid source configuration: ${name}`);
  }
  const importerModule = await import(
    new URL(`../importers/${sourceConfig.importer}.mjs`, import.meta.url)
  );
  if (typeof importerModule.default !== 'function') {
    throw new Error(`Importer ${sourceConfig.importer} must provide a default export`);
  }
  const sourceRepository = suppliedSourceDirectory
    ? verifySuppliedRepository(suppliedSourceDirectory, sourceConfig)
    : await pullPinnedRepository(sourceConfig);
  const inputConfigs = sourceConfig.inputs ?? [{ path: sourceConfig.input }];
  if (inputConfigs.length === 0 || inputConfigs.some(input => !input.path)) {
    throw new Error(`Source ${name} must configure at least one input path`);
  }
  const sourceDocuments = inputConfigs.map(inputConfig => ({
    ...inputConfig,
    text: git(['-C', sourceRepository, 'show', `${sourceConfig.revision}:${inputConfig.path}`], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  }));
  const imported = importerModule.default(sourceDocuments, sourceConfig);
  const outputDirectory = path.join(FIXTURES_ROOT, name);
  const casesDocument = {
    schemaVersion: 1,
    source: sourceConfig.name,
    profile: sourceConfig.profile,
    cases: imported.cases,
  };
  const versionDocument = buildVersionDocument(sourceConfig, imported.cases, imported);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'cases.json'),
    `${JSON.stringify(casesDocument, null, 2)}\n`
  );
  await writeFile(
    path.join(outputDirectory, 'version.json'),
    `${JSON.stringify(versionDocument, null, 2)}\n`
  );

  console.log(
    `Imported ${imported.cases.length} ${name} cases from ${sourceConfig.revision} into ${outputDirectory}`
  );
}

async function pullPinnedRepository(sourceConfig) {
  const cacheRoot = process.env.SUPRAMARK_FIXTURE_SOURCE_CACHE
    ? path.resolve(process.env.SUPRAMARK_FIXTURE_SOURCE_CACHE)
    : path.join(os.tmpdir(), 'supramark-fixture-sources');
  const repositoryDirectory = path.join(
    cacheRoot,
    `${sourceConfig.name}-${sourceConfig.revision}`
  );

  await mkdir(repositoryDirectory, { recursive: true });
  if (!existsSync(path.join(repositoryDirectory, '.git'))) {
    git(['-C', repositoryDirectory, 'init']);
    git(['-C', repositoryDirectory, 'remote', 'add', 'origin', sourceConfig.repository]);
  } else {
    verifyRemote(repositoryDirectory, sourceConfig.repository);
  }

  if (!hasCommit(repositoryDirectory, sourceConfig.revision)) {
    git([
      '-C',
      repositoryDirectory,
      'fetch',
      '--depth',
      '1',
      'origin',
      sourceConfig.revision,
    ]);
  }
  verifyCommit(repositoryDirectory, sourceConfig.revision);
  return repositoryDirectory;
}

function verifySuppliedRepository(directory, sourceConfig) {
  const repositoryDirectory = path.resolve(directory);
  if (!existsSync(path.join(repositoryDirectory, '.git'))) {
    throw new Error(`Not a Git repository: ${repositoryDirectory}`);
  }
  verifyRemote(repositoryDirectory, sourceConfig.repository);
  verifyCommit(repositoryDirectory, sourceConfig.revision);
  return repositoryDirectory;
}

function verifyRemote(repositoryDirectory, expectedRepository) {
  const actual = git(['-C', repositoryDirectory, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  }).trim();
  const normalize = value => value.replace(/\.git$/, '').replace(/\\/g, '/').toLowerCase();
  if (normalize(actual) !== normalize(expectedRepository)) {
    throw new Error(`Source remote mismatch: expected ${expectedRepository}, got ${actual}`);
  }
}

function hasCommit(repositoryDirectory, revision) {
  try {
    git(['-C', repositoryDirectory, 'cat-file', '-e', `${revision}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function verifyCommit(repositoryDirectory, revision) {
  const actual = git(['-C', repositoryDirectory, 'rev-parse', `${revision}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  if (actual !== revision) {
    throw new Error(`Source commit mismatch: expected ${revision}, got ${actual}`);
  }
}

function buildVersionDocument(sourceConfig, cases, imported) {
  const sectionCounts = new Map();
  for (const testCase of cases) {
    sectionCounts.set(
      testCase.source.section,
      (sectionCounts.get(testCase.source.section) ?? 0) + 1
    );
  }
  if (sourceConfig.inputs && imported.sourceFiles?.length !== sourceConfig.inputs.length) {
    throw new Error(`Importer ${sourceConfig.importer} returned incomplete source file metadata`);
  }
  const fixtureMetadata = sourceConfig.inputs
    ? { fixtures: imported.sourceFiles }
    : { fixture: sourceConfig.input };

  return {
    schemaVersion: 1,
    source: sourceConfig.name,
    repository: sourceConfig.repository,
    version: sourceConfig.version,
    commit: sourceConfig.revision,
    ...fixtureMetadata,
    license: sourceConfig.license,
    sourceSha256: imported.sourceSha256,
    caseCount: cases.length,
    sections: Object.fromEntries(
      [...sectionCounts.entries()].sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

function parseArguments(args) {
  const sourceName = args[0];
  let sourceDirectory;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--source-dir') {
      sourceDirectory = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  return { sourceName, sourceDirectory };
}

function git(args, options = {}) {
  return execFileSync(process.env.GIT ?? 'git', args, {
    stdio: options.encoding ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    ...options,
  });
}
