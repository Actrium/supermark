module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier', // 关闭与 Prettier 冲突的规则
  ],
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // TypeScript 相关
    // This repo integrates with many untyped JS ecosystems (markdown-it plugins, renderer bridges).
    // Keep visibility on `any`, but don't block CI on it.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    // React 相关
    'react/react-in-jsx-scope': 'off', // React 17+ 不需要
    'react/prop-types': 'off', // 使用 TypeScript
    'react/display-name': 'off',

    // 通用规则
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'no-var': 'error',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'generated/',

    // docs build outputs / caches
    'docs/public/typedoc/',
    'docs/public/typedoc/**',
    'docs/.vitepress/cache/',
    'docs/.vitepress/cache/**',
    'packages/core/docs/api/',
    'packages/core/docs/api/**',

    // demo apps
    'examples/',
    'examples/**',

    '*.config.js',
    'scripts/',
  ],
};
