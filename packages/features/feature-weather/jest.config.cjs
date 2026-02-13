/** @type {import('jest').Config} */
module.exports = {
  // 使用 Supramark 共享的 Jest preset
  // 与 @supramark/core 的测试配置保持一致
  ...require('../../../jest.preset.cjs'),

  // Feature 包特定的配置可以在这里覆盖
  // 例如：
  // testEnvironment: 'jsdom', // 如果需要 DOM 环境
  // collectCoverage: true,     // 启用覆盖率收集
};
