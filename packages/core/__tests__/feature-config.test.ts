/**
 * Feature 配置系统测试
 */

import {
  FeatureRegistry,
  createConfigFromRegistry,
  getEnabledFeatureIds,
  getEnabledFeatures,
  isFeatureEnabled,
  getFeatureOptions,
  type SupramarkConfig,
  type SupramarkNode,
  type SupramarkFeature,
} from '../src/feature';

function createTestFeature(id: string, type: string): SupramarkFeature<SupramarkNode> {
  return {
    metadata: {
      id,
      name: id,
      version: '1.0.0',
      author: 'Test',
      description: 'Test feature',
      license: 'Apache-2.0',
    },
    syntax: {
      ast: {
        type,
      },
    },
    renderers: {},
    examples: [],
    testing: {},
    documentation: {
      readme: 'Test feature',
    },
  };
}

describe('Feature 配置系统', () => {
  beforeEach(() => {
    // 清空注册表
    FeatureRegistry.clear();
  });

  describe('createConfigFromRegistry', () => {
    it('应该从空的 Registry 生成空配置', () => {
      const config = createConfigFromRegistry();

      expect(config.features).toEqual([]);
      expect(config.options).toEqual({
        cache: true,
        strict: false,
      });
    });

    it('应该从 Registry 生成启用所有 Feature 的配置', () => {
      // 注册两个 Features
      FeatureRegistry.register(createTestFeature('@test/feature-a', 'test-a'));

      FeatureRegistry.register(createTestFeature('@test/feature-b', 'test-b'));

      const config = createConfigFromRegistry(true);

      expect(config.features).toHaveLength(2);
      expect(config.features?.[0]).toEqual({
        id: '@test/feature-a',
        enabled: true,
      });
      expect(config.features?.[1]).toEqual({
        id: '@test/feature-b',
        enabled: true,
      });
    });

    it('应该支持默认禁用所有 Features', () => {
      FeatureRegistry.register(createTestFeature('@test/feature-a', 'test-a'));

      const config = createConfigFromRegistry(false);

      expect(config.features).toHaveLength(1);
      expect(config.features?.[0].enabled).toBe(false);
    });
  });

  describe('getEnabledFeatureIds', () => {
    it('应该返回空数组当没有配置时', () => {
      const config: SupramarkConfig = {};
      const ids = getEnabledFeatureIds(config);

      expect(ids).toEqual([]);
    });

    it('应该返回所有启用的 Feature IDs', () => {
      const config: SupramarkConfig = {
        features: [
          { id: '@test/feature-a', enabled: true },
          { id: '@test/feature-b', enabled: false },
          { id: '@test/feature-c', enabled: true },
        ],
      };

      const ids = getEnabledFeatureIds(config);

      expect(ids).toEqual(['@test/feature-a', '@test/feature-c']);
    });
  });

  describe('getEnabledFeatures', () => {
    it('应该返回空数组当没有配置时', () => {
      const config: SupramarkConfig = {};
      const features = getEnabledFeatures(config);

      expect(features).toEqual([]);
    });

    it('应该返回所有启用的 Feature 定义', () => {
      // 注册 Features
      const featureA = createTestFeature('@test/feature-a', 'test-a');
      const featureB = createTestFeature('@test/feature-b', 'test-b');

      FeatureRegistry.register(featureA);
      FeatureRegistry.register(featureB);

      // 配置：只启用 A
      const config: SupramarkConfig = {
        features: [
          { id: '@test/feature-a', enabled: true },
          { id: '@test/feature-b', enabled: false },
        ],
      };

      const enabled = getEnabledFeatures(config);

      expect(enabled).toHaveLength(1);
      expect(enabled[0]).toBe(featureA);
    });

    it('应该过滤掉未注册的 Features', () => {
      const config: SupramarkConfig = {
        features: [
          { id: '@test/non-existent', enabled: true },
          { id: '@test/another-missing', enabled: true },
        ],
      };

      const enabled = getEnabledFeatures(config);

      expect(enabled).toEqual([]);
    });
  });

  describe('isFeatureEnabled', () => {
    it('应该返回 false 当 Feature 未配置时', () => {
      const config: SupramarkConfig = {};

      expect(isFeatureEnabled(config, '@test/feature-a')).toBe(false);
    });

    it('应该返回正确的启用状态', () => {
      const config: SupramarkConfig = {
        features: [
          { id: '@test/feature-a', enabled: true },
          { id: '@test/feature-b', enabled: false },
        ],
      };

      expect(isFeatureEnabled(config, '@test/feature-a')).toBe(true);
      expect(isFeatureEnabled(config, '@test/feature-b')).toBe(false);
      expect(isFeatureEnabled(config, '@test/feature-c')).toBe(false);
    });
  });

  describe('getFeatureOptions', () => {
    it('应该返回空对象当 Feature 未配置时', () => {
      const config: SupramarkConfig = {};

      expect(getFeatureOptions(config, '@test/feature-a')).toEqual({});
    });

    it('应该返回空对象当 Feature 没有 options 时', () => {
      const config: SupramarkConfig = {
        features: [{ id: '@test/feature-a', enabled: true }],
      };

      expect(getFeatureOptions(config, '@test/feature-a')).toEqual({});
    });

    it('应该返回 Feature 的配置选项', () => {
      const options = { theme: 'dark', showLineNumbers: true };
      const config: SupramarkConfig = {
        features: [{ id: '@test/feature-a', enabled: true, options }],
      };

      expect(getFeatureOptions(config, '@test/feature-a')).toEqual(options);
    });
  });

  describe('集成测试', () => {
    it('应该支持完整的配置流程', () => {
      // 1. 注册 Features
      FeatureRegistry.register({
        ...createTestFeature('@supramark/feature-mermaid', 'diagram'),
        syntax: {
          ast: {
            type: 'diagram',
            selector: (node: SupramarkNode) =>
              node.type === 'diagram' && (node as any).engine === 'mermaid',
          },
        },
      });

      FeatureRegistry.register({
        ...createTestFeature('@supramark/feature-vega-lite', 'diagram'),
        syntax: {
          ast: {
            type: 'diagram',
            selector: (node: SupramarkNode) =>
              node.type === 'diagram' && (node as any).engine === 'vega-lite',
          },
        },
      });

      // 2. 生成默认配置
      const defaultConfig = createConfigFromRegistry(true);
      expect(defaultConfig.features).toHaveLength(2);

      // 3. 用户自定义配置
      const userConfig: SupramarkConfig = {
        features: [
          { id: '@supramark/feature-mermaid', enabled: true },
          {
            id: '@supramark/feature-vega-lite',
            enabled: true,
            options: { theme: 'dark' },
          },
        ],
      };

      // 4. 查询启用状态
      expect(isFeatureEnabled(userConfig, '@supramark/feature-mermaid')).toBe(true);
      expect(isFeatureEnabled(userConfig, '@supramark/feature-vega-lite')).toBe(true);

      // 5. 获取配置选项
      const vegaOptions = getFeatureOptions(userConfig, '@supramark/feature-vega-lite');
      expect(vegaOptions).toEqual({ theme: 'dark' });

      // 6. 获取启用的 Features
      const enabledFeatures = getEnabledFeatures(userConfig);
      expect(enabledFeatures).toHaveLength(2);
      expect(enabledFeatures[0].metadata.id).toBe('@supramark/feature-mermaid');
      expect(enabledFeatures[1].metadata.id).toBe('@supramark/feature-vega-lite');
    });
  });
});
