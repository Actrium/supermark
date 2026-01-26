module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // 导出文件不需要测试
  ],
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 60,
      lines: 55,
      statements: 55,
    },
  },
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  moduleNameMapper: {
    '^@supramark/core$': '<rootDir>/src/index.ts',
    // 处理 .js 扩展名（实际指向 .ts 文件）
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // 允许转换 ESM 模块（unified, remark, etc.）
  transformIgnorePatterns: [
    'node_modules/(?!(unified|remark.*|micromark.*|mdast.*|unist.*|vfile.*|bail|trough|is-plain-obj|zwitch|devlop|character-entities.*|escape-string-regexp|markdown-table|property-information|space-separated-tokens|comma-separated-tokens|hast-util.*|web-namespaces|decode-named-character-reference|ccount|longest-streak|@types)/)',
  ],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
        },
        // 忽略类型错误（特别是第三方库的类型定义缺失）
        diagnostics: {
          ignoreCodes: [7016], // 忽略 "Could not find a declaration file" 错误
        },
        isolatedModules: true,
      },
    ],
    // 转换 node_modules 中的 ESM 模块（.js 文件）
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          allowJs: true,
        },
      },
    ],
  },
};
