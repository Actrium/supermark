import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'C:/Users/fhink/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/node_modules/playwright-core'
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const docsDir = resolve(root, 'docs');
const previousDocPath = resolve(docsDir, 'official-diagram-rendering-cases.md');
const outputPath = resolve(docsDir, 'official-diagram-rendering-cases-v2.md');
const assetDir = resolve(docsDir, 'assets', 'official-diagram-rendering-cases-v2');
const MERMAID_VERSION = '11.16.0';

// cjk-allow-file: the `### <category>` headings below become part of the
// generated cases/*.md doc, whose text this same repo's
// official-diagram-visual-workflow.mjs re-parses as `caseType` and then
// matches (via normalizeLabel/selectExampleType) against live Chinese
// dropdown option text in the preview app. That preview app and the
// already-committed case docs are out of scope for this cleanup, so these
// category labels must stay Chinese to keep matching them. Written as
// Unicode escapes, not literal characters, per repo policy. Gloss for each:
// SIMPLEST_FLOW = "simplest flow", LABELED_CONNECTIONS = "labeled
// connections", CONTAINER_GROUPING = "container/grouping",
// SEQUENCE_DIAGRAM_EXAMPLE = "sequence diagram example",
// CLASS_DIAGRAM_EXAMPLE = "class diagram example", ACTIVITY_DIAGRAM_EXAMPLE
// = "activity diagram example", FLOWCHART = "flowchart".
const CATEGORY = {
  SIMPLEST_FLOW: '\u6700\u7b80\u6d41\u7a0b',
  LABELED_CONNECTIONS: '\u5e26\u6807\u7b7e\u8fde\u7ebf',
  CONTAINER_GROUPING: '\u5bb9\u5668/\u5206\u7ec4',
  SEQUENCE_DIAGRAM_EXAMPLE: '\u65f6\u5e8f\u56fe\u793a\u4f8b',
  CLASS_DIAGRAM_EXAMPLE: '\u7c7b\u56fe\u793a\u4f8b',
  ACTIVITY_DIAGRAM_EXAMPLE: '\u6d3b\u52a8\u56fe\u793a\u4f8b',
  FLOWCHART: '\u6d41\u7a0b\u56fe',
};

const d2Cases = [
  {
    id: 'd2-v2-flow-up-direction',
    category: CATEGORY.SIMPLEST_FLOW,
    title: 'Upward directed three-node flow',
    sourceUrl: 'https://d2lang.com/tour/layouts/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/direction-up.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/direction-up.svg2',
    language: 'd2',
    checks: ['x', 'y', 'z', 'hello'],
  },
  {
    id: 'd2-v2-flow-colored-legend',
    category: CATEGORY.SIMPLEST_FLOW,
    title: 'Three-node flow with colored edges and legend',
    sourceUrl: 'https://d2lang.com/tour/near/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/near-container.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/near-container.svg2',
    language: 'd2',
    checks: ['x', 'y', 'z', 'legend', 'foo', 'bar'],
  },
  {
    id: 'd2-v2-flow-grid-process',
    category: CATEGORY.SIMPLEST_FLOW,
    title: 'Grid-based process flow with optional branch',
    sourceUrl: 'https://d2lang.com/tour/grid-diagrams/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/grid-connections.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/grid-connections.svg2',
    language: 'd2',
    checks: ['forge', 'Step 1', 'Hot reload', 'Yes', 'No'],
  },
  {
    id: 'd2-v2-labeled-arrowheads',
    category: CATEGORY.LABELED_CONNECTIONS,
    title: 'Labeled edges with custom source and target arrowheads',
    sourceUrl: 'https://d2lang.com/tour/connections/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/connections-5.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/connections-5.svg2',
    language: 'd2',
    checks: ['To err is human', 'Reality is just a crutch', 'responsibilities'],
  },
  {
    id: 'd2-v2-labeled-glob-connections',
    category: CATEGORY.LABELED_CONNECTIONS,
    title: 'Glob-generated labeled connections',
    sourceUrl: 'https://d2lang.com/tour/globs/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/globs-connections.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/globs-connections.svg2',
    language: 'd2',
    checks: ['Spiderman 1', 'Spiderman 2', 'Spiderman 3'],
  },
  {
    id: 'd2-v2-labeled-access-flow',
    category: CATEGORY.LABELED_CONNECTIONS,
    title: 'Access architecture with audited labeled edge',
    sourceUrl: 'https://d2lang.com/tour/grid-diagrams/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/grid-connected.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/grid-connected.svg2',
    language: 'd2',
    checks: ['Teleport', 'Just-in-time Access', 'all connections audited and logged', 'Identity Provider'],
  },
  {
    id: 'd2-v2-container-regift',
    category: CATEGORY.CONTAINER_GROUPING,
    title: 'Cross-container reference with underscore root lookup',
    sourceUrl: 'https://d2lang.com/tour/containers/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/containers-underscore.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/containers-underscore.svg2',
    language: 'd2',
    checks: ['christmas', 'birthdays', 'presents', 'regift'],
  },
  {
    id: 'd2-v2-container-nested-grid',
    category: CATEGORY.CONTAINER_GROUPING,
    title: 'Nested grid container layout',
    sourceUrl: 'https://d2lang.com/tour/grid-diagrams/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/grid-nested-grid.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/grid-nested-grid.svg2',
    language: 'd2',
    checks: ['header', 'body', 'content', 'sidebar', 'footer'],
  },
  {
    id: 'd2-v2-container-ml-platform',
    category: CATEGORY.CONTAINER_GROUPING,
    title: 'Platform graph with explanatory near container',
    sourceUrl: 'https://d2lang.com/tour/near/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/near-explanation.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/near-explanation.svg2',
    language: 'd2',
    checks: ['LLMs', 'ML Platform', 'Model registry', 'Compiler', 'Server'],
  },
];

const plantUmlCases = [
  {
    id: 'plantuml-v2-sequence-notes',
    category: CATEGORY.SEQUENCE_DIAGRAM_EXAMPLE,
    title: 'Sequence diagram with notes and return message',
    sourceUrl: 'https://plantuml.com/sequence-diagram',
    language: 'plantuml',
    checks: ['Browser', 'API', 'Cache', 'note right', 'cached profile'],
    code: `@startuml
participant Browser
participant API
database Cache

Browser -> API: GET /profile
API -> Cache: lookup user
Cache --> API: cached profile
note right of API
  cache hit avoids database
end note
API --> Browser: 200 OK
@enduml`,
  },
  {
    id: 'plantuml-v2-sequence-create-destroy',
    category: CATEGORY.SEQUENCE_DIAGRAM_EXAMPLE,
    title: 'Sequence diagram with create and destroy lifecycle',
    sourceUrl: 'https://plantuml.com/sequence-diagram',
    language: 'plantuml',
    checks: ['Client', 'Worker', 'Job', 'create', 'destroy'],
    code: `@startuml
participant Client
participant Worker

Client -> Worker: enqueue(job)
create Job
Worker -> Job: new(job)
Worker -> Job: run()
Job --> Worker: result
destroy Job
Worker --> Client: completed
@enduml`,
  },
  {
    id: 'plantuml-v2-sequence-critical',
    category: CATEGORY.SEQUENCE_DIAGRAM_EXAMPLE,
    title: 'Sequence diagram with critical section and break',
    sourceUrl: 'https://plantuml.com/sequence-diagram',
    language: 'plantuml',
    checks: ['Service', 'Payment Gateway', 'critical', 'break', 'charge failed'],
    code: `@startuml
actor User
participant Service
participant "Payment Gateway" as PG

User -> Service: checkout
critical reserve inventory
  Service -> PG: authorize card
  PG --> Service: authorization id
else timeout
  break charge failed
    Service --> User: retry later
  end
end
Service --> User: order confirmed
@enduml`,
  },
  {
    id: 'plantuml-v2-class-enum',
    category: CATEGORY.CLASS_DIAGRAM_EXAMPLE,
    title: 'Class diagram with enum and composition',
    sourceUrl: 'https://plantuml.com/class-diagram',
    language: 'plantuml',
    checks: ['Order', 'OrderLine', 'OrderStatus', 'PAID', 'total'],
    code: `@startuml
class Order {
  +id: UUID
  +total(): Money
}
class OrderLine {
  +quantity: int
  +subtotal(): Money
}
enum OrderStatus {
  NEW
  PAID
  SHIPPED
}
Order *-- "1..*" OrderLine
Order --> OrderStatus
@enduml`,
  },
  {
    id: 'plantuml-v2-class-visibility',
    category: CATEGORY.CLASS_DIAGRAM_EXAMPLE,
    title: 'Class diagram with visibility and static members',
    sourceUrl: 'https://plantuml.com/class-diagram',
    language: 'plantuml',
    checks: ['Account', 'Ledger', 'balance', 'credit', 'debit'],
    code: `@startuml
class Account {
  -balance: Decimal
  {static} +currency: String
  +credit(amount)
  +debit(amount)
}
class Ledger {
  +record(entry)
}
Account --> Ledger : writes entries
@enduml`,
  },
  {
    id: 'plantuml-v2-class-interface',
    category: CATEGORY.CLASS_DIAGRAM_EXAMPLE,
    title: 'Class diagram with interface implementation and dependency',
    sourceUrl: 'https://plantuml.com/class-diagram',
    language: 'plantuml',
    checks: ['Repository', 'SqlRepository', 'Service', 'save', 'load'],
    code: `@startuml
interface Repository {
  +save(entity)
  +load(id)
}
class SqlRepository
class Service

Repository <|.. SqlRepository
Service ..> Repository : depends on
@enduml`,
  },
  {
    id: 'plantuml-v2-activity-while',
    category: CATEGORY.ACTIVITY_DIAGRAM_EXAMPLE,
    title: 'Activity diagram with while loop',
    sourceUrl: 'https://plantuml.com/activity-diagram-beta',
    language: 'plantuml',
    checks: ['Open queue', 'Handle message', 'queue empty?', 'Close queue'],
    code: `@startuml
start
:Open queue;
while (queue empty?) is (no)
  :Handle message;
  :Acknowledge message;
endwhile (yes)
:Close queue;
stop
@enduml`,
  },
  {
    id: 'plantuml-v2-activity-switch',
    category: CATEGORY.ACTIVITY_DIAGRAM_EXAMPLE,
    title: 'Activity diagram with switch branches',
    sourceUrl: 'https://plantuml.com/activity-diagram-beta',
    language: 'plantuml',
    checks: ['Receive webhook', 'payment.succeeded', 'invoice.failed', 'Ignore event'],
    code: `@startuml
start
:Receive webhook;
switch (event type?)
case (payment.succeeded)
  :Mark invoice paid;
case (invoice.failed)
  :Notify customer;
case (other)
  :Ignore event;
endswitch
stop
@enduml`,
  },
  {
    id: 'plantuml-v2-activity-swimlanes',
    category: CATEGORY.ACTIVITY_DIAGRAM_EXAMPLE,
    title: 'Activity diagram with swimlanes',
    sourceUrl: 'https://plantuml.com/activity-diagram-beta',
    language: 'plantuml',
    checks: ['Customer', 'Sales', 'Finance', 'Approve quote', 'Send invoice'],
    code: `@startuml
|Customer|
start
:Request quote;
|Sales|
:Prepare quote;
|Finance|
:Approve quote;
|Sales|
:Send quote;
|Customer|
:Accept quote;
|Finance|
:Send invoice;
stop
@enduml`,
  },
];

const mermaidCases = [
  {
    id: 'mermaid-v2-flowchart-arrow-types',
    category: CATEGORY.FLOWCHART,
    title: 'Flowchart with circle, cross, and bidirectional arrows',
    sourceUrl: 'https://mermaid.js.org/syntax/flowchart.html',
    language: 'mermaid',
    checks: ['A', 'B', 'C', 'D'],
    code: `flowchart LR
  A o--o B
  B <--> C
  C x--x D
  A --o C
  B --x D`,
  },
  {
    id: 'mermaid-v2-flowchart-styled-classes',
    category: CATEGORY.FLOWCHART,
    title: 'Flowchart with class definitions and styled nodes',
    sourceUrl: 'https://mermaid.js.org/syntax/flowchart.html',
    language: 'mermaid',
    checks: ['Start', 'Validate', 'Persist', 'Finish'],
    code: `flowchart TD
  Start([Start]) --> Validate{Valid payload?}
  Validate -->|yes| Persist[(Persist)]
  Validate -->|no| Reject[Reject request]
  Persist --> Finish([Finish])
  Reject --> Finish
  classDef success fill:#d5f5e3,stroke:#117a65,stroke-width:2px
  classDef failure fill:#fadbd8,stroke:#922b21,stroke-width:2px
  class Persist,Finish success
  class Reject failure`,
  },
  {
    id: 'mermaid-v2-flowchart-markdown-labels',
    category: CATEGORY.FLOWCHART,
    title: 'Flowchart with markdown labels and multiple text lines',
    sourceUrl: 'https://mermaid.js.org/syntax/flowchart.html',
    language: 'mermaid',
    checks: ['cat', 'dog', 'edge label', 'One'],
    code: `---
config:
  htmlLabels: false
---
flowchart LR
  subgraph "One"
    a("\`The **cat** in the hat\`") -- "edge label" --> b{{"\`The **dog** in the hog\`"}}
  end`,
  },
];

await mkdir(assetDir, { recursive: true });

const previousCodeBlocks = await readPreviousCodeBlocks();
const allCases = [
  ...(await buildD2Cases()),
  ...(await buildPlantUmlCases()),
  ...(await buildMermaidCases()),
];
assertNoDuplicateCode(allCases, previousCodeBlocks);

await writeFile(outputPath, buildMarkdown(allCases), 'utf8');
console.log(`Wrote ${outputPath}`);
console.log(`Assets: ${assetDir}`);
console.log(`Cases: ${allCases.length}`);

async function buildD2Cases() {
  const result = [];
  for (const testCase of d2Cases) {
    const code = await fetchText(testCase.codeUrl);
    const svg = normalizeSvg(await fetchText(testCase.renderUrl));
    const assetPath = resolve(assetDir, `${testCase.id}.svg`);
    await writeFile(assetPath, svg, 'utf8');
    result.push({ ...testCase, code: code.trim(), assetPath });
  }
  return result;
}

async function buildPlantUmlCases() {
  const result = [];
  for (const testCase of plantUmlCases) {
    const renderUrl = `https://www.plantuml.com/plantuml/svg/${encodePlantUml(testCase.code)}`;
    const svg = normalizeSvg(await fetchText(renderUrl));
    const assetPath = resolve(assetDir, `${testCase.id}.svg`);
    await writeFile(assetPath, svg, 'utf8');
    result.push({ ...testCase, renderUrl, assetPath });
  }
  return result;
}

async function buildMermaidCases() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <div id="target"></div>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
      let counter = 0;
      window.__renderMermaid = async function renderMermaid(id, source) {
        counter += 1;
        const { svg } = await mermaid.render('official-v2-' + id + '-' + counter, source);
        document.getElementById('target').innerHTML = svg;
        return svg;
      };
    </script>
  </body>
</html>`);
    await page.waitForFunction(() => typeof window.__renderMermaid === 'function', null, { timeout: 60000 });

    const result = [];
    for (const testCase of mermaidCases) {
      const svg = await page.evaluate(
        ({ id, code }) => window.__renderMermaid(id, code),
        { id: testCase.id, code: testCase.code }
      );
      const assetPath = resolve(assetDir, `${testCase.id}.svg`);
      await writeFile(assetPath, normalizeSvg(svg), 'utf8');
      result.push({ ...testCase, rendererVersion: MERMAID_VERSION, assetPath });
    }
    await page.close();
    return result;
  } finally {
    await browser.close();
  }
}

function buildMarkdown(cases) {
  const sections = [
    '# Official Diagram Rendering Test Cases V2',
    '',
    'This document is the second batch of official diagram rendering test cases. It does not replace the first batch, and every code block here is different from the older cases in `official-diagram-rendering-cases.md`.',
    '',
    'Generated: 2026-07-01',
    '',
    '## How to use',
    '',
    '1. Copy the entire fenced code block from each "Code" section into Supramark to test.',
    '2. Compare Supramark\'s rendering output against this page\'s "Official rendering" for each case.',
    '3. When automating, checking the following is recommended: rendering success, key text, viewBox, node shapes, edge direction, labels, group nesting.',
    '',
    '## Case overview',
    '',
    '| ID | Language | Type | Coverage | Official source |',
    '| --- | --- | --- | --- | --- |',
    ...cases.map(testCase => `| \`${testCase.id}\` | ${testCase.language} | ${testCase.category} | ${escapePipes(testCase.title)} | [source](${testCase.sourceUrl}) |`),
    '',
  ];

  for (const language of ['d2', 'plantuml', 'mermaid']) {
    sections.push(`## ${languageLabel(language)}`, '');
    const languageCases = cases.filter(item => item.language === language);
    const categories = [...new Set(languageCases.map(item => item.category))];
    for (const category of categories) {
      sections.push(`### ${category}`, '');
      for (const testCase of languageCases.filter(item => item.category === category)) {
        const assetRel = relative(docsDir, testCase.assetPath).replaceAll('\\', '/');
        sections.push(
          `#### ${testCase.id}: ${testCase.title}`,
          '',
          // cjk-allow: this header must stay Chinese (Unicode escapes, not
          // literal characters) because official-diagram-visual-workflow.mjs
          // parses it back out with a regex matching the Chinese label
          // "official source:" - see officialSourceMatch in that file.
          `\u5b98\u65b9\u6765\u6e90\uff1a${testCase.sourceUrl}`,
          '',
          testCase.codeUrl ? `Official source code: ${testCase.codeUrl}` : '',
          // cjk-allow: stays Chinese (Unicode escapes) to match
          // officialRenderMatch's regex in official-diagram-visual-workflow.mjs.
          testCase.renderUrl ? `\u5b98\u65b9\u6e32\u67d3 URL\uff1a${testCase.renderUrl}` : '',
          testCase.rendererVersion ? `Official renderer version: Mermaid ${testCase.rendererVersion}` : '',
          '',
          'Code (copy the entire fenced code block below into Supramark to test):',
          '',
          '````markdown',
          `\`\`\`${testCase.language}`,
          testCase.code,
          '```',
          '````',
          '',
          'Official rendering:',
          '',
          `![${testCase.id}](${assetRel})`,
          '',
          // cjk-allow: stays Chinese (Unicode escapes) to match checksMatch's
          // regex in official-diagram-visual-workflow.mjs.
          `\u5efa\u8bae\u68c0\u67e5\u6587\u672c\uff1a${testCase.checks.map(item => `\`${item}\``).join(', ')}`,
          ''
        );
      }
    }
  }

  return sections.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n') + '\n';
}

async function readPreviousCodeBlocks() {
  const doc = await readFile(previousDocPath, 'utf8');
  return new Set(
    [...doc.matchAll(/````markdown\s+```(?:d2|plantuml|mermaid)\s+([\s\S]*?)```\s+````/g)]
      .map(match => normalizeCode(match[1]))
  );
}

function assertNoDuplicateCode(cases, previousCodeBlocks) {
  const current = new Map();
  for (const testCase of cases) {
    const normalized = normalizeCode(testCase.code);
    if (previousCodeBlocks.has(normalized)) {
      throw new Error(`New case duplicates old code: ${testCase.id}`);
    }
    if (current.has(normalized)) {
      throw new Error(`Duplicate code inside V2 cases: ${current.get(normalized)} and ${testCase.id}`);
    }
    current.set(normalized, testCase.id);
  }
}

function normalizeCode(code) {
  return code.replace(/\r\n/g, '\n').trim();
}

function languageLabel(language) {
  if (language === 'd2') return 'D2';
  if (language === 'plantuml') return 'PlantUML';
  if (language === 'mermaid') return 'Mermaid';
  return language;
}

function escapePipes(value) {
  return value.replaceAll('|', '\\|');
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Codex official diagram test case builder v2' },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  }
  return response.text();
}

function normalizeSvg(svg) {
  return svg
    .replace(/^<!--\?xml[\s\S]*?\?-->/, '')
    .replace(/^<\?xml[\s\S]*?\?>/, '')
    .trimStart();
}

function encodePlantUml(source) {
  const compressed = deflateRawSync(Buffer.from(source, 'utf8'));
  let encoded = '';
  for (let i = 0; i < compressed.length; i += 3) {
    if (i + 2 === compressed.length) {
      encoded += append3bytes(compressed[i], compressed[i + 1], 0);
    } else if (i + 1 === compressed.length) {
      encoded += append3bytes(compressed[i], 0, 0);
    } else {
      encoded += append3bytes(compressed[i], compressed[i + 1], compressed[i + 2]);
    }
  }
  return encoded;
}

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function encode6bit(value) {
  if (value < 10) return String.fromCharCode(48 + value);
  value -= 10;
  if (value < 26) return String.fromCharCode(65 + value);
  value -= 26;
  if (value < 26) return String.fromCharCode(97 + value);
  value -= 26;
  if (value === 0) return '-';
  if (value === 1) return '_';
  return '?';
}
