import { createHash } from 'node:crypto';
import { collectSemanticTypes } from '../lib/semantic/html-semantics.mjs';

const EXAMPLE_OPEN = `${'`'.repeat(32)} example`;
const EXAMPLE_CLOSE = '`'.repeat(32);

const SECTION_COVERAGE = {
  Tabs: coverage(['whitespace', 'tabs'], ['paragraph', 'code', 'list', 'list_item']),
  'Backslash escapes': coverage(['escape'], ['text']),
  'Entity and numeric character references': coverage(['character-reference'], ['text']),
  Precedence: coverage(['precedence'], ['paragraph', 'list', 'list_item', 'inline_code']),
  'Thematic breaks': coverage(['thematic-break'], ['thematic_break', 'paragraph']),
  'ATX headings': coverage(['heading', 'atx-heading'], ['heading', 'text']),
  'Setext headings': coverage(['heading', 'setext-heading'], ['heading', 'paragraph', 'text']),
  'Indented code blocks': coverage(['code-block', 'indented-code'], ['code']),
  'Fenced code blocks': coverage(['code-block', 'fenced-code'], ['code']),
  'HTML blocks': coverage(['raw-html', 'html-block'], ['raw', 'paragraph']),
  'Link reference definitions': coverage(
    ['link-reference-definition'],
    ['link', 'image', 'paragraph', 'text']
  ),
  Paragraphs: coverage(['paragraph'], ['paragraph', 'text']),
  'Blank lines': coverage(['blank-line'], []),
  'Block quotes': coverage(['block-quote'], ['blockquote', 'paragraph']),
  'List items': coverage(['list-item'], ['list', 'list_item', 'paragraph']),
  Lists: coverage(['list'], ['list', 'list_item', 'paragraph']),
  Inlines: coverage(['inline'], ['paragraph', 'text']),
  'Code spans': coverage(['code-span'], ['inline_code', 'text']),
  'Emphasis and strong emphasis': coverage(
    ['emphasis', 'strong-emphasis'],
    ['emphasis', 'strong', 'text']
  ),
  Links: coverage(['link'], ['link', 'text']),
  Images: coverage(['image'], ['image', 'text']),
  Autolinks: coverage(['autolink'], ['link', 'text']),
  'Raw HTML': coverage(['raw-html', 'html-inline'], ['raw', 'text']),
  'Hard line breaks': coverage(['hard-break'], ['break', 'text']),
  'Soft line breaks': coverage(['soft-break'], ['text']),
  'Textual content': coverage(['text'], ['text']),
};

function coverage(syntax, candidateNodeTypes) {
  return {
    featureIds: ['@supramark/feature-core-markdown'],
    syntax,
    candidateNodeTypes,
    renderers: ['web', 'react-native'],
  };
}

export function importCommonMark(sourceText, sourceConfig) {
  const normalizedSource = normalizeLineEndings(sourceText);
  const version = readSpecVersion(normalizedSource);

  if (version !== sourceConfig.version) {
    throw new Error(
      `CommonMark version mismatch: source is ${version}, configuration expects ${sourceConfig.version}`
    );
  }

  const rawCases = parseSpecExamples(normalizedSource);
  const cases = rawCases.map(rawCase => toUnifiedCase(rawCase, sourceConfig));

  return {
    cases,
    sourceSha256: createHash('sha256').update(normalizedSource, 'utf8').digest('hex'),
  };
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function readSpecVersion(source) {
  const match = source.match(/^version:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (!match) {
    throw new Error('Unable to read CommonMark version from spec.txt front matter');
  }
  return match[1].trim();
}

function parseSpecExamples(source) {
  const lines = source.match(/.*(?:\n|$)/g)?.filter(line => line.length > 0) ?? [];
  const result = [];
  let state = 'document';
  let section = '';
  let startLine = 0;
  let markdown = [];
  let html = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const stripped = line.trim();

    if (state === 'document' && stripped === EXAMPLE_OPEN) {
      state = 'markdown';
      startLine = lineNumber;
      markdown = [];
      html = [];
      continue;
    }

    if (state === 'markdown' && stripped === '.') {
      state = 'html';
      continue;
    }

    if (state === 'html' && stripped === EXAMPLE_CLOSE) {
      if (!section) {
        throw new Error(`Example at line ${startLine} has no enclosing section`);
      }
      result.push({
        example: result.length + 1,
        section,
        startLine,
        endLine: lineNumber,
        markdown: markdown.join('').replaceAll('\u2192', '\t'),
        html: html.join('').replaceAll('\u2192', '\t'),
      });
      state = 'document';
      continue;
    }

    if (state === 'markdown') {
      markdown.push(line);
    } else if (state === 'html') {
      html.push(line);
    } else {
      const heading = line.match(/^#+\s+(.+?)\s*\n?$/);
      if (heading) {
        section = heading[1];
      }
    }
  }

  if (state !== 'document') {
    throw new Error(`Unclosed CommonMark example beginning at line ${startLine}`);
  }
  if (result.length === 0) {
    throw new Error('No CommonMark examples found');
  }

  return result;
}

function toUnifiedCase(rawCase, sourceConfig) {
  const sectionCoverage = SECTION_COVERAGE[rawCase.section];
  if (!sectionCoverage) {
    throw new Error(`No Supramark coverage mapping for CommonMark section: ${rawCase.section}`);
  }

  return {
    schemaVersion: 1,
    id: `commonmark-${sourceConfig.version}-${String(rawCase.example).padStart(4, '0')}`,
    source: {
      name: sourceConfig.name,
      repository: sourceConfig.repository,
      version: sourceConfig.version,
      path: sourceConfig.input,
      revision: sourceConfig.revision,
      upstreamId: rawCase.example,
      section: rawCase.section,
      startLine: rawCase.startLine,
      endLine: rawCase.endLine,
    },
    profile: sourceConfig.profile,
    input: { markdown: rawCase.markdown },
    expected: {
      kind: 'normative',
      html: rawCase.html,
      semanticTypes: collectSemanticTypes(rawCase.html),
      comparison: 'semantic-html',
    },
    coverage: sectionCoverage,
  };
}
