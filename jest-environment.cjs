/**
 * Custom Jest test environment
 * Extends jest-environment-node and sets up a localStorage mock before initialization
 */

const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);

    // Set up the localStorage mock during environment initialization
    // Use a plain function instead of jest.fn(), since jest isn't available at this stage
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
