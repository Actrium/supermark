/**
 * 自定义 Jest 测试环境
 * 扩展 jest-environment-node 并在初始化前设置 localStorage mock
 */

const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);

    // 在环境初始化时就设置 localStorage mock
    // 使用普通函数而不是 jest.fn()，因为 jest 在这个阶段还不可用
    const noop = () => {};

    this.global.localStorage = {
      getItem: noop,
      setItem: noop,
      removeItem: noop,
      clear: noop,
      length: 0,
      key: noop,
    };

    this.global.sessionStorage = {
      getItem: noop,
      setItem: noop,
      removeItem: noop,
      clear: noop,
      length: 0,
      key: noop,
    };
  }
}

module.exports = CustomEnvironment;
