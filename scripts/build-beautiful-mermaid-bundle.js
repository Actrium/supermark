const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const esbuildBin = path.join(repoRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
const entry = path.join(repoRoot, 'node_modules', 'beautiful-mermaid', 'dist', 'index.js');
const outFile = path.join(
  repoRoot,
  'packages',
  'renderers',
  'rn-diagram-worker',
  'src',
  'vendor',
  'beautifulMermaidBundle.ts'
);
const tmpFile = path.join(repoRoot, 'tmp-beautiful-mermaid.bundle.js');

execFileSync(esbuildBin, [
  entry,
  '--bundle',
  '--platform=browser',
  '--format=iife',
  '--global-name=BeautifulMermaid',
  '--minify',
  `--outfile=${tmpFile}`,
], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const bundle = fs.readFileSync(tmpFile, 'utf8');
fs.unlinkSync(tmpFile);

const output = [
  '// GENERATED FILE. DO NOT EDIT.',
  '// Source: beautiful-mermaid@1.1.3',
  '// Regenerate with: bun run build:beautiful-mermaid-bundle',
  '// Build command:',
  '//   esbuild node_modules/beautiful-mermaid/dist/index.js',
  '//   --bundle --platform=browser --format=iife',
  '//   --global-name=BeautifulMermaid --minify',
  '',
  `export const BEAUTIFUL_MERMAID_BUNDLE = ${JSON.stringify(bundle)};`,
  '',
].join('\n');

fs.writeFileSync(outFile, output);
console.log(`Wrote ${path.relative(repoRoot, outFile)}`);
