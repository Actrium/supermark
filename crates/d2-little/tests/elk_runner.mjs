// Tiny stdin/stdout elkjs@0.8.2 runner used by the Rust elk-bridge tests and
// the dump_elk example. Reads an ELK graph JSON from stdin, runs
// `elk.layout(graph)`, writes the laid-out graph JSON to stdout.
//
// Mirrors what d2's `d2elklayout` does inside its embedded JS runner:
// `new ELK(); elkLayoutSync(graph)`. elkjs@0.8.2 is the exact version d2
// v0.7.1 bundles (see d2layouts/d2elklayout/NOTICE.txt), so layout output is
// byte-comparable with upstream.
//
// Usage: node elk_runner.mjs < input-graph.json > output-graph.json
//
// `.mjs` (ESM) so the workspace ESLint config (which targets .js/.jsx/.ts/.tsx)
// does not lint it. elkjs lives in the supramark workspace's engines package,
// so we resolve it from a few candidate locations.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(here, '../../../packages/engines'),
  path.resolve(here, '../../../node_modules'),
  process.cwd(),
];
let ELK;
for (const dir of candidates) {
  try {
    const r = createRequire(path.join(dir, 'package.json'));
    const mod = r('elkjs/lib/elk.bundled.js');
    ELK = mod.default || mod.ELK || mod;
    if (ELK) break;
  } catch {
    /* try next */
  }
}
if (!ELK) {
  process.stderr.write('elk_runner: could not resolve elkjs from ' + candidates.join(', ') + '\n');
  process.exit(2);
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const graph = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const elk = new ELK();
try {
  const laid = await elk.layout(graph);
  process.stdout.write(JSON.stringify(laid));
} catch (e) {
  process.stderr.write('elk_runner error: ' + (e && e.stack ? e.stack : String(e)) + '\n');
  process.exit(1);
}
