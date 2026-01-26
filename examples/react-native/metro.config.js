const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// 配置 Metro 解析 monorepo 中的包
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// 配置 watchFolders 以包含 monorepo 根目录
config.watchFolders = [workspaceRoot];

// 配置 nodeModulesPath
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 获取原始的 resolveRequest
const defaultResolver = config.resolver.resolveRequest;

// 配置模块解析,处理 package.json exports 和 imports 字段
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 处理 @supramark/core 包的 react-native 入口
  // Metro 不支持 package.json 的 exports 条件导出,需要手动指定 RN 入口
  if (moduleName === '@supramark/core') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'packages/core/dist/index.rn.js'
      ),
      type: 'sourceFile',
    };
  }

  // 处理 devlop 包的 exports 字段
  if (moduleName === 'devlop') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/devlop/lib/default.js'
      ),
      type: 'sourceFile',
    };
  }

  // 处理 vfile 包的 subpath imports (以 # 开头)
  if (moduleName === '#minpath') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/vfile/lib/minpath.browser.js'
      ),
      type: 'sourceFile',
    };
  }

  if (moduleName === '#minproc') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/vfile/lib/minproc.browser.js'
      ),
      type: 'sourceFile',
    };
  }

  if (moduleName === '#minurl') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/vfile/lib/minurl.browser.js'
      ),
      type: 'sourceFile',
    };
  }

  // 处理 unist-util-visit-parents 的 subpath exports
  if (moduleName === 'unist-util-visit-parents/do-not-use-color') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/unist-util-visit-parents/lib/color.js'
      ),
      type: 'sourceFile',
    };
  }

  // 使用默认解析器
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
