# Supermark 改动清单

## 最新增量

- RN diagram worker 已注册的浏览器型引擎统一优先走 headless WebView。
- Vega / Vega-Lite 已接入 headless WebView，本地在 WebView 内完成编译与 SVG 渲染，不再走 Kroki 远端服务。
- DOT / Graphviz 已接入 headless WebView，本地通过 Viz.js 生成 SVG，不再走 Kroki 远端服务。

---

本次改动共 22 个文件，按类型分类如下。

---

## 一、纯 TS 类型修复（7 个文件）

改动最小，只修了类型注解，不影响运行时行为。

- `packages/core/src/feature.ts` — `PlatformRenderer` 接口新增 `platform?` 可选字段
- `packages/features/feature-core-markdown/src/feature.ts` — `output` → `(output: unknown)` ×5
- `packages/features/feature-definition-list/src/feature.ts` — `output` → `(output: unknown)` ×2
- `packages/features/feature-emoji/src/feature.ts` — `output` → `(output: unknown)` ×2
- `packages/features/feature-footnote/src/feature.ts` — `output` → `(output: unknown)` ×3
- `packages/features/feature-gfm/src/feature.ts` — `output` → `(output: unknown)` ×3
- `packages/features/feature-math/src/feature.ts` — `output` → `(output: unknown)` ×4

## 二、类型 hack — ContainerFeature 交叉类型兼容（2 个文件）

`ContainerFeature & SupramarkFeature` 交叉类型的 `selector` 参数不兼容，用 `as unknown as` 绕过。

- `packages/features/feature-admonition/src/feature.ts`
- `packages/features/feature-weather/src/feature.ts`

## 三、RN 运行时兼容 — Hermes/RN 环境缺失 API 的 polyfill（3 个文件）

- `packages/renderers/diagram-engine/src/engines/plantuml.ts`
  - 新增 `utf8Encode()` polyfill（Hermes 无 TextEncoder）
  - `deflateRaw` 从 `node:zlib` 改为 pako fallback
  - `CompressionStream.write` 修复 ArrayBuffer 兼容
- `packages/renderers/diagram-engine/src/engines/echarts.ts`
  - 新增 `resolveEchartsApi()` 处理 ESM default export 嵌套（`mod.default.default`）
  - 加运行时 API 可用性检查
- `packages/renderers/diagram-engine/src/engines/vega-lite.ts`
  - 新增 `resolveVegaApi()` / `resolveVegaLiteApi()` 同上
  - 加运行时 API 可用性检查

## 四、RN 渲染改进 — 修复渲染 bug 和优化 UX（4 个文件）

- `packages/renderers/rn/src/Supramark.tsx`
  - 列表渲染重写：支持有序列表序号、任务列表 checkbox
  - `list_item` 子节点从 `renderInlineNodes` 改为递归 `renderNode`（支持嵌套块级元素）
  - `mergedContainerRenderers` 简化（去掉从 config.features 自动提取的逻辑）
  - 定义列表和脚注的子节点也改为递归渲染
- `packages/renderers/rn/src/MathBlock.tsx`
  - 错误处理改为优雅降级：去掉 error state 和错误 UI，渲染失败时显示 TeX 源码
  - 新增 `codeBlock`/`codeText` 样式
- `packages/renderers/rn/src/DiagramNode.tsx`
  - `useDiagramRender()` 解构改为整体引用，修复 hook 引用稳定性
- `packages/renderers/rn/src/svgUtils.ts`
  - SVG 清理增强：先保留 `<text>` 节点，再清除 XML prolog/doctype/metadata/注释
  - 折叠标签间空白文本节点（react-native-svg 不支持裸字符串子节点）

## 五、Admonition RN 渲染完整实现（1 个文件）

- `packages/features/feature-admonition/src/runtime.rn.tsx`
  - 从简陋的占位实现重写为完整的 admonition 卡片
  - 5 种 kind（note/tip/info/warning/danger）各有主题色和图标
  - 新增 `normalizeNode`/`normalizeChildren` 处理 RN 不允许裸字符串子节点的问题

## 六、RN 导出补充（1 个文件）

- `packages/core/src/index.rn.ts`
  - 新增导出 `extractContainerInnerText`（container 相关）
  - 新增导出 `LRUCache`/`createCacheKey`/`simpleHash`（diagram-engine 在 RN 侧需要的缓存工具）

## 七、Web 渲染器小调整（1 个文件）

- `packages/renderers/web/src/Supramark.tsx`
  - `SUPRAMARK_ADMONITION_KINDS` 从 type import 改为 value import
  - `mergedContainerRenderers` 简化（同 RN 侧）
  - `renderNode` 参数类型放宽为 `any`

## 八、类型声明补充（1 个文件）

- `types/diagram-optional-deps.d.ts`
  - 新增 `markdown-it-container`、`markdown-it-texmath`、`markdown-it-footnote`、`markdown-it-deflist`、`pako` 的 ambient module 声明

## 九、新文件（1 个文件）

- `packages/renderers/rn/src/generatedContainers.ts`
  - 空的 fallback 导出文件，`index.ts` 里 `export * from './generatedContainers'` 需要它存在

## 十、RN 数学公式渲染 — 从本地 KaTeX 改为远程 SVG/PNG 服务（3 个文件）

原方案通过 `diagram-engine` 调用 KaTeX `renderToString`，但 KaTeX 输出的是 HTML 格式，
而 `MathBlock.tsx` 仅接受 SVG（`result.format === 'svg'`），导致 RN 端公式永远降级显示 TeX 源码。
改为通过 CodeCogs 公共服务远程渲染，RN 端零本地数学库依赖。

## 十一、Graphviz/dot RN 服务端渲染 fallback（2 个文件）

Hermes 不支持 WebAssembly，`@viz-js/viz` 无法在 RN 上运行。改为在 WASM 不可用时自动回退到 Kroki 服务端渲染。

## 十二、Vega / Vega-Lite RN 服务端渲染（2 个文件）

Hermes 引擎（Android）下 vega 和 vega-lite 的本地 JS SSR（`vega.View.toSVG()`）会挂起，
iOS 使用 JSC 引擎不受影响。改为非浏览器环境统一走 Kroki 远端渲染，Web 端保持本地渲染不变。

## 十三、PlantUML RN 远端渲染完整实现（1 个文件）

PlantUML 始终使用远端服务渲染（将 UML 源码编码为 URL 后请求 PlantUML 服务器获取 SVG）。
本次改动完整实现了跨平台兼容的编码和渲染链路。

## 十四、通用 Headless WebView 图表渲染架构 + ECharts 双路径分流

### 背景

部分图表库（ECharts、Vega 等）的纯 JS SSR 在 Hermes（Android）下会挂起，但在 JSC（iOS）下正常。
采用 JS 引擎检测（`'HermesInternal' in globalThis`）实现双路径分流：

- **Hermes（Android）**：通过常驻的隐藏 1×1 WebView 加载图表库 CDN，在 WebView 内渲染后将 SVG 通过 postMessage 传回 RN
- **JSC（iOS）**：直接走 diagram-engine 的纯 JS SSR，零 WebView 开销

### 架构设计

将 WebView bridge 泛化为通用架构，通过 `bridges/` 目录按 engine 拆分渲染逻辑，
单个 WebView 实例服务所有已注册的 engine。新增 engine 只需在 `bridges/` 下新建文件并注册。

```
rn-diagram-worker/src/
├── bridges/
│   ├── types.ts          ← BridgeEngine 接口定义
│   ├── echarts.ts        ← ECharts WebView 内渲染逻辑
│   ├── vega.ts           ← Vega / Vega-Lite 占位
│   └── index.ts          ← 统一导出
├── DiagramWebViewBridge.tsx  ← 通用无头 WebView 组件
├── DiagramRenderContext.tsx  ← Provider + hooks
├── types.ts
└── index.ts
```

### Mermaid / beautiful-mermaid 补充说明

Mermaid 在 RN 端同样接入了 headless WebView，但实现上和 Vega / ECharts 不同：

- `beautiful-mermaid` npm 包自带的 `dist/index.js` 仍然是 ESM，并且保留了对 `entities`、`elkjs` 的裸 `import`
- 因此它不能像 Vega / ECharts 那样直接通过普通 `<script src="...">` 以全局变量模式加载
- 之前尝试使用 jsDelivr 的 `+esm` 入口，但该入口在 WebView 中仍会继续级联加载其它模块，容易触发 origin / 二级 import / 依赖入口兼容问题
- 最终改为先用本地 `esbuild` 将 `beautiful-mermaid` 预打包成单文件 IIFE bundle，并在 WebView 内注入后挂到 `window.BeautifulMermaid`
- 该 bundle 作为 generated vendor 文件放在 `src/vendor/beautifulMermaidBundle.ts`
- 新增生成脚本 `scripts/build-beautiful-mermaid-bundle.js`，通过 `bun run build:beautiful-mermaid-bundle` 再生成，避免手工维护大文件

这样做的目的不是绕过 Hermes，而是把 Mermaid 运行时完全放到 WebView 内执行，避免 RN / Hermes 直接承载 `beautiful-mermaid` 的 ESM 依赖链。

另外，`beautiful-mermaid` 生成的 SVG 大量依赖 CSS 变量和 `<style>` 块，例如 `fill="var(--_arrow)"`、`stroke="var(--_line)"`、`fill="var(--_node-fill)"`。
这些写法在浏览器 / WebView 中可正常解析，但 `react-native-svg` 不支持把 `var(--...)` 当作颜色值，因此会在 RN 侧出现：

- `"var(--_arrow)" is not a valid color or brush`
- `"var(--bg)" is not a valid color or brush`
- `"var(--_text-sec)" is not a valid color or brush`

为解决这个问题，Mermaid 的 WebView bridge 在回传 SVG 前新增了一层“样式实化”处理：

- 先把 `beautiful-mermaid` 返回的 SVG 挂到 WebView DOM
- 使用 `getComputedStyle()` 读取节点的最终样式
- 解析 SVG 根节点上的 `--bg` / `--fg` / `--accent` 等 CSS 变量，并补算 `--_arrow` / `--_text-sec` / `--_node-fill` 等派生变量
- 将节点上的 `fill` / `stroke` / `color` / `stop-color` 等属性中的 `var(--...)` 替换为具体色值
- 删除 `<style>` 和根节点上的 CSS 变量依赖后，再把最终 SVG 通过 postMessage 传回 RN

这样 iOS / Android 侧接收到的是已经内联样式、去掉 CSS 变量依赖的静态 SVG，`react-native-svg` 才能稳定显示。
