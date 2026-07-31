import { createHash } from 'node:crypto';
import { collectSemanticTypes } from '../lib/semantic/html-semantics.mjs';
import { COMMONMARK_SECTION_COVERAGE } from './commonmark.mjs';
import {
  coverage,
  normalizeLineEndings,
  parseSpecExamples,
  readFrontMatterValue,
  toUnifiedCase,
} from './spec-examples.mjs';

const CORE = '@supramark/feature-core-markdown';
const GFM = '@supramark/feature-gfm';
const FOOTNOTE = '@supramark/feature-footnote';
const TABLE_COVERAGE = coverage(
  [CORE, GFM],
  ['gfm-table'],
  ['table', 'table_row', 'table_cell', 'text']
);

const SPEC_SECTION_COVERAGE = {
  ...COMMONMARK_SECTION_COVERAGE,
  'Tables (extension)': TABLE_COVERAGE,
  'Task list items (extension)': taskListCoverage(),
  'Strikethrough (extension)': strikethroughCoverage(),
  'Autolinks (extension)': autolinkCoverage(),
  'Disallowed Raw HTML (extension)': tagFilterCoverage(),
};

const EXTENSION_SECTION_COVERAGE = {
  Tables: TABLE_COVERAGE,
  'Table cell count mismatches': TABLE_COVERAGE,
  'Embedded pipes': TABLE_COVERAGE,
  'Oddly-formatted markers': TABLE_COVERAGE,
  Escaping: TABLE_COVERAGE,
  'Embedded HTML': TABLE_COVERAGE,
  'Reference-style links': TABLE_COVERAGE,
  'Sequential cells': TABLE_COVERAGE,
  'Interaction with emphasis': TABLE_COVERAGE,
  'a table can be recognised when separated from a paragraph of text without an empty line':
    TABLE_COVERAGE,
  Strikethroughs: coverage([CORE, GFM], ['gfm-strikethrough'], ['delete', 'text']),
  Autolinks: coverage([CORE, GFM], ['gfm-autolink'], ['paragraph', 'link', 'text']),
  'HTML tag filter': coverage([CORE, GFM], ['gfm-tagfilter'], ['raw', 'paragraph', 'text']),
  Footnotes: footnoteCoverage(['footnote']),
  'When a footnote is used multiple times, we insert multiple backrefs.': footnoteCoverage([
    'footnote',
    'multiple-backrefs',
  ]),
  'Footnote reference labels are href escaped': footnoteCoverage([
    'footnote',
    'escaped-label',
  ]),
  Interop: footnoteCoverage(['footnote', 'interop']),
  'Task lists': coverage(
    [CORE, GFM],
    ['gfm-task-list'],
    ['list', 'list_item', 'paragraph', 'text']
  ),
};

function taskListCoverage() {
  return coverage(
    [CORE, GFM],
    ['gfm-task-list'],
    ['list', 'list_item', 'paragraph', 'text']
  );
}

function strikethroughCoverage() {
  return coverage([CORE, GFM], ['gfm-strikethrough'], ['delete', 'text']);
}

function autolinkCoverage() {
  return coverage([CORE, GFM], ['gfm-autolink'], ['paragraph', 'link', 'text']);
}

function tagFilterCoverage() {
  return coverage([CORE, GFM], ['gfm-tagfilter'], ['raw', 'paragraph', 'text']);
}

function footnoteCoverage(syntax) {
  return coverage(
    [CORE, FOOTNOTE],
    syntax,
    ['footnote_reference', 'footnote_definition', 'paragraph', 'text']
  );
}

export default function importCmarkGfm(sourceDocuments, sourceConfig) {
  const cases = [];
  const sourceFiles = [];
  const aggregateHash = createHash('sha256');

  for (const sourceDocument of sourceDocuments) {
    const normalizedSource = normalizeLineEndings(sourceDocument.text);
    const fixtureVersion = readFrontMatterValue(normalizedSource, 'version');
    if (fixtureVersion !== sourceDocument.fixtureVersion) {
      throw new Error(
        `cmark-gfm fixture version mismatch for ${sourceDocument.path}: source is ${fixtureVersion}, configuration expects ${sourceDocument.fixtureVersion}`
      );
    }

    const sectionCoverage =
      sourceDocument.caseIdNamespace === 'spec'
        ? SPEC_SECTION_COVERAGE
        : EXTENSION_SECTION_COVERAGE;
    const caseConfig = {
      ...sourceConfig,
      input: sourceDocument.path,
      caseIdNamespace: sourceDocument.caseIdNamespace,
      collectSemanticTypes,
    };
    const documentCases = parseSpecExamples(normalizedSource).map(rawCase =>
      toUnifiedCase(rawCase, caseConfig, sectionCoverage)
    );
    const sourceSha256 = createHash('sha256').update(normalizedSource, 'utf8').digest('hex');

    cases.push(...documentCases);
    sourceFiles.push({
      path: sourceDocument.path,
      fixtureVersion,
      sourceSha256,
      caseCount: documentCases.length,
    });
    aggregateHash.update(`${sourceDocument.path}\0${sourceSha256}\n`, 'utf8');
  }

  return {
    cases,
    sourceFiles,
    sourceSha256: aggregateHash.digest('hex'),
  };
}
