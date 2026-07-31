import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
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
const assetDir = resolve(docsDir, 'assets', 'official-diagram-rendering-cases');
const outputPath = resolve(docsDir, 'official-diagram-rendering-cases.md');

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
    id: 'd2-flow-replicas',
    category: CATEGORY.SIMPLEST_FLOW,
    title: 'Replica flow with directed and bidirectional links',
    sourceUrl: 'https://d2lang.com/tour/connections/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/connections-1.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/connections-1.svg2',
    language: 'd2',
    checks: ['Write Replica Canada', 'Write Replica Australia', 'Read Replica', 'Master'],
  },
  {
    id: 'd2-flow-chain-repeat',
    category: CATEGORY.SIMPLEST_FLOW,
    title: 'Four-stage chained flow with repeat edge',
    sourceUrl: 'https://d2lang.com/tour/connections/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/connections-4.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/connections-4.svg2',
    language: 'd2',
    checks: ['Stage One', 'Stage Two', 'Stage Three', 'Stage Four', 'repeat'],
  },
  {
    id: 'd2-flow-direction-right',
    category: CATEGORY.SIMPLEST_FLOW,
    title: 'Three-node directed flow with explicit layout direction',
    sourceUrl: 'https://d2lang.com/tour/layouts/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/direction-right.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/direction-right.svg2',
    language: 'd2',
    checks: ['x', 'y', 'z', 'hello'],
  },
  {
    id: 'd2-labeled-duplicate-connections',
    category: CATEGORY.LABELED_CONNECTIONS,
    title: 'Repeated Database to S3 edges with a label',
    sourceUrl: 'https://d2lang.com/tour/connections/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/connections-2.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/connections-2.svg2',
    language: 'd2',
    checks: ['Database', 'S3', 'backup'],
  },
  {
    id: 'd2-labeled-chain',
    category: CATEGORY.LABELED_CONNECTIONS,
    title: 'Connection chain sharing one label',
    sourceUrl: 'https://d2lang.com/tour/connections/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/connections-3.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/connections-3.svg2',
    language: 'd2',
    checks: ['High Mem Instance', 'EC2', 'High CPU Instance', 'Hosted By'],
  },
  {
    id: 'd2-labeled-indexed-connections',
    category: CATEGORY.LABELED_CONNECTIONS,
    title: 'Two labeled connections between the same endpoints',
    sourceUrl: 'https://d2lang.com/tour/connections/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/connections-reference.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/connections-reference.svg2',
    language: 'd2',
    checks: ['x', 'y', 'hi', 'hello'],
  },
  {
    id: 'd2-container-nested-paths',
    category: CATEGORY.CONTAINER_GROUPING,
    title: 'Nested containers declared through dotted paths',
    sourceUrl: 'https://d2lang.com/tour/containers/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/containers-1.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/containers-1.svg2',
    language: 'd2',
    checks: ['server', 'process', 'apartment', 'office', 'Portal'],
  },
  {
    id: 'd2-container-clouds',
    category: CATEGORY.CONTAINER_GROUPING,
    title: 'Nested cloud provider groups with internal edges',
    sourceUrl: 'https://d2lang.com/tour/containers/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/containers-2.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/containers-2.svg2',
    language: 'd2',
    checks: ['clouds', 'aws', 'gcloud', 'load_balancer', 'auth'],
  },
  {
    id: 'd2-container-cross-group-edges',
    category: CATEGORY.CONTAINER_GROUPING,
    title: 'Labeled containers with cross-group edges',
    sourceUrl: 'https://d2lang.com/tour/containers/',
    codeUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/d2/containers-3.d2',
    renderUrl: 'https://raw.githubusercontent.com/terrastruct/d2-docs/master/static/img/generated/containers-3.svg2',
    language: 'd2',
    checks: ['clouds', 'AWS', 'Google Cloud', 'users', 'ci'],
  },
];

const plantUmlCases = [
  {
    id: 'plantuml-sequence-basic-messages',
    category: CATEGORY.SEQUENCE_DIAGRAM_EXAMPLE,
    title: 'Sequence diagram with multiple request and response arrows',
    sourceUrl: 'https://plantuml.com/sequence-diagram',
    language: 'plantuml',
    checks: ['Alice', 'Bob', 'Authentication Request', 'Authentication Response'],
    code: `@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response
Alice -> Bob: Another authentication Request
Alice <-- Bob: Another authentication Response
@enduml`,
  },
  {
    id: 'plantuml-sequence-grouping',
    category: CATEGORY.SEQUENCE_DIAGRAM_EXAMPLE,
    title: 'PlantUML sequence with grouped branches and loop',
    sourceUrl: 'https://plantuml.com/sequence-diagram',
    language: 'plantuml',
    checks: ['successful case', 'Authentication Accepted', 'DNS Attack', 'Another type of failure'],
    code: `@startuml
Alice -> Bob: Authentication Request
alt successful case
  Bob -> Alice: Authentication Accepted
else some kind of failure
  Bob -> Alice: Authentication Failure
  group My own label
    Alice -> Log : Log attack start
    loop 1000 times
      Alice -> Bob: DNS Attack
    end
    Alice -> Log : Log attack end
  end
else Another type of failure
  Bob -> Alice: Please repeat
end
@enduml`,
  },
  {
    id: 'plantuml-sequence-participants',
    category: CATEGORY.SEQUENCE_DIAGRAM_EXAMPLE,
    title: 'Sequence diagram with participant declarations and return arrow',
    sourceUrl: 'https://plantuml.com/sequence-diagram',
    language: 'plantuml',
    checks: ['User', 'Frontend', 'Backend API', 'Database', 'token'],
    code: `@startuml
actor User
participant "Frontend" as FE
participant "Backend API" as API
database "Database" as DB

User -> FE: Submit credentials
FE -> API: POST /login
API -> DB: Find user
DB --> API: User record
API --> FE: token
FE --> User: Redirect to dashboard
@enduml`,
  },
  {
    id: 'plantuml-class-relations',
    category: CATEGORY.CLASS_DIAGRAM_EXAMPLE,
    title: 'PlantUML class diagram with cardinality and labels',
    sourceUrl: 'https://plantuml.com/class-diagram',
    language: 'plantuml',
    checks: ['Class01', 'Class02', 'contains', 'many', 'aggregation'],
    code: `@startuml
Class01 "1" *-- "many" Class02 : contains
Class03 o-- Class04 : aggregation
Class05 --> "1" Class06
@enduml`,
  },
  {
    id: 'plantuml-class-members',
    category: CATEGORY.CLASS_DIAGRAM_EXAMPLE,
    title: 'Class diagram with attributes, methods, abstract class, and interface',
    sourceUrl: 'https://plantuml.com/class-diagram',
    language: 'plantuml',
    checks: ['Animal', 'Duck', 'Flyable', 'age', 'quack'],
    code: `@startuml
abstract class Animal {
  +int age
  +isMammal()
}
interface Flyable {
  +fly()
}
class Duck {
  +String beakColor
  +swim()
  +quack()
}
Animal <|-- Duck
Flyable <|.. Duck
@enduml`,
  },
  {
    id: 'plantuml-class-packages',
    category: CATEGORY.CLASS_DIAGRAM_EXAMPLE,
    title: 'Class diagram with packages and dependencies',
    sourceUrl: 'https://plantuml.com/class-diagram',
    language: 'plantuml',
    checks: ['Controller', 'Service', 'Repository', 'User', 'uses'],
    code: `@startuml
package "web" {
  class Controller
}
package "domain" {
  class Service
  class User
}
package "persistence" {
  class Repository
}
Controller --> Service : uses
Service --> Repository : reads
Service --> User : returns
@enduml`,
  },
  {
    id: 'plantuml-activity-conditional',
    category: CATEGORY.ACTIVITY_DIAGRAM_EXAMPLE,
    title: 'PlantUML activity diagram with conditional branch',
    sourceUrl: 'https://plantuml.com/activity-diagram-beta',
    language: 'plantuml',
    checks: ['Graphviz installed?', 'process all', 'sequence', 'activity'],
    code: `@startuml
start
if (Graphviz installed?) then (yes)
  :process all\\ndiagrams;
else (no)
  :process only __sequence__ and __activity__ diagrams;
endif
stop
@enduml`,
  },
  {
    id: 'plantuml-activity-repeat',
    category: CATEGORY.ACTIVITY_DIAGRAM_EXAMPLE,
    title: 'Activity diagram with repeat loop',
    sourceUrl: 'https://plantuml.com/activity-diagram-beta',
    language: 'plantuml',
    checks: ['read data', 'generate diagrams', 'more data?', 'publish report'],
    code: `@startuml
start
repeat
  :read data;
  :generate diagrams;
repeat while (more data?) is (yes)
-> no;
:publish report;
stop
@enduml`,
  },
  {
    id: 'plantuml-activity-partitions',
    category: CATEGORY.ACTIVITY_DIAGRAM_EXAMPLE,
    title: 'Activity diagram with partitions and synchronization',
    sourceUrl: 'https://plantuml.com/activity-diagram-beta',
    language: 'plantuml',
    checks: ['Client', 'Server', 'Validate request', 'Persist result', 'Render response'],
    code: `@startuml
start
partition Client {
  :Submit request;
}
partition Server {
  :Validate request;
  fork
    :Persist result;
  fork again
    :Send audit event;
  end fork
}
partition Client {
  :Render response;
}
stop
@enduml`,
  },
];

const mermaidCases = [
  {
    id: 'mermaid-flowchart-decision',
    category: CATEGORY.FLOWCHART,
    title: 'Mermaid flowchart with decision loop and labeled edges',
    sourceUrl: 'https://mermaid.js.org/syntax/flowchart.html',
    language: 'mermaid',
    checks: ['Start', 'Is it?', 'OK', 'Rethink', 'End'],
    code: `flowchart TD
  A[Start] --> B{Is it?}
  B -->|Yes| C[OK]
  C --> D[Rethink]
  D --> B
  B ---->|No| E[End]`,
  },
  {
    id: 'mermaid-flowchart-shapes',
    category: CATEGORY.FLOWCHART,
    title: 'Mermaid flowchart with common node shapes',
    sourceUrl: 'https://mermaid.js.org/syntax/flowchart.html',
    language: 'mermaid',
    checks: ['Round', 'Database', 'Decision', 'Stop'],
    code: `flowchart LR
  A(Round)
  B[(Database)]
  C{Decision}
  D(((Stop)))
  A --> B --> C --> D`,
  },
  {
    id: 'mermaid-flowchart-subgraph',
    category: CATEGORY.FLOWCHART,
    title: 'Mermaid flowchart with subgraphs and cross-group edges',
    sourceUrl: 'https://mermaid.js.org/syntax/flowchart.html',
    language: 'mermaid',
    checks: ['one', 'two', 'three', 'a1', 'b1', 'c1'],
    code: `flowchart TB
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
  two --> c2`,
  },
];

await mkdir(assetDir, { recursive: true });

const allCases = [
  ...(await buildD2Cases()),
  ...(await buildPlantUmlCases()),
  ...(await buildMermaidCases()),
];

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
    const encoded = encodePlantUml(testCase.code);
    const renderUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
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
        const { svg } = await mermaid.render('official-' + id + '-' + counter, source);
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
      result.push({
        ...testCase,
        rendererVersion: MERMAID_VERSION,
        assetPath,
      });
    }
    await page.close();
    return result;
  } finally {
    await browser.close();
  }
}

function buildMarkdown(cases) {
  const sections = [
    '# Official Diagram Rendering Test Cases',
    '',
    'This document collects representative code snippets from the D2, PlantUML, and Mermaid official docs, alongside reference SVGs produced by the official renderer/doc site. The goal is to compare Supramark\'s rendering output against those external official results, not to compare Supramark\'s own output against itself.',
    '',
    `Generated: 2026-07-01`,
    '',
    '## How to use',
    '',
    '1. Paste each code block into the fenced code block for the matching diagram language in Supramark.',
    '2. Compare the SVG/screenshot Supramark renders against this page\'s "Official rendering" for each case.',
    '3. When automating, checking at least the following is recommended: whether rendering succeeded, whether key text is present, whether the viewBox contains visible elements, and whether the main shapes/arrows/groupings match the official rendering.',
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
    headers: { 'User-Agent': 'Codex official diagram test case builder' },
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
