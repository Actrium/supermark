import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ContainerExtensionSpec } from '../packages/core/src/container-extension';
import { discoverFeaturePackages } from './lib-feature-layout';

async function loadExtensionSpec(featurePath: string): Promise<ContainerExtensionSpec | null> {
  const extTs = path.join(featurePath, 'src', 'extension.ts');
  if (!fs.existsSync(extTs)) return null;

  // Import the TS source directly: executed via bunx tsx, which supports ts/esm
  const mod = (await import(pathToFileURL(extTs).href)) as { extension?: ContainerExtensionSpec };
  const spec = mod.extension as ContainerExtensionSpec | undefined;
  return spec ?? null;
}

function validateSpec(spec: ContainerExtensionSpec, source: string) {
  if (spec.kind !== 'container') throw new Error(`Invalid kind in ${source}`);
  if (!spec.featureId) throw new Error(`Missing featureId in ${source}`);
  if (!spec.nodeName) throw new Error(`Missing nodeName in ${source}`);
  if (!Array.isArray(spec.containerNames) || spec.containerNames.length === 0) {
    throw new Error(`Missing containerNames in ${source}`);
  }
  if (!spec.parserExport) throw new Error(`Missing parserExport in ${source}`);
  if (!spec.webRendererExport) throw new Error(`Missing webRendererExport in ${source}`);
  if (!spec.rnRendererExport) throw new Error(`Missing rnRendererExport in ${source}`);
}

async function main() {
  const allFeatures = discoverFeaturePackages();
  const specs: ContainerExtensionSpec[] = [];

  for (const feature of allFeatures) {
    const spec = await loadExtensionSpec(feature.dir);
    if (!spec) continue;
    spec.featureDir = feature.shortName; // shortName is now a plain slug like 'admonition'
    validateSpec(spec, `${feature.dir}/src/extension.ts`);
    specs.push(spec);
  }

  // The previous codegen logic has been removed entirely.
  // The current architecture uses "passive" renderers: the Supramark component resolves
  // rendering logic dynamically from config.features, so there is no need to maintain a
  // global registry or middleware code at the library level.

  console.log(
    `[features:sync] Scanned ${specs.length} container extension(s). Document synchronization triggered.`
  );
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
