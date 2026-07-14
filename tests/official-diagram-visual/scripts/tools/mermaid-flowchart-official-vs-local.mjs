import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const { chromium } = require(
  'C:/Users/fhink/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/node_modules/playwright-core'
);
const sharp = require(
  'C:/Users/fhink/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp'
);
const pixelmatch = require(
  'C:/Users/fhink/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pixelmatch'
);
const { PNG } = require(
  'C:/Users/fhink/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs'
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..');
const repoRoot = resolve(workspaceRoot, 'repo');
const crateRoot = resolve(repoRoot, 'crates', 'mermaid-little');
const outDir = resolve(workspaceRoot, 'artifacts', 'mermaid-flowchart-official-vs-local');
const fixtureRoot = resolve(crateRoot, 'tests', 'supramark-matrix');
const OFFICIAL_MERMAID_VERSION = '11.14.0';
const CASE_FILTER = process.env.CASE_FILTER;
const CASE_LIMIT = Number(process.env.CASE_LIMIT || 0);
const CARGO = resolve(repoRoot, '.cargo-home', 'bin', 'cargo.exe');

const CASES = [
  c('node-default', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['id'], `flowchart LR
id`),
  c('node-text', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1[This is the text in the box]`),
  c('unicode-text', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This', 'Unicode'], `flowchart LR
id["This ❤ Unicode"]`),
  c('markdown-labels', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This', 'Markdown', 'Line1'], `---
config:
  htmlLabels: false
---
flowchart LR
markdown["\`This **is** _Markdown_\`"]
newLines["\`Line1
Line 2
Line 3\`"]
markdown --> newLines`),
  c('direction-td', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Start', 'Stop'], `flowchart TD
Start --> Stop`),
  c('direction-lr', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Start', 'Stop'], `flowchart LR
Start --> Stop`),
  c('shape-round', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1(This is the text in the box)`),
  c('shape-stadium', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1([This is the text in the box])`),
  c('shape-subroutine', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1[[This is the text in the box]]`),
  c('shape-cylinder', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Database'], `flowchart LR
id1[(Database)]`),
  c('shape-circle', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the circle'], `flowchart LR
id1((This is the text in the circle))`),
  c('shape-asymmetric', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1>This is the text in the box]`),
  c('shape-rhombus', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1{This is the text in the box}`),
  c('shape-hexagon', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart LR
id1{{This is the text in the box}}`),
  c('shape-parallelogram', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart TD
id1[/This is the text in the box/]`),
  c('shape-parallelogram-alt', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the box'], `flowchart TD
id1[\\This is the text in the box\\]`),
  c('shape-trapezoid', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Christmas'], `flowchart TD
A[/Christmas\\]`),
  c('shape-trapezoid-alt', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Go shopping'], `flowchart TD
B[\\Go shopping/]`),
  c('shape-double-circle', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the text in the circle'], `flowchart TD
id1(((This is the text in the circle)))`),
  c('link-arrow', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A-->B`),
  c('link-open', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A --- B`),
  c('link-text-middle', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'This is the text'], `flowchart LR
A-- This is the text! ---B`),
  c('link-text-pipe', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'This is the text'], `flowchart LR
A---|This is the text|B`),
  c('link-arrow-text-pipe', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'text'], `flowchart LR
A-->|text|B`),
  c('link-arrow-text-inline', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'text'], `flowchart LR
A-- text -->B`),
  c('link-dotted', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A-.->B;`),
  c('link-dotted-text', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'text'], `flowchart LR
A-. text .-> B`),
  c('link-thick', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A ==> B`),
  c('link-thick-text', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'text'], `flowchart LR
A == text ==> B`),
  c('link-invisible', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A ~~~ B`),
  c('link-chaining', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'C', 'text2'], `flowchart LR
A -- text --> B -- text2 --> C`),
  c('link-multiple-nodes', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['a', 'b', 'c', 'd'], `flowchart LR
a --> b & c--> d`),
  c('arrow-circle-cross', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A --o B
A --x B`),
  c('arrow-multidirectional', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'C', 'D'], `flowchart LR
A o--o B
B <--> C
C x--x D`),
  c('minimum-link-length', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Start', 'Is it?', 'OK', 'Rethink', 'End', 'Yes', 'No'], `flowchart TD
A[Start] --> B{Is it?}
B -->|Yes| C[OK]
C --> D[Rethink]
D --> B
B ---->|No| E[End]`),
  c('special-characters', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['This is the (text) in the box'], `flowchart LR
id1["This is the (text) in the box"]`),
  c('entity-codes', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A double quote', 'A dec char'], `flowchart LR
A["A double quote:#quot;"] --> B["A dec char:#9829;"]`),
  c('subgraphs-basic', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['one', 'two', 'three'], `flowchart TB
c1-->a2
subgraph one
a1-->a2
end
subgraph two
b1-->b2
end
subgraph three
c1-->c2
end`),
  c('subgraph-explicit-id', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['one'], `flowchart TB
c1-->a2
subgraph ide1 [one]
a1-->a2
end`),
  c('subgraph-edges', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['one', 'two', 'three'], `flowchart TB
c1-->a2
subgraph one
a1-->a2
end
subgraph two
b1-->b2
end
subgraph three
c1-->c2
end
one --> two
three --> two
two --> c2`),
  c('subgraph-direction', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['TOP', 'B1', 'B2', 'A', 'B'], `flowchart LR
subgraph TOP
direction TB
subgraph B1
direction RL
i1 -->f1
end
subgraph B2
direction BT
i2 -->f2
end
end
A --> TOP --> B
B1 --> B2`),
  c('markdown-strings-subgraph', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['One', 'cat', 'dog', 'edge label'], `---
config:
  htmlLabels: false
---
flowchart LR
subgraph "One"
a("\`The **cat** in the hat\`") -- "edge label" --> b{{"\`The **dog** in the hog\`"}}
end`),
  c('comments', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B', 'C', 'node', 'text2'], `flowchart LR
%% this is a comment
A -- text --> B{node}
A -- text --> B -- text2 --> C`),
  c('style-node', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Start', 'Stop'], `flowchart LR
id1(Start)-->id2(Stop)
style id1 fill:#f9f,stroke:#333,stroke-width:4px
style id2 fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5`),
  c('class-shorthand', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['A', 'B'], `flowchart LR
A:::someclass --> B
classDef someclass fill:#f96`),
  c('fontawesome-text', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['for peace', 'forbidden', 'perhaps'], `flowchart TD
B["fa:fa-twitter for peace"]
B-->C[fa:fa-ban forbidden]
B-->D(fa:fa-spinner)
B-->E(A fa:fa-camera-retro perhaps?)`),
  c('mixed-hard-edge', 'https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md', ['Hard edge', 'Link text', 'Decision', 'Result one', 'Result two'], `flowchart LR
A[Hard edge] -->|Link text| B(Round edge)
B --> C{Decision}
C -->|One| D[Result one]
C -->|Two| E[Result two]`),
];

const selectedCases = CASES
  .filter(testCase => !CASE_FILTER || testCase.id.includes(CASE_FILTER))
  .slice(0, CASE_LIMIT > 0 ? CASE_LIMIT : undefined);

await mkdir(outDir, { recursive: true });
await mkdir(fixtureRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});

try {
  const officialPage = await createOfficialMermaidPage(browser);
  const reports = [];
  for (const testCase of selectedCases) {
    console.log(`Running ${testCase.id}`);
    await writeFixture(testCase);
    const reference = await renderOfficialMermaid(officialPage, testCase);
    const local = await renderLocalMermaidLittle(testCase);
    const comparison =
      reference.pngPath && local.pngPath
        ? await comparePng(reference.pngPath, local.pngPath, testCase.id)
        : null;
    const report = {
      case: testCase.id,
      officialSource: testCase.source,
      officialMermaidVersion: OFFICIAL_MERMAID_VERSION,
      reference,
      local,
      comparison,
      pass: reference.semantic.pass && local.semantic.pass && local.geometry.pass,
    };
    await writeFile(resolve(outDir, `${testCase.id}.report.json`), JSON.stringify(report, null, 2));
    reports.push(report);
  }

  const summary = {
    officialMermaidVersion: OFFICIAL_MERMAID_VERSION,
    mermaidLittleVersion: '11.14.0-1 local workspace',
    total: reports.length,
    passed: reports.filter(r => r.pass).length,
    failed: reports.filter(r => !r.pass).length,
    localRenderFailed: reports.filter(r => !r.local.semantic.pass).map(r => r.case),
    localGeometryFailed: reports.filter(r => !r.local.geometry.pass).map(r => r.case),
    reports: reports.map(r => ({
      case: r.case,
      pass: r.pass,
      referenceSemantic: r.reference.semantic.pass,
      localSemantic: r.local.semantic.pass,
      localGeometry: r.local.geometry.pass,
      checkedRects: r.local.geometry.checkedRects ?? 0,
      overflowingRects: r.local.geometry.overflowingRects?.length ?? 0,
      diffRatio: r.comparison?.diffRatio ?? null,
    })),
  };
    await writeFile(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}

function c(id, source, expectedTexts, diagram) {
  return { id, source, expectedTexts, diagram };
}

async function writeFixture(testCase) {
  await writeFile(resolve(fixtureRoot, `${testCase.id}.mmd`), testCase.diagram, 'utf8');
}

async function renderLocalMermaidLittle(testCase) {
  const svgPath = resolve(outDir, `${testCase.id}.local.svg`);
  const pngPath = resolve(outDir, `${testCase.id}.local.png`);
  const env = {
    ...process.env,
    RUSTUP_HOME: resolve(repoRoot, '.rustup-home'),
    CARGO_HOME: resolve(repoRoot, '.cargo-home'),
  };
  try {
    const { stdout, stderr } = await execFile(
      CARGO,
      [
        'run',
        '-p',
        'mermaid-little',
        '--bin',
        'gen_svg',
        '--target',
        'x86_64-pc-windows-gnu',
        '--no-default-features',
        '--features',
        'metrics-ttf-parser',
        '--',
        `supramark-matrix/${testCase.id}`,
        svgPath,
      ],
      { cwd: crateRoot, env, maxBuffer: 1024 * 1024 * 12 }
    );
    const svg = await import('node:fs/promises').then(fs => fs.readFile(svgPath, 'utf8'));
    await rasterizeSvg(svg, pngPath);
    return {
      renderer: 'mermaid-little local crate',
      rendererVersion: '11.14.0-1',
      svgPath,
      pngPath,
      semantic: semanticCheck(svg, testCase.expectedTexts),
      geometry: geometryCheck(svg),
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      renderer: 'mermaid-little local crate',
      rendererVersion: '11.14.0-1',
      semantic: {
        pass: false,
        error: error instanceof Error ? error.message : String(error),
        stdout: error.stdout,
        stderr: error.stderr,
      },
      geometry: { pass: false, reason: 'local-render-failed' },
    };
  }
}

async function createOfficialMermaidPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; padding: 24px; background: white; font-family: Arial, sans-serif; }
      #target { display: inline-block; }
    </style>
  </head>
  <body>
    <div id="target"></div>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@${OFFICIAL_MERMAID_VERSION}/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
      let counter = 0;
      window.__renderMermaid = async function renderMermaid(id, source) {
        counter += 1;
        const { svg } = await mermaid.render('official-' + id + '-' + counter, source);
        document.getElementById('target').innerHTML = svg;
        return svg;
      };
    </script>
  </body>
</html>`);

  await page.waitForFunction(() => typeof window.__renderMermaid === 'function', null, { timeout: 60000 });
  return page;
}

async function renderOfficialMermaid(page, testCase) {
  const errors = [];
  const onConsole = message => {
    if (message.type() === 'error') errors.push(message.text());
  };
  const onPageError = error => errors.push(error.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  try {
    const svg = await page.evaluate(
      ({ id, diagram }) => window.__renderMermaid(id, diagram),
      { id: testCase.id, diagram: testCase.diagram }
    );
    const svgPath = resolve(outDir, `${testCase.id}.reference.svg`);
    const pngPath = resolve(outDir, `${testCase.id}.reference.png`);
    await writeFile(svgPath, svg, 'utf8');
    await rasterizeSvg(svg, pngPath);
    return {
      renderer: 'Mermaid official npm package',
      rendererVersion: OFFICIAL_MERMAID_VERSION,
      svgPath,
      pngPath,
      semantic: semanticCheck(svg, testCase.expectedTexts),
      geometry: geometryCheck(svg),
      consoleErrors: errors,
    };
  } catch (error) {
    return {
      renderer: 'Mermaid official npm package',
      rendererVersion: OFFICIAL_MERMAID_VERSION,
      semantic: {
        pass: false,
        error: error instanceof Error ? error.message : String(error),
        consoleErrors: errors,
      },
      geometry: { pass: false, reason: 'official-render-failed' },
    };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}

async function rasterizeSvg(svg, pngPath) {
  await sharp(Buffer.from(normalizeSvgSize(svg)))
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(pngPath);
}

function normalizeSvgSize(svg) {
  const viewBox = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  if (!viewBox) return svg;
  const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return svg;

  let normalized = svg.replace(/\swidth=["'][^"']*["']/i, '');
  normalized = normalized.replace(/\sheight=["'][^"']*["']/i, '');
  return normalized.replace(/<svg\b/i, `<svg width="${Math.ceil(width)}" height="${Math.ceil(height)}"`);
}

function semanticCheck(svg, expectedTexts) {
  const stripped = normalizeText(svg.replace(/<[^>]*>/g, ' '));
  const normalizedSvg = normalizeText(svg);
  const missingTexts = expectedTexts.filter(text => {
    const expected = normalizeText(text);
    return !normalizedSvg.includes(expected) && !stripped.includes(expected);
  });
  const hasSvg = /<svg[\s>]/i.test(svg);
  const hasViewBox = /\bviewBox=/i.test(svg);
  const hasError = /Engine not configured|unsupported_engine|render_error|Syntax error in text/i.test(svg);
  return {
    pass: hasSvg && hasViewBox && missingTexts.length === 0 && !hasError,
    hasSvg,
    hasViewBox,
    missingTexts,
    hasError,
  };
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function geometryCheck(svg) {
  const viewBox = parseViewBox(svg);
  if (!viewBox) {
    return { pass: false, reason: 'missing-viewBox' };
  }

  const rects = [...svg.matchAll(/<g\b[^>]*class="[^"]*\bnode\b[^"]*"[^>]*transform="translate\(([^,\s)]+)[,\s]+([^)]+)\)"[\s\S]*?<rect\b([^>]*)>/gi)]
    .map(match => {
      const tx = Number(match[1]);
      const ty = Number(match[2]);
      const attrs = match[3];
      const x = Number(attrs.match(/\bx="([^"]+)"/i)?.[1] ?? 0);
      const y = Number(attrs.match(/\by="([^"]+)"/i)?.[1] ?? 0);
      const width = Number(attrs.match(/\bwidth="([^"]+)"/i)?.[1] ?? NaN);
      const height = Number(attrs.match(/\bheight="([^"]+)"/i)?.[1] ?? NaN);
      if (![tx, ty, x, y, width, height].every(Number.isFinite)) return null;
      return {
        left: tx + x,
        top: ty + y,
        right: tx + x + width,
        bottom: ty + y + height,
      };
    })
    .filter(Boolean);

  const view = {
    left: viewBox.x,
    top: viewBox.y,
    right: viewBox.x + viewBox.width,
    bottom: viewBox.y + viewBox.height,
  };
  const overflowingRects = rects.filter(
    rect =>
      rect.left < view.left - 0.5 ||
      rect.top < view.top - 0.5 ||
      rect.right > view.right + 0.5 ||
      rect.bottom > view.bottom + 0.5
  );

  return {
    pass: overflowingRects.length === 0,
    viewBox,
    checkedRects: rects.length,
    overflowingRects,
  };
}

function parseViewBox(svg) {
  const raw = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  if (!raw) return null;
  const [x, y, width, height] = raw.trim().split(/[\s,]+/).map(Number);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

async function comparePng(referencePath, actualPath, caseId) {
  const referenceMeta = await sharp(referencePath).metadata();
  const actualMeta = await sharp(actualPath).metadata();
  const width = Math.max(referenceMeta.width ?? 0, actualMeta.width ?? 0);
  const height = Math.max(referenceMeta.height ?? 0, actualMeta.height ?? 0);
  const background = { r: 255, g: 255, b: 255, alpha: 1 };

  const referenceBuffer = await sharp(referencePath)
    .resize({ width, height, fit: 'contain', background })
    .ensureAlpha()
    .png()
    .toBuffer();
  const actualBuffer = await sharp(actualPath)
    .resize({ width, height, fit: 'contain', background })
    .ensureAlpha()
    .png()
    .toBuffer();

  const referencePng = PNG.sync.read(referenceBuffer);
  const actualPng = PNG.sync.read(actualBuffer);
  const diff = new PNG({ width, height });
  const matchPixels = pixelmatch.default ?? pixelmatch;
  const diffPixels = matchPixels(
    referencePng.data,
    actualPng.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );
  const diffPath = resolve(outDir, `${caseId}.diff.png`);
  await writeFile(diffPath, PNG.sync.write(diff));

  return {
    width,
    height,
    diffPixels,
    totalPixels: width * height,
    diffRatio: diffPixels / (width * height),
    diffPath,
  };
}
