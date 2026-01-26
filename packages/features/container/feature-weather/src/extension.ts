import type { ContainerExtensionSpec } from '@supramark/core';

/**
 * Extension spec used by scripts/generate-container-registry.ts
 */
export const extension: ContainerExtensionSpec = {
  kind: 'container',
  featureId: '@supramark/feature-weather',
  featureDir: 'feature-weather',
  nodeName: 'weather',
  containerNames: ['weather'],
  parserExport: 'registerWeatherContainerParser',
  webRendererExport: 'renderWeatherContainerWeb',
  rnRendererExport: 'renderWeatherContainerRN',
};
