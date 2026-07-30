# Supramark 文档系统架构

## 概览

Supramark 采用三层文档架构，结合自动生成和手动维护，确保文档的完整性和一致性。

## 文档层次

### 第一层：TypeDoc 技术文档

- **目标用户**：需要深入了解类型系统的开发者
- **生成方式**：从 `@supramark/core` 的 TypeScript 源代码自动生成
- **内容**：完整的类型定义、接口、函数签名
- **位置**：`packages/core/docs/api` → 复制到 `docs/public/typedoc`
- **访问方式**：通过文档网站的 `/typedoc/` 路径

**生成命令**：

```bash
cd packages/core
npm run docs  # 生成 TypeDoc HTML
```

### 第二层：Feature 自动文档

- **目标用户**：使用 Supramark Features 的开发者
- **生成方式**：从各 Feature 包的 `src/feature.ts` 中的 `documentation.api` 字段提取
- **内容**：
  - Feature 元信息（name, description）
  - README 介绍
  - API 参考（functions, interfaces）
  - 最佳实践
  - 常见问题（FAQ）
- **位置**：`docs/features/*.md`（自动生成）
- **生成脚本**：`scripts/generate-feature-docs.mjs`

**生成命令**：

```bash
npm run docs:generate
```

**当前支持的 Features**：

- core-markdown - 标准 Markdown 语法
- gfm - GitHub Flavored Markdown
- math - LaTeX 数学公式
- admonition - 提示框组件
- definition-list - 定义列表
- emoji - Emoji 短代码
- footnote - 脚注支持

### 第三层：手动维护的指南

- **目标用户**：所有用户（从新手到高级开发者）
- **维护方式**：手动编写 Markdown 文件
- **内容**：
  - 快速开始指南
  - 核心概念
  - 架构设计
  - API 参考索引
  - 示例和教程
- **位置**：`docs/guide/`, `docs/api/`, `docs/index.md`

## 文档网站技术栈

### VitePress

- 现代化的 Vue 驱动静态站点生成器
- 支持本地搜索
- 响应式设计
- 自定义主题和布局

### 配置文件

- **主配置**：`docs/.vitepress/config.mts`
  - 站点元信息
  - 导航菜单
  - 侧边栏结构
  - 搜索配置
- **包配置**：`docs/package.json`
  - 依赖管理
  - 构建脚本

## 文档构建流程

### 完整构建

```bash
cd docs
npm run docs:build
```

**流程**：

1. 运行 `docs:generate`
   - 执行 `scripts/generate-feature-docs.mjs`
   - 生成所有 Feature 文档到 `docs/features/`
   - 执行 `docs:copy-typedoc`
   - 复制 `packages/core/docs/api` 到 `docs/public/typedoc`
2. 运行 VitePress 构建
   - 解析所有 Markdown 文件
   - 生成静态 HTML
   - 优化资源文件
   - 输出到 `docs/.vitepress/dist`

### 开发模式

```bash
cd docs
npm run docs:dev
```

- 启动本地开发服务器（默认 http://localhost:5173）
- 热重载（Markdown 文件修改即时更新）
- 不包含自动生成步骤（需手动运行 `docs:generate`）

### 预览构建结果

```bash
cd docs
npm run docs:preview
```

- 预览生产构建结果
- 本地静态服务器
- 用于部署前测试

## 文档更新工作流

### 更新 Feature 文档

1. 修改 `packages/features/*/feature-*/src/feature.ts` 中的 `documentation.api` 字段
2. 运行 `npm run docs:generate`
3. 检查生成的 `docs/features/*.md` 文件
4. 提交变更

### 更新 TypeDoc

1. 修改 `packages/core/src` 中的源代码注释
2. 运行 `cd packages/core && npm run docs`
3. 运行 `cd docs && npm run docs:copy-typedoc`
4. 提交变更

### 更新手动文档

1. 直接编辑 `docs/guide/`, `docs/api/` 等目录下的 Markdown 文件
2. 运行 `npm run docs:dev` 预览
3. 提交变更

### 添加新页面

1. 创建新的 `.md` 文件
2. 在 `docs/.vitepress/config.mts` 中添加导航/侧边栏链接
3. 重启开发服务器

## 文档质量保障

### 自动生成的好处

- **一致性**：所有 Feature 文档遵循统一格式
- **同步性**：文档与源代码保持同步
- **完整性**：强制提供必要的文档字段
- **减少维护**：减少手动维护负担

### 质量检查点

- TypeScript 编译时类型检查（确保 `documentation.api` 字段符合规范）
- Feature Linter 静态检查（`npm run lint:features`）
- CI/CD 自动化检查（GitHub Actions）

## 部署

### 构建产物

- 位置：`docs/.vitepress/dist`
- 格式：静态 HTML + CSS + JS
- 大小：通常 < 10MB

### 部署选项

- **Netlify / Vercel**：支持持续部署
- **自托管**：任何静态文件服务器

### 部署配置

- Base URL：`/supramark/` (在 `config.mts` 中配置)
- 资源路径：相对路径，支持任意子路径部署

## 维护建议

### 日常维护

- 定期运行 `docs:generate` 确保 Feature 文档最新
- 审查自动生成的文档，完善 `documentation.api` 字段
- 及时更新手动文档，反映新功能和变更

### 新增 Feature 时

1. 在 Feature 的 `src/feature.ts` 中完善 `documentation.api` 字段
2. 在 `scripts/generate-feature-docs.mjs` 的 `FEATURES` 数组中添加 Feature 名称
3. 运行 `npm run docs:generate` 生成文档
4. 在 `docs/features/index.md` 中添加描述（如需定制）

### 文档最佳实践

- **Feature 文档**：关注 API 使用和配置
- **指南文档**：关注概念和工作流
- **TypeDoc**：关注技术细节和类型定义
- 使用代码示例说明用法
- 提供常见问题和最佳实践
- 保持文档简洁明了

## 故障排查

### Feature 文档生成失败

- 检查 `src/feature.ts` 中的 `documentation.api` 字段格式
- 运行 `npm run lint:features` 检查 Feature 质量
- 查看生成脚本的错误输出

### TypeDoc 未更新

- 确保运行了 `cd packages/core && npm run docs`
- 检查 `packages/core/docs/api` 目录是否存在
- 确保运行了 `npm run docs:copy-typedoc`

### VitePress 构建错误

- 检查 Markdown 语法
- 检查链接是否有效
- 运行 `npm run docs:dev` 查看详细错误信息

## 未来规划

- [ ] 添加多语言支持（i18n）
- [ ] 集成 API 示例的交互式运行环境
- [ ] 添加更多自动化测试（链接检查、示例代码验证）
- [ ] 改进搜索功能（Algolia DocSearch）
- [ ] 添加版本管理（多版本文档支持）
