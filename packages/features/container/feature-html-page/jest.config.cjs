/** @type {import('jest').Config} */
module.exports = {
  // 复用仓库根目录的共享 Jest preset
  ...require('../../../../jest.preset.cjs'),

  // 如需在该 Feature 包中覆盖额外配置，可在此追加
};
