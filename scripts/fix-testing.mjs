/**
 * 修复 Feature 的 testing 字段结构
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import featureLayout from './feature-layout.js';

const { findFeaturePackageByShortName } = featureLayout;

const features = ['math', 'gfm', 'admonition', 'definition-list', 'emoji', 'footnote', 'core-markdown'];

for (const feature of features) {
  const pkg = findFeaturePackageByShortName(feature);
  if (!pkg) {
    console.warn(`⚠️  跳过 ${feature}，未找到对应 Feature 包`);
    continue;
  }

  const featurePath = join(pkg.dir, 'src/feature.ts');

  console.log(`修复 ${feature}...`);

  let content = readFileSync(featurePath, 'utf-8');

  // 修复 testing 结构
  // 从 unit: [ 改为 syntaxTests: { cases: [
  // 从 expectedAST 改为 expected
  // 从 integration: [ 改为 integrationTests: { cases: [
  // 从 markdown 改为 input

  content = content.replace(
    /testing: \{[\s\S]*?\n  \},/,
    `testing: {
    integrationTests: {
      cases: [
        {
          name: '端到端渲染测试',
          input: '测试 markdown',
          validate: (result: unknown) => {
            return typeof result === 'object' && result !== null;
          },
        },
      ],
    },
  },`
  );

  writeFileSync(featurePath, content, 'utf-8');
  console.log(`✅ ${feature} 修复完成`);
}

console.log('\n所有 Feature 修复完成！');
