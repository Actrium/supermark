/**
 * Feature registry for preview app.
 *
 * Provides unified access to feature metadata + examples,
 * regardless of whether the feature is SupramarkFeature or ContainerFeature.
 */

import type { ExampleDefinition } from '@supramark/core';

import { admonitionFeature } from '@supramark/feature-admonition';
import { admonitionExamples } from '@supramark/feature-admonition';
import { coreMarkdownFeature } from '@supramark/feature-core-markdown';
import { coreMarkdownExamples } from '@supramark/feature-core-markdown';
import { definitionListFeature } from '@supramark/feature-definition-list';
import { definitionListExamples } from '@supramark/feature-definition-list';
import { diagramDotFeature } from '@supramark/feature-diagram-dot';
import { diagramDotExamples } from '@supramark/feature-diagram-dot';
import { diagramEchartsFeature } from '@supramark/feature-diagram-echarts';
import { diagramEchartsExamples } from '@supramark/feature-diagram-echarts';
import { diagramPlantUmlFeature } from '@supramark/feature-diagram-plantuml';
import { diagramPlantUmlExamples } from '@supramark/feature-diagram-plantuml';
import { diagramVegaLiteFeature } from '@supramark/feature-diagram-vega-lite';
import { diagramVegaLiteExamples } from '@supramark/feature-diagram-vega-lite';
import { emojiFeature } from '@supramark/feature-emoji';
import { emojiExamples } from '@supramark/feature-emoji';
import { footnoteFeature } from '@supramark/feature-footnote';
import { footnoteExamples } from '@supramark/feature-footnote';
import { gfmFeature } from '@supramark/feature-gfm';
import { gfmExamples } from '@supramark/feature-gfm';
import { mathFeature } from '@supramark/feature-math';
import { mathExamples } from '@supramark/feature-math';
import { weatherFeature } from '@supramark/feature-weather';
import { weatherExamples, renderWeatherContainerWeb } from '@supramark/feature-weather';

// Register container feature parsers (must run before parsing)
admonitionFeature.registerParser();
weatherFeature.registerParser();

// Container renderers for Supramark component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const containerRenderers: Record<string, any> = {
  weather: renderWeatherContainerWeb,
};

export interface FeatureEntry {
  /** Short name, e.g. "weather", "math" */
  shortName: string;
  /** Display name, e.g. "Weather", "Math Formula" */
  displayName: string;
  /** Semver version */
  version: string;
  /** Examples */
  examples: ExampleDefinition[];
}

function shortName(id: string): string {
  // "@supramark/feature-weather" -> "weather"
  return id.replace(/^@supramark\/feature-/, '');
}

export const featureRegistry: FeatureEntry[] = [
  { shortName: shortName(admonitionFeature.id), displayName: admonitionFeature.name, version: admonitionFeature.version, examples: admonitionExamples },
  { shortName: shortName(coreMarkdownFeature.metadata.id), displayName: coreMarkdownFeature.metadata.name, version: coreMarkdownFeature.metadata.version, examples: coreMarkdownExamples },
  { shortName: shortName(definitionListFeature.metadata.id), displayName: definitionListFeature.metadata.name, version: definitionListFeature.metadata.version, examples: definitionListExamples },
  { shortName: shortName(diagramDotFeature.metadata.id), displayName: diagramDotFeature.metadata.name, version: diagramDotFeature.metadata.version, examples: diagramDotExamples },
  { shortName: shortName(diagramEchartsFeature.metadata.id), displayName: diagramEchartsFeature.metadata.name, version: diagramEchartsFeature.metadata.version, examples: diagramEchartsExamples },
  { shortName: shortName(diagramPlantUmlFeature.metadata.id), displayName: diagramPlantUmlFeature.metadata.name, version: diagramPlantUmlFeature.metadata.version, examples: diagramPlantUmlExamples },
  { shortName: shortName(diagramVegaLiteFeature.metadata.id), displayName: diagramVegaLiteFeature.metadata.name, version: diagramVegaLiteFeature.metadata.version, examples: diagramVegaLiteExamples },
  { shortName: shortName(emojiFeature.metadata.id), displayName: emojiFeature.metadata.name, version: emojiFeature.metadata.version, examples: emojiExamples },
  { shortName: shortName(footnoteFeature.metadata.id), displayName: footnoteFeature.metadata.name, version: footnoteFeature.metadata.version, examples: footnoteExamples },
  { shortName: shortName(gfmFeature.metadata.id), displayName: gfmFeature.metadata.name, version: gfmFeature.metadata.version, examples: gfmExamples },
  { shortName: shortName(mathFeature.metadata.id), displayName: mathFeature.metadata.name, version: mathFeature.metadata.version, examples: mathExamples },
  { shortName: shortName(weatherFeature.id), displayName: weatherFeature.name, version: weatherFeature.version, examples: weatherExamples },
].sort((a, b) => a.displayName.localeCompare(b.displayName));

export function findFeature(name: string): FeatureEntry | undefined {
  return featureRegistry.find(f => f.shortName === name || f.displayName.toLowerCase() === name.toLowerCase());
}
