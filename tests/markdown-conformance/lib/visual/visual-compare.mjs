import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const VIEWPORT_WIDTH = 800;
const INITIAL_VIEWPORT_HEIGHT = 600;
const MAX_CAPTURE_HEIGHT = 10_000;
const STYLE_PROFILE = 'commonmark-visual-v1';

const DOCUMENT_SHELL = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${VIEWPORT_WIDTH}px; background: #fff; }
    body {
      color: #1f2328;
      font-family: Arial, "Liberation Sans", sans-serif;
      font-size: 16px;
      line-height: 1.5;
      text-rendering: geometricPrecision;
    }
    #fixture { display: flow-root; width: ${VIEWPORT_WIDTH}px; padding: 24px; }
    #fixture > :first-child { margin-top: 0; }
    #fixture > :last-child { margin-bottom: 0; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 24px 0 16px; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    p, blockquote, ul, ol, pre { margin: 0 0 16px; }
    blockquote { border-left: 4px solid #d0d7de; color: #59636e; padding: 0 16px; }
    pre { background: #f6f8fa; border-radius: 6px; overflow: auto; padding: 16px; }
    code, pre { font-family: "Courier New", "Liberation Mono", monospace; }
    code { background: #eff1f3; border-radius: 4px; padding: 0.15em 0.3em; }
    pre code { background: transparent; border-radius: 0; padding: 0; }
    img { max-width: 100%; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d0d7de; padding: 6px 13px; }
    * { animation: none !important; caret-color: transparent !important; transition: none !important; }
  </style>
</head>
<body><main id="fixture"></main></body>
</html>`;

export async function compareVisualCases({
  cases,
  actualHtmlById,
  rendererErrorsById = new Map(),
  artifactDirectory,
  sectionName,
}) {
  const pixelThreshold = numberFromEnvironment('VISUAL_PIXEL_THRESHOLD', 0.1);
  const maxDiffPixels = integerFromEnvironment('VISUAL_MAX_DIFF_PIXELS', 0);
  const maxDiffRatio = numberFromEnvironment('VISUAL_MAX_DIFF_RATIO', 0);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--font-render-hinting=none'],
  });
  const browserVersion = browser.version();
  const results = [];

  try {
    const context = await browser.newContext({
      colorScheme: 'light',
      deviceScaleFactor: 1,
      locale: 'zh-CN',
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
      viewport: { width: VIEWPORT_WIDTH, height: INITIAL_VIEWPORT_HEIGHT },
    });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(DOCUMENT_SHELL, { waitUntil: 'load' });

    for (const testCase of cases) {
      const actualHtml = actualHtmlById.get(testCase.id);
      if (actualHtml === undefined) {
        results.push({
          id: testCase.id,
          section: testCase.source.section,
          status: 'error',
          error:
            rendererErrorsById.get(testCase.id)?.join('\n') ??
            'Supramark 生产 Web Renderer 未生成可供截图的实际 HTML。',
        });
        continue;
      }

      try {
        const expectedHeight = await measureFixture(page, testCase.expected.html);
        const actualHeight = await measureFixture(page, actualHtml);
        const height = Math.max(expectedHeight, actualHeight, 96);
        if (height > MAX_CAPTURE_HEIGHT) {
          throw new Error(`渲染高度 ${height}px 超过上限 ${MAX_CAPTURE_HEIGHT}px`);
        }
        await page.setViewportSize({ width: VIEWPORT_WIDTH, height });
        const expected = await captureFixture(page, testCase.expected.html, height);
        const actual = await captureFixture(page, actualHtml, height);
        const expectedPng = PNG.sync.read(expected);
        const actualPng = PNG.sync.read(actual);
        const diffPng = new PNG({ width: VIEWPORT_WIDTH, height });
        const diffPixels = pixelmatch(
          expectedPng.data,
          actualPng.data,
          diffPng.data,
          VIEWPORT_WIDTH,
          height,
          { threshold: pixelThreshold, includeAA: false, alpha: 0.5 }
        );
        const diffRatio = diffPixels / (VIEWPORT_WIDTH * height);
        const passed = diffPixels <= maxDiffPixels || diffRatio <= maxDiffRatio;
        const result = {
          id: testCase.id,
          section: testCase.source.section,
          status: passed ? 'pass' : 'fail',
          width: VIEWPORT_WIDTH,
          height,
          diffPixels,
          diffRatio,
        };
        if (!passed) {
          const relativeDirectory = path.join('visual', safeCaseId(testCase.id));
          const outputDirectory = path.join(artifactDirectory, relativeDirectory);
          await mkdir(outputDirectory, { recursive: true });
          const expectedPath = path.join(outputDirectory, 'expected.png');
          const actualPath = path.join(outputDirectory, 'actual.png');
          const diffPath = path.join(outputDirectory, 'diff.png');
          await Promise.all([
            writeFile(expectedPath, expected),
            writeFile(actualPath, actual),
            writeFile(diffPath, PNG.sync.write(diffPng)),
          ]);
          result.images = {
            expected: toReportPath(path.join(relativeDirectory, 'expected.png')),
            actual: toReportPath(path.join(relativeDirectory, 'actual.png')),
            diff: toReportPath(path.join(relativeDirectory, 'diff.png')),
          };
        }
        results.push(result);
      } catch (error) {
        results.push({
          id: testCase.id,
          section: testCase.source.section,
          status: 'error',
          error: error.stack ?? error.message,
        });
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }

  const failures = results.filter(result => result.status !== 'pass');
  const bySection = summarize(results, sectionName);
  return {
    schemaVersion: 1,
    locale: 'zh-CN',
    result: failures.length === 0 ? '通过' : '失败',
    profile: STYLE_PROFILE,
    browser: { name: 'chromium', version: browserVersion },
    viewport: { width: VIEWPORT_WIDTH, deviceScaleFactor: 1 },
    thresholds: { pixelThreshold, maxDiffPixels, maxDiffRatio },
    total: results.length,
    passed: results.length - failures.length,
    failed: results.filter(result => result.status === 'fail').length,
    errors: results.filter(result => result.status === 'error').length,
    notPassed: failures.length,
    bySection,
    failures,
  };
}

async function measureFixture(page, html) {
  await setFixture(page, html);
  return page.locator('#fixture').evaluate(element => Math.ceil(element.scrollHeight));
}

async function captureFixture(page, html, height) {
  await setFixture(page, html);
  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height },
    type: 'png',
  });
}

async function setFixture(page, html) {
  await page.locator('#fixture').evaluate((element, content) => {
    element.innerHTML = content;
  }, html);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.querySelectorAll('#fixture img')];
    await Promise.all(images.map(image => {
      if (image.complete) return undefined;
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function summarize(results, sectionName) {
  const summary = {};
  for (const result of results) {
    summary[result.section] ??= {
      nameZh: sectionName(result.section),
      total: 0,
      passed: 0,
      failed: 0,
      errors: 0,
    };
    const counts = summary[result.section];
    counts.total += 1;
    if (result.status === 'pass') counts.passed += 1;
    else if (result.status === 'error') counts.errors += 1;
    else counts.failed += 1;
  }
  return summary;
}

function safeCaseId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function toReportPath(value) {
  return value.split(path.sep).join('/');
}

function numberFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} 必须是非负数字`);
  return value;
}

function integerFromEnvironment(name, fallback) {
  const value = numberFromEnvironment(name, fallback);
  if (!Number.isInteger(value)) throw new Error(`${name} 必须是非负整数`);
  return value;
}
