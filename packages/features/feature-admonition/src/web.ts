/**
 * Admonition Feature (web entry)
 *
 * Browser-focused exports only.
 */

export {
  admonitionFeature,
  ADMONITION_CONTAINER_NAMES,
  type AdmonitionKind,
  registerAdmonitionContainer,
} from './feature.js';

export { admonitionExamples } from './examples.js';
export { renderAdmonitionContainerWeb } from './runtime.web.js';
