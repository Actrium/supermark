import { describe, expect, test } from 'bun:test';

import { resolveDevelopmentMode } from '../src/devMode';

describe('resolveDevelopmentMode', () => {
  test('treats an explicit React Native __DEV__ false as authoritative', () => {
    expect(
      resolveDevelopmentMode({
        __DEV__: false,
        process: { env: { NODE_ENV: 'development' } },
      })
    ).toBe(false);
  });

  test('uses NODE_ENV only when __DEV__ is absent', () => {
    expect(resolveDevelopmentMode({ process: { env: { NODE_ENV: 'production' } } })).toBe(false);
    expect(resolveDevelopmentMode({ process: { env: { NODE_ENV: 'test' } } })).toBe(true);
  });
});
