#!/usr/bin/env node

/**
 * Register/commit feature integrations.
 *
 * Today this script focuses on container features:
 * - Regenerate `generated/container.*.ts`
 *
 * Goal: after creating/updating a feature package (and implementing required
 * in-package entrypoints like `src/extension.ts`, `src/syntax.ts`,
 * `src/runtime.web.tsx`, `src/runtime.rn.tsx`), running this script should be
 * enough for all examples/apps to pick it up automatically.
 */

const { spawnSync } = require('node:child_process');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('bun', ['run', 'gen:container-registry']);

console.log('[register-features] done');
