// Tiny stdin/stdout elkjs@0.8.2 runner used by the Rust elk-bridge tests and
// the dump_elk example. Reads an ELK graph JSON from stdin, runs
// `elk.layout(graph)`, writes the laid-out graph JSON to stdout.
//
// Mirrors what d2's `d2elklayout` does inside its embedded JS runner:
// `new ELK(); elkLayoutSync(graph)`. elkjs@0.8.2 is the exact version d2
// v0.7.1 bundles (see d2layouts/d2elklayout/NOTICE.txt), so layout output is
// byte-comparable with upstream.
//
// Usage: node elk_runner.js < input-graph.json > output-graph.json
//
// elkjs lives in the supramark workspace's engines package, so we resolve it
// from a few candidate locations rather than relying on the script's own dir.
const path = require('path');
const { createRequire } = require('module');

const candidates = [
  path.resolve(__dirname, '../../../packages/engines'),
  path.resolve(__dirname, '../../../node_modules'),
  process.cwd(),
];
let ELK;
for (const dir of candidates) {
  try {
    const r = createRequire(path.join(dir, 'package.json'));
    const mod = r('elkjs/lib/elk.bundled.js');
    ELK = mod.default || mod.ELK || mod;
    if (ELK) break;
  } catch (_) {
    /* try next */
  }
}
if (!ELK) {
  process.stderr.write('elk_runner: could not resolve elkjs from ' + candidates.join(', ') + '\n');
  process.exit(2);
}

async function main() {
  let chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const graph = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const elk = new ELK();
  const laid = await elk.layout(graph);
  process.stdout.write(JSON.stringify(laid));
}

main().catch((e) => {
  process.stderr.write('elk_runner error: ' + (e && e.stack ? e.stack : String(e)) + '\n');
  process.exit(1);
});
