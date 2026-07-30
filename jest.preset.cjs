/**
 * Shared Jest config preset for Supramark Feature packages
 *
 * Purpose:
 * - Provide a unified test configuration for all Feature packages
 * - Keep style consistent with @supramark/core's configuration
 * - Reduce duplicated configuration code across packages
 *
 * Usage:
 * In a Feature package's jest.config.cjs:
 * ```javascript
 * module.exports = {
 *   ...require('../../jest.preset.cjs'),
 * };
 * ```
 */

module.exports = {
  preset: 'ts-jest',
  // Use a custom test environment that pre-sets up a localStorage mock
  testEnvironment: '<rootDir>/../../jest-environment.cjs',

  // Test file paths
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],

  // TypeScript and JavaScript transform configuration
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
        },
        // Ignore type errors (especially missing type definitions from third-party libraries)
        diagnostics: {
          ignoreCodes: [7016], // Ignore "Could not find a declaration file" errors
        },
      },
    ],
    // Transform ESM modules in node_modules (.js files)
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

  // Module path mapping (used to resolve @supramark/core)
  moduleNameMapper: {
    '^@supramark/core$': '<rootDir>/../core/src/index.ts',
    // Handle the .js extension (which actually points to a .ts file)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Allow transforming the small set of test dependencies still published as ESM.
  transformIgnorePatterns: [
    'node_modules/(?!(escape-string-regexp|@types)/)',
  ],

  // Code coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],

  // Optional: enable coverage collection (off by default, enable as needed)
  // collectCoverage: false,
  // coverageDirectory: 'coverage',
  // coverageReporters: ['text', 'lcov'],
};
