/**
 * Admonition Feature
 *
 * Tip-box container block syntax support (note/tip/warning etc.)
 *
 * @packageDocumentation
 */

// Feature definition (main export)
export {
  admonitionFeature,
  ADMONITION_CONTAINER_NAMES,
  type AdmonitionKind,
  // Compatibility exports
  registerAdmonitionContainer,
} from './feature.js';

// Examples
export { admonitionExamples } from './examples.js';

// Renderers (used by the registry)
export { renderAdmonitionContainerWeb } from './runtime.web.js';
export { renderAdmonitionContainerRN } from './runtime.rn.js';
