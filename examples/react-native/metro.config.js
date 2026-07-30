const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Configure Metro to resolve packages inside the monorepo
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Include the monorepo root in watchFolders
config.watchFolders = [workspaceRoot];

// Configure nodeModulesPaths
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Grab the original resolveRequest
const defaultResolver = config.resolver.resolveRequest;

// Custom module resolution, handling package.json exports/imports fields
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // RN must not load the wasm web parser. plugin-loader.ts re-exports the web
  // loader whose `await import(specifier)` wasm fallback Metro cannot bundle;
  // route every plugin-loader / plugin-loader-web request to the native-adapter
  // loader so parse() goes through the linked libsupramark_markdown_native.
  if (
    platform !== 'web' &&
    /(^|\/)plugin-loader(-web)?(\.(js|ts))?$/.test(moduleName)
  ) {
    return {
      filePath: path.resolve(workspaceRoot, 'packages/core/src/plugin-loader-rn.ts'),
      type: 'sourceFile',
    };
  }

  // Several TS source files in the workspace import sibling `.ts` files using
  // Node-ESM style `./foo.js` specifiers. Metro won't remap `.js` to `.ts` by
  // default — for relative-path-only, `.js`-suffixed failures we fall back to
  // trying the same-named `.ts` / `.tsx`, preserving the ESM style on the
  // source side.
  if (
    (moduleName.startsWith('./') || moduleName.startsWith('../')) &&
    moduleName.endsWith('.js')
  ) {
    const stripped = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, stripped, platform);
    } catch {
      // fall through to other resolvers
    }
  }

  // RN never loads the wasm web packages. D2 / Mermaid / PlantUML go through
  // the native FFI adapter; ECharts / Vega-Lite go through the pure-JS
  // SVG-string engine. @supramark/engines/src/* still statically references
  // some *-web package names, and Metro won't skip an uncalled
  // `await import(...)`, so we short-circuit just these wasm/web entries to
  // an empty stub.
  if (/^@(kookyleo|actrium)\/(d2|mermaid|plantuml)-little-web$|^@(kookyleo|actrium)\/graphviz-anywhere-web$/.test(moduleName)) {
    return {
      filePath: path.resolve(projectRoot, 'stubs/empty.js'),
      type: 'sourceFile',
    };
  }

  // Handle the react-native entry point for the @supramark/core package.
  // Metro doesn't support package.json's exports conditional exports, so we
  // point it at the RN entry manually. An earlier version pointed at
  // dist/index.rn.js (which no longer exists; core now ships source
  // directly) — we now feed Metro the source file directly instead, avoiding
  // a dependency on an extra tsc --emit step.
  if (moduleName === '@supramark/core') {
    return {
      filePath: path.resolve(workspaceRoot, 'packages/core/src/index.rn.ts'),
      type: 'sourceFile',
    };
  }

  // @supramark/engines's ./rn subpath — Metro likewise doesn't support
  // package.json exports subpaths; map it to the source file manually.
  // @supramark/core/rn subpath — Metro ignores package.json exports, so map it
  // to the same RN entry as the bare specifier (index.rn.ts re-exports the
  // native parser registry @supramark/markdown-native-rn registers into).
  if (moduleName === '@supramark/core/rn') {
    return {
      filePath: path.resolve(workspaceRoot, 'packages/core/src/index.rn.ts'),
      type: 'sourceFile',
    };
  }

  if (moduleName === '@supramark/engines/rn') {
    return {
      filePath: path.resolve(workspaceRoot, 'packages/engines/src/rn.ts'),
      type: 'sourceFile',
    };
  }

  // Handle the devlop package's exports field
  if (moduleName === 'devlop') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/devlop/lib/default.js'
      ),
      type: 'sourceFile',
    };
  }

  // Handle the vfile package's subpath imports (starting with #)
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

  // Handle unist-util-visit-parents's subpath exports
  if (moduleName === 'unist-util-visit-parents/do-not-use-color') {
    return {
      filePath: path.resolve(
        workspaceRoot,
        'node_modules/unist-util-visit-parents/lib/color.js'
      ),
      type: 'sourceFile',
    };
  }

  // Fall back to the default resolver
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
