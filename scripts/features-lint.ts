#!/usr/bin/env tsx
/**
 * features:lint - 检查所有 Features + 全局唯一性
 *
 * 用法：bun run features:lint
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { discoverFeaturePackages, type FeaturePackageInfo } from './lib-feature-layout.ts';

// ============================================================================
// 颜色输出
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function log(msg: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// ============================================================================
// ContainerNames 提取与唯一性检查
// ============================================================================

/**
 * 从 feature.ts 源码中提取 containerNames
 */
function extractContainerNames(sourceCode: string): string[] {
  // 优先匹配 XXX_CONTAINER_NAMES = ['a', 'b'] as const（唯一事实来源）
  const constPattern = /\w+_CONTAINER_NAMES\s*=\s*\[([^\]]+)\]\s*as\s*const/;
  const constMatch = sourceCode.match(constPattern);
  if (constMatch) {
    const content = constMatch[1];
    const names = content
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(s => s.length > 0);
    if (names.length > 0) return names;
  }

  // 备选：匹配直接的 containerNames: ['a', 'b']（不含 spread）
  const directPattern = /containerNames:\s*\[([^\]]+)\]/;
  const directMatch = sourceCode.match(directPattern);
  if (directMatch) {
    const content = directMatch[1];
    // 跳过 spread 语法（...XXX）
    if (content.includes('...')) return [];
    const names = content
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(s => s.length > 0);
    return names;
  }

  return [];
}

/**
 * 检查所有 features 的 containerNames 全局唯一性
 */
function checkContainerNamesUniqueness(features: FeaturePackageInfo[]): {
  passed: boolean;
  conflicts: Map<string, string[]>;
  featureContainers: Map<string, string[]>;
} {
  const containerNameMap = new Map<string, string[]>();
  const featureContainers = new Map<string, string[]>();

  for (const feature of features) {
    const featureFile = path.join(feature.dir, 'src/feature.ts');
    if (!fs.existsSync(featureFile)) continue;

    const sourceCode = fs.readFileSync(featureFile, 'utf-8');
    const containerNames = extractContainerNames(sourceCode);

    if (containerNames.length > 0) {
      featureContainers.set(feature.shortName, containerNames);
    }

    for (const name of containerNames) {
      const existing = containerNameMap.get(name) || [];
      existing.push(feature.shortName);
      containerNameMap.set(name, existing);
    }
  }

  const conflicts = new Map<string, string[]>();
  for (const [name, featureList] of containerNameMap) {
    if (featureList.length > 1) {
      conflicts.set(name, featureList);
    }
  }

  return {
    passed: conflicts.size === 0,
    conflicts,
    featureContainers,
  };
}

// ============================================================================
// 单个 Feature Lint（简化版，只检查关键项）
// ============================================================================

interface LintResult {
  name: string;
  kind: FeatureKind;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function lintFeature(feature: FeaturePackageInfo): LintResult {
  const kind = detectFeatureKind(feature);
  const result: LintResult = {
    name: feature.shortName,
    kind,
    passed: true,
    errors: [],
    warnings: [],
  };

  const featureFile = path.join(feature.dir, 'src/feature.ts');

  // ========== 通用检查（所有类型） ==========

  // 检查 feature.ts 存在
  if (!fs.existsSync(featureFile)) {
    result.errors.push('缺少 src/feature.ts');
    result.passed = false;
    return result;
  }

  const sourceCode = fs.readFileSync(featureFile, 'utf-8');

  // 检查 examples.ts 存在
  const examplesFile = path.join(feature.dir, 'src/examples.ts');
  if (!fs.existsSync(examplesFile)) {
    result.warnings.push('缺少 src/examples.ts');
  }

  // 检查 README.md 存在
  const readmeFile = path.join(feature.dir, 'README.md');
  if (!fs.existsSync(readmeFile)) {
    result.warnings.push('缺少 README.md');
  }

  // ========== Container 类型专属检查 ==========
  if (kind === 'container') {
    // 必须有 registerParser
    if (!sourceCode.includes('registerParser:') && !sourceCode.includes('registerParser()')) {
      result.errors.push('ContainerFeature 缺少 registerParser');
      result.passed = false;
    }

    // 检查必填字段
    const requiredFields = ['id:', 'name:', 'version:', 'containerNames:'];
    for (const field of requiredFields) {
      if (!sourceCode.includes(field)) {
        result.errors.push(`缺少必填字段: ${field.replace(':', '')}`);
        result.passed = false;
      }
    }

    // Container 类型必须有渲染器
    const webRenderer = path.join(feature.dir, 'src/runtime.web.tsx');
    const rnRenderer = path.join(feature.dir, 'src/runtime.rn.tsx');

    if (!fs.existsSync(webRenderer)) {
      result.errors.push('Container 类型必须有 runtime.web.tsx');
      result.passed = false;
    }
    if (!fs.existsSync(rnRenderer)) {
      result.errors.push('Container 类型必须有 runtime.rn.tsx');
      result.passed = false;
    }
  }

  // ========== Input 类型专属检查 ==========
  if (kind === 'input') {
    // 检查必填字段
    const requiredFields = ['id:', 'name:', 'version:', 'inputNames:'];
    for (const field of requiredFields) {
      if (!sourceCode.includes(field)) {
        result.errors.push(`缺少必填字段: ${field.replace(':', '')}`);
        result.passed = false;
      }
    }

    // Input 类型必须有渲染器
    const webRenderer = path.join(feature.dir, 'src/runtime.web.tsx');
    const rnRenderer = path.join(feature.dir, 'src/runtime.rn.tsx');

    if (!fs.existsSync(webRenderer)) {
      result.errors.push('Input 类型必须有 runtime.web.tsx');
      result.passed = false;
    }
    if (!fs.existsSync(rnRenderer)) {
      result.errors.push('Input 类型必须有 runtime.rn.tsx');
      result.passed = false;
    }
  }

  // ========== Basic 类型检查 ==========
  if (kind === 'basic') {
    // 旧结构检查 metadata
    if (!sourceCode.includes('metadata:')) {
      result.warnings.push('建议迁移到新的 Feature 接口');
    }
  }

  return result;
}

// ============================================================================
// Main
// ============================================================================

/**
 * Feature 类型
 */
type FeatureKind = 'container' | 'input' | 'basic';

/**
 * 检测 feature 的类型
 */
function detectFeatureKind(feature: FeaturePackageInfo): FeatureKind {
  const featureFile = path.join(feature.dir, 'src/feature.ts');
  if (!fs.existsSync(featureFile)) return 'basic';

  const sourceCode = fs.readFileSync(featureFile, 'utf-8');

  if (sourceCode.includes('containerNames:') || sourceCode.includes('CONTAINER_NAMES')) {
    return 'container';
  }
  if (sourceCode.includes('inputNames:') || sourceCode.includes('INPUT_NAMES')) {
    return 'input';
  }

  return 'basic';
}

async function main(): Promise<void> {
  log('\n🔍 Supramark Features Lint\n', 'bright');

  const allFeatures = discoverFeaturePackages();

  if (allFeatures.length === 0) {
    log('未找到任何 Feature 包\n', 'yellow');
    process.exit(1);
  }

  log(`找到 ${allFeatures.length} 个 Feature 包\n`, 'gray');

  // 1. Lint 每个 feature
  const results: LintResult[] = [];
  let allPassed = true;

  for (const feature of allFeatures) {
    const result = lintFeature(feature);
    results.push(result);
    if (!result.passed) allPassed = false;
  }

  // 按类型分组输出
  const kindLabels: Record<FeatureKind, string> = {
    container: 'Container',
    input: 'Input',
    basic: 'Basic',
  };

  for (const kind of ['container', 'input', 'basic'] as FeatureKind[]) {
    const kindResults = results.filter(r => r.kind === kind);
    if (kindResults.length === 0) continue;

    log(`\n[${kindLabels[kind]}] (${kindResults.length})`, 'blue');
    log('─'.repeat(60), 'gray');

    for (const result of kindResults) {
      const status = result.passed ? '✓' : '✗';
      const color = result.passed ? 'green' : 'red';
      log(`  ${status} ${result.name}`, color);

      for (const error of result.errors) {
        log(`      ❌ ${error}`, 'red');
      }
      for (const warning of result.warnings) {
        log(`      ⚠️  ${warning}`, 'yellow');
      }
    }
  }

  // 2. 检查 containerNames 全局唯一性（只针对 Container 类型）
  const containerFeatures = allFeatures.filter(f => detectFeatureKind(f) === 'container');

  if (containerFeatures.length > 0) {
    log('\n检查 containerNames 全局唯一性...\n', 'blue');

    const { passed: uniquenessPassed, conflicts, featureContainers } =
      checkContainerNamesUniqueness(containerFeatures);

    // 显示每个 feature 注册的 containerNames
    for (const [featureName, containers] of featureContainers) {
      log(`  ${featureName}: ${containers.join(', ')}`, 'gray');
    }

    log('');

    if (uniquenessPassed) {
      log('  ✓ 所有 containerNames 全局唯一\n', 'green');
    } else {
      allPassed = false;
      log('  ❌ containerNames 冲突检测到：\n', 'red');
      for (const [name, features] of conflicts) {
        log(`     "${name}" 被多个 Feature 使用: ${features.join(', ')}`, 'red');
      }
      log('');
    }
  }

  // 3. 总结
  log('═'.repeat(60), 'blue');
  const passedCount = results.filter(r => r.passed).length;
  log(`结果: ${passedCount}/${results.length} Features 通过`, allPassed ? 'green' : 'yellow');

  if (allPassed) {
    log('✅ 所有检查通过！', 'green');
  } else {
    log('❌ 存在检查失败项', 'red');
  }
  log('═'.repeat(60) + '\n', 'blue');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
