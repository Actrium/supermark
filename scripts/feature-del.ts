#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  findFeaturePackageByShortName,
  selectFeature,
  type FeaturePackageInfo,
  log,
  question,
  colors,
  closeRL,
} from './lib-feature-layout';

const REPO_ROOT = path.resolve(__dirname, '..');

interface DeleteResult {
  success: boolean;
  message: string;
}

function deleteDirectory(dirPath: string): DeleteResult {
  if (!fs.existsSync(dirPath)) {
    return { success: true, message: 'directory does not exist' };
  }

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return { success: true, message: 'deleted successfully' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

interface BundleResult {
  file: string;
  success: boolean;
  message: string;
}

function removeFromBundles(featureShortName: string): BundleResult[] {
  const bundleFiles = [
    'examples/react-web-csr/src/all-features.ts',
    'examples/react-native/src/all-features.ts',
  ];

  const results: BundleResult[] = [];

  for (const bundleFile of bundleFiles) {
    const fullPath = path.join(REPO_ROOT, bundleFile);
    if (!fs.existsSync(fullPath)) {
      results.push({ file: bundleFile, success: true, message: 'file does not exist' });
      continue;
    }

    try {
      let content = fs.readFileSync(fullPath, 'utf-8');

      const importRegex = new RegExp(
        `import\\s*{[^}]*}[^\\n]*from\\s*['"]@supramark/feature-${featureShortName}['"][^\\n]*\\n?`,
        'g'
      );
      content = content.replace(importRegex, '');

      const featuresArrayRegex = /(const features[^=]*=\\s*\\[)([\\s\\S]*?)(\\];)/;
      const match = content.match(featuresArrayRegex);
      if (match) {
        const arrayContent = match[2]!;
        const featureItemRegex = new RegExp(
          `\\s*[^\\n]*feature-${featureShortName}[^\\n]*,?\\s*\\n?`,
          'g'
        );
        const cleanedArrayContent = arrayContent.replace(featureItemRegex, '');

        const finalArrayContent = cleanedArrayContent
          .replace(/,\\s*\\n\\s*\\]/g, '\\n]')
          .replace(/\\n\\s*\\n/g, '\\n')
          .replace(/^\\s+|\\s+$/gm, '');

        content = content.replace(featuresArrayRegex, `$1${finalArrayContent}$3`);
      }

      fs.writeFileSync(fullPath, content, 'utf-8');
      results.push({ file: bundleFile, success: true, message: 'updated successfully' });
    } catch (error) {
      results.push({
        file: bundleFile,
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

interface DocResult {
  file: string;
  success: boolean;
  message: string;
}

function removeFromDocs(featureShortName: string): DocResult[] {
  const results: DocResult[] = [];

  const docFile = path.join(REPO_ROOT, `docs/features/${featureShortName}.md`);

  if (fs.existsSync(docFile)) {
    try {
      fs.unlinkSync(docFile);
      results.push({
        file: `docs/features/${featureShortName}.md`,
        success: true,
        message: 'deleted successfully',
      });
    } catch (error) {
      results.push({
        file: `docs/features/${featureShortName}.md`,
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    results.push({
      file: `docs/features/${featureShortName}.md`,
      success: true,
      message: 'file does not exist',
    });
  }

  const indexFile = path.join(REPO_ROOT, 'docs/features/index.md');
  if (fs.existsSync(indexFile)) {
    try {
      let content = fs.readFileSync(indexFile, 'utf-8');

      const featureRegex = new RegExp(
        `###\\s*\\[@supramark/feature-${featureShortName}\\][\\s\\S]*?(?=###\\s*\\[@supramark/|##\\s*|$)`,
        'g'
      );
      content = content.replace(featureRegex, '');
      content = content.replace(/\\n\\s*\\n\\s*\\n/g, '\\n\\n');

      fs.writeFileSync(indexFile, content, 'utf-8');
      results.push({ file: 'docs/features/index.md', success: true, message: 'updated successfully' });
    } catch (error) {
      results.push({
        file: 'docs/features/index.md',
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function showResults(
  title: string,
  results: Array<{ success: boolean; message: string; file?: string; dir?: string }>,
  showSuccess = true
): void {
  if (results.length === 0) return;

  log(`\n${title}:`, 'yellow');
  results.forEach(result => {
    const color = result.success ? (showSuccess ? 'green' : 'gray') : 'red';
    const status = result.success ? '✓' : '✗';
    const name = result.file || result.dir || 'unknown';
    log(`  ${status} ${name}: ${result.message}`, color);
  });
}

interface CliOptions {
  featureName: string | null;
  help: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    featureName: null,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('--')) {
      options.featureName = arg;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
${colors.bright}Supramark Feature Deletion Tool${colors.reset}

${colors.blue}Usage:${colors.reset}
  bun run feature:del               # interactive selection and deletion
  bun run feature:del <feature-name> # delete the specified feature directly

${colors.blue}Examples:${colors.reset}
  ${colors.gray}# Interactive deletion${colors.reset}
  bun run feature:del

  ${colors.gray}# Delete a specific feature directly${colors.reset}
  bun run feature:del gift
`);
}

async function main(): Promise<void> {
  log('\n🗑️  Supramark Feature Deletion Tool\n', 'bright');

  try {
    const cliOptions = parseArgs();

    if (cliOptions.help) {
      showHelp();
      return;
    }

    let selectedFeature: FeaturePackageInfo | null = null;

    if (cliOptions.featureName) {
      const targetName = cliOptions.featureName.replace(/^feature-/, '');
      selectedFeature = findFeaturePackageByShortName(targetName);

      if (!selectedFeature) {
        log(`❌ Feature not found: ${targetName}\n`, 'red');
        return;
      }
      log(`Selected feature: ${colors.green}${selectedFeature.shortName}${colors.reset}\n`, 'reset');
    } else {
      selectedFeature = await selectFeature('Select the feature to delete:');
    }

    if (!selectedFeature) {
      log('\nCancelled.\n', 'yellow');
      return;
    }

    const selectedShortName = selectedFeature.shortName;

    log('\n⚠️  Warning: this operation will permanently delete the feature and all its related files!\n', 'red');
    log('The following will be deleted:', 'yellow');
    log(`  • Feature directory: ${selectedFeature.dir}`, 'gray');
    log(`  • Package name: @supramark/feature-${selectedShortName}`, 'gray');
    log(`  • Documentation file: docs/features/${selectedShortName}.md`, 'gray');

    const confirmName = await question(
      `\nType the feature name "${selectedShortName}" to confirm deletion (or press Enter to cancel): `
    );
    if (confirmName !== selectedShortName) {
      log('\nName mismatch, deletion cancelled.\n', 'yellow');
      return;
    }

    log('\n🔄 Deleting feature...\n', 'gray');

    const deleteResult = deleteDirectory(selectedFeature.dir);
    showResults('Feature directory deletion', [{ dir: selectedFeature.dir, ...deleteResult }]);

    const bundleResults = removeFromBundles(selectedShortName);
    showResults('Bundle file update', bundleResults);

    const docResults = removeFromDocs(selectedShortName);
    showResults('Documentation cleanup', docResults);

    log('\n📝 Manual follow-up steps:', 'yellow');
    log('  1. Run bun install to reinstall dependencies', 'reset');
    log('  2. Run bun run features:sync to sync the registry', 'reset');

    log('\n✨ Feature deletion complete!\n', 'bright');
  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`, 'red');
    process.exit(1);
  } finally {
    closeRL();
  }
}

main();
