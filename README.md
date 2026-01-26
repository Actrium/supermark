# Supramark

[![CI](https://github.com/supramark/supramark/actions/workflows/ci.yml/badge.svg)](https://github.com/supramark/supramark/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/supramark/supramark/branch/main/graph/badge.svg)](https://codecov.io/gh/supramark/supramark)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![API Docs](https://img.shields.io/badge/docs-API-brightgreen.svg)](https://supramark.github.io/supramark/api/)

一个面向 React Native / 小程序宿主的 Markdown 扩展与图表渲染**集成 / 封装库**。

核心目标：

- 把常见的 Markdown 扩展（GFM、数学公式、Mermaid 等）整合成统一的「解析 + 渲染」能力；
- 在宿主 App 中以内置插件的方式提供能力，小程序 / 会话只通过配置声明需要的 feature；
- 对于 Mermaid / PlantUML / Vega 等重依赖浏览器环境的图表，使用「单 WebView 后台渲染 + 前台 SVG/图片展示」的模式，避免到处堆 WebView。

## 项目结构

- `packages/core` （npm: `@supramark/core`）  
  - 定义 supramark 的 AST、插件接口与基础解析管线；  
  - 设计上与 remark 的 mdast 结构尽量对齐，用于在 Node/Web 侧集成 unified/remark 生态；  
  - 同时提供一个面向 RN 的 markdown-it 解析实现，作为在 React Native 环境下的默认实现（无需额外 bundler hack）。
- `packages/rn` （npm: `@supramark/rn`）  
  - React Native 渲染层：把 supramark AST 映射为 RN 组件树，内置对基础 Markdown / Math / 脚注 / 定义列表 / Admonition / Emoji / 各类 diagram 等的默认渲染。  
- `packages/rn-diagram-worker` （npm: `@supramark/rn-diagram-worker`）  
  - 使用单个隐藏 WebView 的图表渲染服务（headless WebView worker），统一为 Mermaid / PlantUML / Vega 等提供渲染能力，并以 Promise 形式返回 SVG/PNG 结果。

其它目录：

- `packages/features/*/feature-*`：基于 Feature Interface 的扩展能力包（Math / Footnote / Definition List / Admonition / Emoji / GFM / Core Markdown 等），按语法家族（main/container/fence）分组存放；
- `examples/react-native`：React Native 示例应用，「目录 + 示例详情」结构；
- `examples/react-web` / `examples/react-web-csr`：React Web 示例（SSR + CSR），演示 `<Supramark />` 与 diagram / math 等能力。

## 文档

Supramark 提供完整的文档网站，包括用户指南、Feature 列表和 API 参考：

```bash
# 启动文档开发服务器
cd docs
npm install
npm run docs:dev
# 访问 http://localhost:5173/supramark/ (端口可能自动变更)

# 构建文档站点
npm run docs:build
```

文档网站特性：
- **自动生成的 Feature 文档**：从源代码的 `documentation.api` 字段自动提取
- **TypeDoc API 参考**：完整的类型定义和 API 文档
- **VitePress 驱动**：现代化的文档站点，支持搜索和导航

更多设计说明和各插件介绍见 `docs/` 目录。

## Headless WebView 图表渲染方案（概要）

- 宿主 App 内由 `@supramark/rn-diagram-worker` 自行创建并管理一个隐藏的 WebView，作为「图表渲染引擎」（worker）。  
- RN 端通过 `DiagramRenderProvider` + `useDiagramRender()` 提供 `render({ engine, code }) => Promise<{ format, payload }>` 的服务；  
- WebView 内统一接收请求（`engine` + `code`），调用各自的 JS 库（Mermaid / Vega 等）生成 **SVG 为主** 的渲染结果（必要时可降级为 PNG），再通过 `postMessage` 回传；  
- 前台 supramark-RN 组件只负责展示结果（例如用 `react-native-svg` 渲染 SVG，或 `<Image />` 展示 base64 PNG），完全不关心 WebView 细节和具体图表引擎。

当前仓库只包含基础骨架与接口草案，具体渲染实现和示例将在后续迭代。
> 说明：当前仓库已包含核心解析 / 渲染管线，以及 RN / Web 示例应用，  
> 仍然在持续演进中，但已经可以在真实项目中试验集成。

## Feature 质量保障体系

Supramark 建立了完整的三层质量保障体系，确保每个 Feature 的质量和一致性：

### 第一层：TypeScript 类型系统
- **强化的类型定义**：严格的 `FeatureMetadata`、`ASTNodeDefinition`、`NodeInterface` 类型
- **编译时检查**：IDE 即时反馈，零运行时开销
- **文档化的规范**：每个字段都有详细的注释和示例

### 第二层：运行时验证
- **validateFeature 函数**：14+ 条验证规则，涵盖 Critical/Warning/Info 三个级别
- **多种模式**：基本模式、严格模式、生产模式
- **详细错误信息**：结构化的错误报告（code + message + severity）

### 第三层：静态检查与 CI
- **Feature Linter**：静态分析工具，检查代码质量和文件结构
- **质量评分**：100 分制评分系统
- **GitHub Actions CI**：自动化检查（类型检查 + Linter + 测试 + 覆盖率）

使用指南：
```bash
# 本地检查
npm run lint:features              # 检查所有 Features
npm run lint:features <name>       # 检查特定 Feature
npm run lint:features:strict       # 严格模式

# 运行时验证
import { validateFeature } from '@supramark/core';
const result = validateFeature(myFeature, { production: true });
```

详细文档：
- [Feature 质量保障体系](./docs/FEATURE_QUALITY_ASSURANCE.md)
- [Feature Interface 强化说明](./docs/FEATURE_INTERFACE_ENHANCEMENT.md)

## TODO 规划

短期（0.1.x）：

- [x] 在 `@supramark/core` 中接入 Markdown 解析引擎（Node/Web 侧预留 unified/remark 管线，RN 侧提供 markdown-it 实现），并打通插件机制；
- [x] 在 AST 中正式建模 diagram 节点（Mermaid / PlantUML / Vega 等），并提供解析与占位渲染示例；
- [x] 在 `@supramark/rn` 中实现基础的 markdown 渲染（段落、标题、列表、代码块等）；
- [x] 在 `@supramark/rn-diagram-worker` 中接入 Mermaid 的实际渲染逻辑（通过单 WebView worker 返回 SVG 字符串），为未来更多图表引擎预留扩展点；
- [x] 创建一个 React Native 演示程序（examples/react-native，实际可运行的 native App），接入 supramark 的当前能力，用「目录 + 示例详情」的方式演示多种语法与插件；
- [x] 在 `docs/` 中为 RN 示例工程单独写一篇使用说明（`docs/examples/native-demo.md`，说明如何运行、如何切换不同插件示例）；
- [x] 为 React Native 和 React Web 示例创建使用说明文档（`docs/examples/native-demo.md` 和 `docs/examples/react-web-demo.md`）；
- [x] 统一两个示例项目的交互结构，均采用「目录 + 示例详情」的两页布局；
- [x] 创建示例数据聚合（`examples/demos.js` 和 `demos.mjs`），从各个 Feature 包中导入示例数据，供所有示例项目使用。 

中期：

- [x] 支持更多图表引擎（Mermaid / PlantUML / Vega‑Lite / ECharts；DOT / Graphviz 目前为占位解析），并通过配置决定是否启用；
- [x] 支持 LaTeX 数学公式（行内 `$...$` / 块级 `$$...$$`），集成 KaTeX（Web）与 MathJax（RN headless WebView）实现 SVG 渲染；
- [x] 支持脚注语法（`[^1]`），在 AST 中建模脚注及回引结构，并在 RN / Web 中提供默认渲染；
- [x] 支持定义列表（术语解释），在 AST 中增加 definition-list 相关节点，并在示例中展示用法；
- [x] 支持提示 / 注意 / 警告等容器块（admonition/callout），统一语法并在 RN / Web 中给出默认样式；
- [x] 支持 Emoji / 短代码（如 `:smile:` / `:rocket:`），通过 markdown-it-emoji 在 `text.value` 中直接生成 Unicode；
- [ ] 设计「平台 + 小程序」的 feature 注册表、权限控制与配置格式；
- [ ] 提供一套推荐的 supramark 插件预设（文档型、数据可视化型等）。
- [x] 在 Node/Web 侧提供 React Web 示例（`examples/react-web` / `examples/react-web-csr`），演示在 React 应用中直接使用 `<Supramark />` 组件渲染 Markdown。

长期：

- [ ] 增强渲染性能（图表结果缓存、虚拟列表、延迟加载等）；
- [ ] 兼容 Web / Node 使用场景（在浏览器或 SSR 中也可复用 `@supramark/core` + 插件体系）；
- [ ] 输出更完整的文档与最佳实践。
