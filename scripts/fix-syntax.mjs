/**
 * 修复语法错误
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

  // 修复错误的 } 结尾：将 "] }," 改为 "],"
  content = content.replace(/\] \},/g, '],');

  // 修复错误的 } 结尾：将 ") }," 改为 "),"
  content = content.replace(/\) \},/g, '),');

  // 修复错误的 } 结尾：将 "'] }," 改为 "'],"
  content = content.replace(/'(\w+)'] \},/g, "'$1'],");

  // 修复错误的 } 结尾：将 "} }," 改为 "},"
  content = content.replace(/\} \},/g, '},');

  writeFileSync(featurePath, content, 'utf-8');
  console.log(`✅ ${feature} 修复完成`);
}

console.log('\n所有语法错误修复完成！');
