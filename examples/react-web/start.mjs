import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 确保根目录依赖已安装（只在缺少 node_modules 时执行）
if (!existsSync(join(rootDir, 'node_modules'))) {
  console.log('[supramark/react-web] 未检测到根目录 node_modules，正在执行 bun install...');
  run('bun', ['install'], rootDir);
}

// 确保 @supramark/core 和 @supramark/web 的构建产物存在
const coreRemarkPath = join(rootDir, 'packages/core/dist/remark.js');
const webIndexPath = join(rootDir, 'packages/web/dist/index.js');

if (!existsSync(coreRemarkPath)) {
  console.log(
    '[supramark/react-web] 未检测到 packages/core/dist/remark.js，正在执行 bun run --filter @supramark/core build...',
  );
  run('bun', ['run', '--filter', '@supramark/core', 'build'], rootDir);
}

if (!existsSync(webIndexPath)) {
  console.log(
    '[supramark/react-web] 未检测到 packages/web/dist/index.js，正在执行 bun run --filter @supramark/web build...',
  );
  run('bun', ['run', '--filter', '@supramark/web', 'build'], rootDir);
}

// 预检完成后，启动实际的 React Web demo 服务器
import('./index.mjs').catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error in react-web demo:', err);
  process.exitCode = 1;
});

