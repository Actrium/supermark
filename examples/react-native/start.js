const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const here = __dirname;
const rootDir = resolve(here, '../..');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

// Make sure root dependencies are installed (only runs when node_modules is missing)
if (!existsSync(resolve(rootDir, 'node_modules'))) {
  console.log('[supramark/native] root node_modules not found, running bun install...');
  run('bun', ['install'], rootDir);
}

// Start the Expo dev server
console.log('[supramark/native] starting Expo (expo start)...');
run('bunx', ['expo', 'start'], here);

