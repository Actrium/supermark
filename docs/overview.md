# 概览：supramark 作为集成 / 封装库

supramark 的定位不是「重新实现一个 Markdown 引擎」，而是：

- 在 **解析层**，封装现有生态（优先考虑 remark/unified 体系），提供统一的 AST 与插件系统；
- 在 React Native 场景下，提供一个基于 markdown-it 的解析实现作为 fallback，避免对 Metro 做过重的改造；
- 在 **渲染层 (React Native)**，提供一套可扩展的组件映射与插件渲染机制；
- 在 **图表层**，通过单个隐藏 WebView 或服务端预渲染整合各类浏览器型图表库。

当前分层设计（草案）：

- `@supramark/core`
  - 定义 AST 与 `Plugin` 接口；
  - 在 Node/Web 侧封装 unified/remark 解析器（计划中的主线实现），在 RN 侧使用 markdown-it 解析，二者都映射到同一套 supramark AST；
  - 对外只暴露统一 AST 与插件体系，解析引擎可插拔；
  - 提供「语法插件」：GFM、math、diagram、admonition 等。
- `@supramark/rn`
  - 提供 `<Supramark />` 组件，把 supramark AST 渲染为 React Native 组件树；
  - 提供各插件对应的默认渲染器（可覆盖）。
- `@supramark/rn-diagram-worker`
  - 单 WebView headless 渲染 worker，由库内部自行创建和管理隐藏 WebView；
  - 对外暴露 `render({ engine, code }) => Promise<{ format, payload }>`，推荐输出 SVG；
  - 在 RN 中通常通过 `<DiagramRenderProvider>` 注入渲染服务，由 `@supramark/rn` 中的 `DiagramNode` 使用。

后续文档会在各插件说明中标明「底层依赖库」与「可替换选项」。
