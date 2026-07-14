import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'C:/Users/fhink/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/node_modules/playwright-core'
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'artifacts', 'mermaid-reference');
const svgPath = resolve(outDir, 'flowchart-reference.svg');
const pngPath = resolve(outDir, 'flowchart-reference.png');

const diagram = `flowchart TD
  Start([Start]) --> Decision{Ready?}
  Decision -->|Yes| Ship[Ship]
  Decision -->|No| Fix[Fix]
  Fix --> Decision`;

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 });

await page.setContent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        padding: 24px;
        background: white;
        font-family: Arial, sans-serif;
      }
      #target {
        display: inline-block;
      }
    </style>
  </head>
  <body>
    <div id="target"></div>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
      const source = ${JSON.stringify(diagram)};
      const { svg } = await mermaid.render('official-reference-flowchart', source);
      document.getElementById('target').innerHTML = svg;
      window.__MERMAID_SVG__ = svg;
    </script>
  </body>
</html>`);

await page.waitForFunction(() => typeof window.__MERMAID_SVG__ === 'string');
const svg = await page.evaluate(() => window.__MERMAID_SVG__);
await writeFile(svgPath, svg, 'utf8');

const target = page.locator('#target svg');
await target.waitFor({ state: 'visible' });
await target.screenshot({ path: pngPath, omitBackground: false });

await browser.close();

console.log(svgPath);
console.log(pngPath);
