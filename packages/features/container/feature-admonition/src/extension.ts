import type { ContainerExtensionSpec } from '@supramark/core';

export const extension: ContainerExtensionSpec = {
  kind: 'container',
  featureId: '@supramark/feature-admonition',
  nodeName: 'admonition',
  containerNames: ['note', 'tip', 'info', 'warning', 'danger'],
  parserExport: 'registerAdmonitionContainer',
  webRendererExport: 'renderAdmonitionContainerWeb',
  rnRendererExport: 'renderAdmonitionContainerRN',
};
