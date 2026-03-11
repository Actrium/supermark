const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packagesDir = path.join(rootDir, 'packages');
const action = process.argv[2];

if (action !== 'link' && action !== 'unlink') {
  console.error('Usage: node scripts/supramark-link.js <link|unlink>');
  process.exit(1);
}

function collectPackageDirs(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const result = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryDir = path.join(baseDir, entry.name);
    const packageJsonPath = path.join(entryDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      result.push(entryDir);
      continue;
    }

    result.push(...collectPackageDirs(entryDir));
  }

  return result;
}

function readPackageName(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.name;
}

const packageDirs = collectPackageDirs(packagesDir)
  .filter((packageDir) => {
    const packageName = readPackageName(packageDir);
    return packageName && packageName.startsWith('@supramark/');
  })
  .sort((a, b) => readPackageName(a).localeCompare(readPackageName(b)));

for (const packageDir of packageDirs) {
  const packageName = readPackageName(packageDir);
  console.log(`${action} ${packageName}`);

  const result = spawnSync('yarn', [action], {
    cwd: packageDir,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
