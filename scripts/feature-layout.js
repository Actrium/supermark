/**
 * Feature 包布局与发现工具
 *
 * 目标：
 * - 把「Feature 在哪个目录下」这一约定集中在一处；
 * - 方便后续从 packages/feature-xxx 迁移到分家族目录时，只改这一层实现；
 * - 为各脚本提供统一的 Feature 扫描 / 定位能力。
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');

function safeReadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 发现所有 Feature 包
 *
 * 约定（当前阶段）：
 * - 所有 Feature 包都位于 packages/ 下的某个子目录；
 * - package.json.name 以 @supramark/feature- 开头；
 *
 * 返回：
 * - name: 包名（如 @supramark/feature-gfm）
 * - shortName: 去掉 scope 及前缀后的名字（如 gfm）
 * - dir: 绝对路径（如 /repo/packages/feature-gfm）
 * - relativeDir: 相对仓库根目录的路径（如 packages/feature-gfm）
 */
function discoverFeaturePackages() {
  const results = [];

  if (!fs.existsSync(PACKAGES_DIR)) {
    return results;
  }

  /** @param {string} dir */
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 跳过 node_modules / dist 等无关目录
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;

        const pkgJsonPath = path.join(fullPath, 'package.json');
        const pkg = fs.existsSync(pkgJsonPath) ? safeReadJson(pkgJsonPath) : null;

        if (pkg && typeof pkg.name === 'string' && pkg.name.startsWith('@supramark/feature-')) {
          const shortName = pkg.name.split('/')[1].replace(/^feature-/, '');
          const relativeDir = path.relative(REPO_ROOT, fullPath) || '.';

          results.push({
            name: pkg.name,
            shortName,
            dir: fullPath,
            relativeDir: relativeDir.replace(/\\/g, '/'),
          });
        } else {
          // 继续向下递归
          walk(fullPath);
        }
      }
    }
  }

  walk(PACKAGES_DIR);
  return results;
}

/**
 * 根据 shortName（如 'gfm'）查找 Feature 包
 */
function findFeaturePackageByShortName(shortName) {
  const all = discoverFeaturePackages();
  return all.find((item) => item.shortName === shortName) || null;
}

/**
 * 计算新建 Feature 包的目标目录。
 *
 * 当前策略：
 * - 使用分家族目录：packages/features/<family>/feature-${kebabName}
 *   其中 family ∈ ['main', 'container', 'fence']，默认 'main'
 * - 同时返回 repository.directory 字段使用的相对路径
 */
function getNewFeatureLocation(kebabName, syntaxFamily = 'main') {
  const family = syntaxFamily || 'main';
  const dirName = `feature-${kebabName}`;
  const dir = path.join(PACKAGES_DIR, 'features', family, dirName);
  const relativeDir = path.relative(REPO_ROOT, dir) || '.';

  return {
    dir,
    relativeDir: relativeDir.replace(/\\/g, '/'),
  };
}

module.exports = {
  discoverFeaturePackages,
  findFeaturePackageByShortName,
  getNewFeatureLocation,
};
