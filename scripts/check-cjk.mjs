#!/usr/bin/env node
// Enforce English-only source. CJK belongs in a small set of places; anywhere
// else it is a defect, because a reader who does not read Chinese cannot review
// the code, and mixed-language identifiers and messages leak into product output.
//
// Where CJK IS allowed:
//   - *.zh.md                        translated docs, named so the language is explicit
//   - i18n/ locales/ translations/   localisation payloads
//   - tests/fixtures/ testdata/      test inputs
//   - tests/cases/_fixtures/         imported upstream conformance corpora
//   - anything git does not track    build output, vendored downloads
//
// Where it is allowed by exception, with a written reason:
//   // cjk-allow: <reason>           the same line and the line after it
//   // cjk-allow-file: <reason>      the whole file, must sit in the first 40 lines
//
// A pragma without a reason does not count. The reason is the point: it is what
// a reviewer reads to decide whether the exception is legitimate, so "cjk-allow"
// on its own is rejected the same as no pragma at all.
//
//   node scripts/check-cjk.mjs              gate; exits 1 on any violation
//   node scripts/check-cjk.mjs --report     inventory, always exits 0
//   node scripts/check-cjk.mjs --json       machine-readable findings
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Ideographic and Hangul blocks, plus the fullwidth forms that come with them.
// Deliberately excludes U+2018/2019/201C/201D — curly quotes are common in
// English prose and are not a language marker.
// Written as escapes, not literals, so this file passes its own check.
const CJK = new RegExp(
  '[' +
  '\\u3000-\\u303F' + // CJK symbols and punctuation
  '\\u3040-\\u309F' + // hiragana
  '\\u30A0-\\u30FF' + // katakana
  '\\u3400-\\u4DBF' + // CJK unified ideographs extension A
  '\\u4E00-\\u9FFF' + // CJK unified ideographs
  '\\uF900-\\uFAFF' + // CJK compatibility ideographs
  '\\uFF00-\\uFFEF' + // halfwidth and fullwidth forms
  '\\uAC00-\\uD7AF' + // hangul syllables
  ']',
  'u'
);
const CJK_GLOBAL = new RegExp(CJK.source, 'gu');

const ALLOWED_DIRS = [
  'i18n/',
  'locales/',
  'translations/',
  'tests/fixtures/',
  'testdata/',
  'tests/cases/_fixtures/',
];

// Committed build output. Its comments are a transpiled copy of the source that
// was already checked, so flagging it would ask for the same text to be fixed
// twice - and the second copy cannot be hand-fixed safely, because editing it
// shifts the line numbers its .js.map is keyed to.
//
// These are react-native-builder-bob's target directories and the usual bundler
// output names, matched specifically rather than as a bare "lib/": this repo has
// hand-written source under tests/markdown-conformance/lib/, which must stay
// covered by the check.
const BUILD_OUTPUT_DIRS = [
  'lib/commonjs/',
  'lib/module/',
  'lib/typescript/',
  'dist/',
  'build/',
];

// Extensions that are reviewed as source. Everything else (.svg, .png, .mmd,
// .d2, .json data) is left alone: diagram sources and captured fixtures carry
// CJK as subject matter, not as prose a reviewer has to read.
const SOURCE_EXTENSIONS = new Set([
  '.rs', '.go', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.kt', '.kts', '.swift', '.c', '.h', '.cpp', '.hpp', '.cc',
  '.m', '.mm', '.sh', '.bash', '.zsh', '.rb', '.php', '.cs', '.vue', '.svelte',
  '.css', '.scss', '.less', '.toml', '.yaml', '.yml', '.html', '.podspec',
  '.gradle', '.cmake', '.mk',
]);

const LINE_PRAGMA = /cjk-allow:\s*\S/;
const FILE_PRAGMA = /cjk-allow-file:\s*\S/;
const FILE_PRAGMA_SCAN_LINES = 40;

const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--report');
const asJson = args.has('--json');

const tracked = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (tracked.status !== 0) {
  console.error('git ls-files failed:', tracked.stderr?.trim());
  process.exit(2);
}

const findings = [];
const skipped = { allowedLocation: 0, buildOutput: 0, notSource: 0, pragmaFile: 0, binary: 0 };

for (const file of tracked.stdout.split('\0').filter(Boolean)) {
  const posix = file.split(path.sep).join('/');

  if (ALLOWED_DIRS.some(dir => posix === dir.slice(0, -1) || posix.includes(dir))) {
    skipped.allowedLocation += 1;
    continue;
  }
  if (posix.endsWith('.zh.md')) {
    skipped.allowedLocation += 1;
    continue;
  }
  if (BUILD_OUTPUT_DIRS.some(dir => posix.includes(dir))) {
    skipped.buildOutput += 1;
    continue;
  }

  const extension = path.extname(posix);
  const isMarkdown = extension === '.md';
  if (!isMarkdown && !SOURCE_EXTENSIONS.has(extension)) {
    skipped.notSource += 1;
    continue;
  }

  let text;
  try {
    const raw = readFileSync(posix);
    if (raw.includes(0)) {
      skipped.binary += 1;
      continue;
    }
    text = raw.toString('utf8');
  } catch {
    continue;
  }
  if (!CJK.test(text)) continue;

  const lines = text.split(/\r?\n/);

  if (lines.slice(0, FILE_PRAGMA_SCAN_LINES).some(line => FILE_PRAGMA.test(line))) {
    skipped.pragmaFile += 1;
    continue;
  }

  // A whole Chinese document is a rename, not a line-by-line edit: reporting
  // every line would bury the one action that fixes it.
  if (isMarkdown) {
    const count = (text.match(CJK_GLOBAL) ?? []).length;
    findings.push({
      file: posix,
      kind: 'markdown-should-be-zh-md',
      chars: count,
      hint: `rename to ${posix.replace(/\.md$/, '.zh.md')}, or translate it to English in place`,
    });
    continue;
  }

  for (const [index, line] of lines.entries()) {
    if (!CJK.test(line)) continue;
    // The pragma covers its own line and the next one, so it can sit above the
    // construct it explains instead of trailing off the end of a long literal.
    if (LINE_PRAGMA.test(line) || (index > 0 && LINE_PRAGMA.test(lines[index - 1]))) continue;
    findings.push({
      file: posix,
      line: index + 1,
      kind: 'cjk-in-source',
      text: line.trim().slice(0, 160),
    });
  }
}

// Assign process.exitCode and let the script end on its own. process.exit()
// truncates buffered stdout when it is a pipe, which silently cut the --json
// output short.
const exitCode = reportOnly || findings.length === 0 ? 0 : 1;

if (asJson) {
  console.log(JSON.stringify({ findings, skipped }, null, 2));
  process.exitCode = exitCode;
}

if (!asJson) {
  const byFile = new Map();
  for (const finding of findings) {
    if (!byFile.has(finding.file)) byFile.set(finding.file, []);
    byFile.get(finding.file).push(finding);
  }

  const markdownFiles = [...byFile].filter(([, f]) => f[0].kind === 'markdown-should-be-zh-md');
  const sourceFiles = [...byFile].filter(([, f]) => f[0].kind === 'cjk-in-source');

  if (sourceFiles.length > 0) {
    console.log(`\nCJK in source (${sourceFiles.length} files, ${sourceFiles.reduce((n, [, f]) => n + f.length, 0)} lines):\n`);
    for (const [file, entries] of sourceFiles.sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${file}  (${entries.length} line${entries.length === 1 ? '' : 's'})`);
      for (const entry of entries.slice(0, 3)) console.log(`      ${entry.line}: ${entry.text}`);
      if (entries.length > 3) console.log(`      ... ${entries.length - 3} more`);
    }
  }

  if (markdownFiles.length > 0) {
    console.log(`\nChinese Markdown not named .zh.md (${markdownFiles.length} files):\n`);
    for (const [file, entries] of markdownFiles.sort((a, b) => b[1][0].chars - a[1][0].chars)) {
      console.log(`  ${file}  (${entries[0].chars} CJK chars)`);
    }
  }

  if (findings.length === 0) {
    console.log('check-cjk: clean - no CJK outside the allowed locations.');
  } else {
    console.log(
      [
        '',
        `check-cjk: ${findings.length} finding(s) across ${byFile.size} file(s).`,
        '',
        'To resolve, pick the one that is actually true:',
        '  - prose meant for readers      translate it to English',
        '  - a Chinese document           rename to *.zh.md',
        '  - CJK as data, not prose       add "cjk-allow: <reason>" above the line,',
        '                                 or "cjk-allow-file: <reason>" near the top',
      ].join('\n')
    );
  }

  console.log(
    `\nskipped: ${skipped.allowedLocation} allowed location, ${skipped.buildOutput} build output, ` +
    `${skipped.notSource} not source, ${skipped.pragmaFile} file pragma, ${skipped.binary} binary`
  );

  process.exitCode = exitCode;
}
