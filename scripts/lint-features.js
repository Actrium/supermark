#!/usr/bin/env node

/**
 * Supramark Feature Linter
 *
 * 检查所有 Feature 包的：
 * - 类型定义完整性
 * - 接口实现正确性
 * - 代码质量
 * - 文档完整性
 * - 测试覆盖率
 *
 * 用途：
 * - 开发时检查 Feature 质量
 * - CI/CD 中自动验证
 * - 强制统一规范
 *
 * 用法：
 *   npm run lint:features
 *   npm run lint:features <feature-name>
 *   npm run lint:features -- --strict
 */

const fs = require('fs');
const path = require('path');
const { discoverFeaturePackages } = require('./feature-layout');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================================================
// 检查规则定义
// ============================================================================

const RULES = {
  // 元数据规则（Critical）
  'metadata-id-format': {
    severity: 'error',
    message: 'Feature ID 必须符合 @scope/feature-name 格式',
    check: (feature) => /^@[\w-]+\/feature-[\w-]+$/.test(feature.metadata?.id),
  },
  'metadata-version-semver': {
    severity: 'error',
    message: '版本号必须符合语义化版本格式（x.y.z）',
    check: (feature) => /^\d+\.\d+\.\d+$/.test(feature.metadata?.version),
  },
  'metadata-name-required': {
    severity: 'error',
    message: 'Feature name 不能为空',
    check: (feature) => feature.metadata?.name && feature.metadata.name.length > 0,
  },
  'metadata-description-required': {
    severity: 'warning',
    message: 'Feature description 不能为空',
    check: (feature) => feature.metadata?.description && feature.metadata.description.length > 0,
  },
  'metadata-license-required': {
    severity: 'warning',
    message: 'Feature license 应该设置为 Apache-2.0',
    check: (feature) => feature.metadata?.license === 'Apache-2.0',
  },
  'metadata-tags-nonempty': {
    severity: 'info',
    message: 'Feature tags 建议添加至少一个标签',
    check: (feature) => Array.isArray(feature.metadata?.tags) && feature.metadata.tags.length > 0,
  },

  // AST 定义规则（Critical）
  'ast-type-required': {
    severity: 'error',
    message: 'AST 节点 type 必须定义',
    check: (feature) => feature.syntax?.ast?.type && feature.syntax.ast.type.length > 0,
  },
  'ast-interface-required-nonempty': {
    severity: 'warning',
    strictSeverity: 'error',
    message: 'AST interface.required 不应只包含 type',
    check: (feature) => {
      const required = feature.syntax?.ast?.interface?.required;
      // 如果 Feature 使用了 selector（虚拟节点），允许只有 type
      if (feature.syntax?.ast?.hasSelector) {
        return true;
      }
      return Array.isArray(required) && required.length > 1;
    },
  },
  'ast-interface-fields-defined': {
    severity: 'warning',
    message: 'AST interface.fields 应该定义所有 required 字段',
    check: (feature) => {
      const required = feature.syntax?.ast?.interface?.required || [];
      const fields = feature.syntax?.ast?.interface?.fields || {};
      return required.every((field) => field in fields);
    },
  },
  'ast-examples-provided': {
    severity: 'info',
    strictSeverity: 'error',
    message: 'AST examples 应该提供至少一个示例节点',
    check: (feature) => {
      const examples = feature.syntax?.ast?.examples;
      return Array.isArray(examples) && examples.length > 0;
    },
  },

  // 选择器规则
  'selector-multi-node-with-function': {
    severity: 'warning',
    message: '如果 Feature 处理多节点类型，应该提供 selector 函数',
    check: (feature) => {
      const multiNodeNote = feature.syntax?.ast?.multiNodeNote;
      const selector = feature.syntax?.ast?.selector;
      // 如果有多节点提示，应该有 selector
      if (multiNodeNote) {
        return typeof selector === 'function';
      }
      return true;
    },
  },

  // 文档规则
  'documentation-markdown-example': {
    severity: 'warning',
    strictSeverity: 'error',
    message: 'Feature 应该在注释中提供 Markdown 使用示例',
    check: (feature, context) => {
      // 检查源码注释是否包含 @example
      if (context?.sourceCode) {
        return context.sourceCode.includes('@example') && context.sourceCode.includes('```markdown');
      }
      return true; // 无法检查则跳过
    },
  },

  // 测试规则
  'testing-file-exists': {
    severity: 'error',
    message: 'Feature 必须有测试文件',
    check: (feature, context) => {
      if (context?.packagePath) {
        const testFile = path.join(context.packagePath, '__tests__/feature.test.ts');
        return fs.existsSync(testFile);
      }
      return true;
    },
  },

  // 包结构规则
  'package-structure-complete': {
    severity: 'error',
    message: 'Feature 包必须包含所有必需文件',
    check: (feature, context) => {
      if (!context?.packagePath) return true;

      const required = [
        'package.json',
        'tsconfig.json',
        'jest.config.cjs',
        'src/index.ts',
        'src/feature.ts',
        '__tests__/feature.test.ts',
        'README.md',
      ];

      return required.every((file) => {
        const fullPath = path.join(context.packagePath, file);
        return fs.existsSync(fullPath);
      });
    },
  },
};

// ============================================================================
// 检查执行器
// ============================================================================

class FeatureLinter {
  constructor(options = {}) {
    this.strict = options.strict || false;
    this.results = {
      passed: [],
      failed: [],
      warnings: [],
      info: [],
    };
  }

  /**
   * 检查单个 Feature
   */
  async lintFeature(featurePath) {
    log(`\n检查 Feature: ${path.basename(featurePath)}`, 'blue');
    log('─'.repeat(60), 'gray');

    const context = {
      packagePath: featurePath,
    };

    // 1. 读取 Feature 定义
    const featureFile = path.join(featurePath, 'src/feature.ts');
    if (!fs.existsSync(featureFile)) {
      this.results.failed.push({
        rule: 'feature-file-exists',
        message: 'src/feature.ts 文件不存在',
        severity: 'error',
        path: featurePath,
      });
      log('  ❌ src/feature.ts 不存在', 'red');
      return;
    }

    // 读取源码（用于某些检查）
    const sourceCode = fs.readFileSync(featureFile, 'utf-8');
    context.sourceCode = sourceCode;

    // 2. 解析 Feature 对象（简单的正则提取，不做完整 AST 解析）
    const feature = this.extractFeatureFromSource(sourceCode);

    // 3. 运行所有检查规则
    for (const [ruleName, rule] of Object.entries(RULES)) {
      try {
        const passed = rule.check(feature, context);

        const effectiveSeverity =
          this.strict && rule.strictSeverity ? rule.strictSeverity : rule.severity;

        const result = {
          rule: ruleName,
          message: rule.message,
          severity: effectiveSeverity,
          path: featurePath,
        };

        if (!passed) {
          if (effectiveSeverity === 'error') {
            this.results.failed.push(result);
            log(`  ❌ ${rule.message}`, 'red');
          } else if (effectiveSeverity === 'warning') {
            this.results.warnings.push(result);
            log(`  ⚠️  ${rule.message}`, 'yellow');
          } else {
            this.results.info.push(result);
            log(`  💡 ${rule.message}`, 'blue');
          }
        } else {
          this.results.passed.push(result);
        }
      } catch (error) {
        log(`  ⚠️  规则 ${ruleName} 执行失败: ${error.message}`, 'yellow');
      }
    }
  }

  /**
   * 从源码中提取 Feature 对象（简化版）
   */
  extractFeatureFromSource(sourceCode) {
    const feature = {
      metadata: {},
      syntax: { ast: { interface: {} } },
    };

    // 提取 metadata
    const metadataMatch = sourceCode.match(/metadata:\s*{([^}]+)}/s);
    if (metadataMatch) {
      const metadataStr = metadataMatch[1];

      // 提取 id
      const idMatch = metadataStr.match(/id:\s*['"]([^'"]+)['"]/);
      if (idMatch) feature.metadata.id = idMatch[1];

      // 提取 name
      const nameMatch = metadataStr.match(/name:\s*['"]([^'"]+)['"]/);
      if (nameMatch) feature.metadata.name = nameMatch[1];

      // 提取 version
      const versionMatch = metadataStr.match(/version:\s*['"]([^'"]+)['"]/);
      if (versionMatch) feature.metadata.version = versionMatch[1];

      // 提取 description
      const descMatch = metadataStr.match(/description:\s*['"]([^'"]+)['"]/);
      if (descMatch) feature.metadata.description = descMatch[1];

      // 提取 license
      const licenseMatch = metadataStr.match(/license:\s*['"]([^'"]+)['"]/);
      if (licenseMatch) feature.metadata.license = licenseMatch[1];

      // 提取 tags
      const tagsMatch = metadataStr.match(/tags:\s*\[([^\]]*)\]/);
      if (tagsMatch) {
        const tagsStr = tagsMatch[1].trim();
        feature.metadata.tags = tagsStr ? tagsStr.split(',').map((t) => t.trim().replace(/['"]/g, '')) : [];
      }
    }

    // 提取 AST type
    const astTypeMatch = sourceCode.match(/ast:\s*{[^}]*type:\s*['"]([^'"]+)['"]/s);
    if (astTypeMatch) {
      feature.syntax.ast.type = astTypeMatch[1];
    }

    // 检测是否有 selector（虚拟节点）
    const selectorMatch = sourceCode.match(/selector:\s*\(/);
    if (selectorMatch) {
      feature.syntax.ast.hasSelector = true;
    }

    // 提取 required 字段
    const requiredMatch = sourceCode.match(/required:\s*\[([^\]]+)\]/);
    if (requiredMatch) {
      const requiredStr = requiredMatch[1];
      feature.syntax.ast.interface.required = requiredStr
        .split(',')
        .map((f) => f.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    }

    // 提取 fields 定义（使用括号平衡算法）
    const fieldsStartMatch = sourceCode.match(/fields:\s*{/);
    if (fieldsStartMatch) {
      const startIndex = fieldsStartMatch.index + fieldsStartMatch[0].length;
      let braceCount = 1;
      let endIndex = startIndex;

      // 括号平衡匹配
      while (braceCount > 0 && endIndex < sourceCode.length) {
        if (sourceCode[endIndex] === '{') braceCount++;
        if (sourceCode[endIndex] === '}') braceCount--;
        endIndex++;
      }

      if (braceCount === 0) {
        const fieldsStr = sourceCode.substring(startIndex, endIndex - 1);
        feature.syntax.ast.interface.fields = {};

        // 简单提取字段名（不做完整解析）
        const fieldNames = fieldsStr.match(/(\w+):\s*{/g);
        if (fieldNames) {
          fieldNames.forEach((match) => {
            const name = match.match(/(\w+):/)[1];
            feature.syntax.ast.interface.fields[name] = {};
          });
        }
      }
    }

    // 提取 examples
    const examplesMatch = sourceCode.match(/examples:\s*\[([^\]]*)\]/s);
    if (examplesMatch) {
      const examplesStr = examplesMatch[1].trim();
      feature.syntax.ast.examples = examplesStr ? [{}] : []; // 简化处理
    }

    return feature;
  }

  /**
   * 生成检查报告
   */
  generateReport() {
    log('\n' + '='.repeat(60), 'gray');
    log('Feature Lint 检查报告', 'bright');
    log('='.repeat(60), 'gray');

    const total = this.results.failed.length + this.results.warnings.length + this.results.info.length + this.results.passed.length;

    log(`\n总检查项: ${total}`, 'reset');
    log(`  ✅ 通过: ${this.results.passed.length}`, 'green');
    log(`  ❌ 错误: ${this.results.failed.length}`, this.results.failed.length > 0 ? 'red' : 'green');
    log(`  ⚠️  警告: ${this.results.warnings.length}`, this.results.warnings.length > 0 ? 'yellow' : 'green');
    log(`  💡 建议: ${this.results.info.length}`, 'blue');

    // 计算质量分数
    const score = this.calculateQualityScore();
    const scoreColor = score >= 90 ? 'green' : score >= 70 ? 'yellow' : 'red';
    log(`\n质量评分: ${score}/100`, scoreColor);

    // 判断是否通过
    const passed = this.results.failed.length === 0;
    if (this.strict) {
      return passed && this.results.warnings.length === 0;
    }
    return passed;
  }

  /**
   * 计算质量分数
   */
  calculateQualityScore() {
    const total = this.results.passed.length + this.results.failed.length + this.results.warnings.length + this.results.info.length;
    if (total === 0) return 0;

    // 错误 -10 分，警告 -5 分，建议 -2 分
    const deduction = this.results.failed.length * 10 + this.results.warnings.length * 5 + this.results.info.length * 2;

    return Math.max(0, 100 - deduction);
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  log('\n🔍 Supramark Feature Linter\n', 'bright');

  const args = process.argv.slice(2);
  const specificFeature = args.find((arg) => !arg.startsWith('--'));
  const strict = args.includes('--strict');

  const linter = new FeatureLinter({ strict });

  // 扫描 Feature 包
  const allFeatures = discoverFeaturePackages();
  const selected = specificFeature
    ? allFeatures.filter(
        (item) =>
          item.shortName === specificFeature ||
          item.name === specificFeature ||
          item.name.endsWith(`/feature-${specificFeature}`)
      )
    : allFeatures;

  if (selected.length === 0) {
    if (specificFeature) {
      log(`❌ Feature 不存在: ${specificFeature}`, 'red');
    } else {
      log('未找到任何 Feature 包', 'yellow');
    }
    process.exit(1);
  }

  log(`找到 ${selected.length} 个 Feature 包\n`, 'gray');

  // 检查每个 Feature
  for (const item of selected) {
    await linter.lintFeature(item.dir);
  }

  // 生成报告
  const passed = linter.generateReport();

  // 退出码
  process.exit(passed ? 0 : 1);
}

// 运行
main().catch((error) => {
  log(`\n❌ 错误: ${error.message}\n`, 'red');
  console.error(error.stack);
  process.exit(1);
});
