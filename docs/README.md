# Supramark 项目文档

欢迎查阅 Supramark 项目手册。本项目采用 **"文档即代码"** 的原则，核心文档会随源码自动更新。

## 📖 快速导航

### 🛠️ 开发指南

- [如何创建新 Feature](./guide/CREATE_FEATURE_GUIDE.md)
- [质量保障体系](./guide/FEATURE_QUALITY_ASSURANCE.md)
- [CI 配置说明](./guide/CI_SETUP.md)

### 🏗️ 架构设计

- [项目结构报告](./architecture/PROJECT_STRUCTURE_REPORT.md)
- [插件系统设计](./architecture/PLUGIN_SYSTEM.md)
- [文档自动化架构](./architecture/DOCUMENTATION_ARCHITECTURE.md)

### 📚 自动生成参考 (运行 `npm run features:sync` 更新)

- [Feature 插件列表](./features/index.md)
- [API 核心接口](./api/core.md)
- [示例项目说明](./examples/index.md)

---

## 🔄 文档同步逻辑

本项目不再依赖任何静态网站生成器（如 VitePress）。

- **修改代码后**：只需运行 `npm run features:sync`。
- **效果**：系统会自动提取源码中的 `JSDoc` 和 `metadata`，刷新 `docs/features/` 和 `docs/api/` 下的 Markdown 文件。
- **阅读方式**：直接在 GitHub 或 IDE 中查看即可。
