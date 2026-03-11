# Supermark 改动清单

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

- `packages/renderers/rn/src/MathBlock.tsx`
  - 移除 `useDiagramRender` 依赖，不再走 diagram-engine 的 KaTeX HTML 路径
  - 改为 fetch `https://latex.codecogs.com/svg.latex` 获取 SVG
  - 用 `\dpi{200} \displaystyle` 前缀确保高清块级渲染
  - SVG 经 `normalizeSvg` 处理后由 `SvgXml` 渲染，网络失败时降级为 TeX 源码
- `packages/renderers/rn/src/MathInline.tsx`（新建）
  - 行内公式使用 CodeCogs PNG 端点（`png.latex`），因为 RN 的 `Image` 可嵌套在 `Text` 内
  - 通过 `Image.getSize` 获取图片尺寸后按文字大小等比缩放
  - 尺寸就绪前 / 网络失败时，用带紫色标记的 TeX 源码兜底
- `packages/renderers/rn/src/Supramark.tsx`
  - 导入 `MathInline` 组件
  - `math_inline` 分支从纯文本改为使用 `MathInline`，增加 feature 禁用检查
- `packages/renderers/rn/src/index.ts`
  - 补充导出 `MathInline`

## 十一、Graphviz/dot RN 服务端渲染 fallback（2 个文件）

Hermes 不支持 WebAssembly，`@viz-js/viz` 无法在 RN 上运行。改为在 WASM 不可用时自动回退到 Kroki 服务端渲染。

- `packages/renderers/diagram-engine/src/engines/dot.ts`
  - `renderDot` 先尝试本地 WASM，失败后 fallback 到 Kroki HTTP API（`POST /graphviz/svg`）
  - 新增 `renderDotRemote()`，支持自定义 server、timeout，带响应校验
- `packages/renderers/diagram-engine/src/engine.ts`
  - `dispatchRender` 中 dot 分支透传 `options`，使 `diagramConfig.engines.dot.server` 可覆盖默认地址

## 十二、Vega / Vega-Lite RN 服务端渲染（2 个文件）

Hermes 引擎（Android）下 vega 和 vega-lite 的本地 JS SSR（`vega.View.toSVG()`）会挂起，
iOS 使用 JSC 引擎不受影响。改为非浏览器环境统一走 Kroki 远端渲染，Web 端保持本地渲染不变。

- `packages/renderers/diagram-engine/src/engines/vega-lite.ts`
  - 拆分为 `renderVegaLiteLocal()`（原有逻辑，不变）和 `renderVegaLiteRemote()`（新增）
  - `renderVegaLiteRemote()` 参照 `renderDotRemote()` 实现：POST 到 Kroki（`/vega/svg` 或 `/vegalite/svg`），支持自定义 server、timeout，带响应校验和 AbortController 超时控制
  - `renderVegaLite()` 入口通过 `typeof document !== 'undefined'` 判断环境：浏览器走本地，RN/非浏览器走 Kroki
  - 函数签名新增第三参数 `options?: Record<string, unknown>`，接收 server/timeout 配置
- `packages/renderers/diagram-engine/src/engine.ts`
  - `dispatchRender` 中 vega/vega-lite 分支透传 `options`，使 `diagramConfig.engines['vega-lite'].server` 可覆盖默认 Kroki 地址

## 十三、PlantUML RN 远端渲染完整实现（1 个文件）

PlantUML 始终使用远端服务渲染（将 UML 源码编码为 URL 后请求 PlantUML 服务器获取 SVG）。
本次改动完整实现了跨平台兼容的编码和渲染链路。

- `packages/renderers/diagram-engine/src/engines/plantuml.ts`
  - 新增 PlantUML 文本编码管线：`utf8Encode()` → `deflateRaw()` → `encodeBytes()`（PlantUML 自定义 base64）
  - `utf8Encode()`：优先使用 `TextEncoder`，Hermes 不可用时纯 JS 手动编码（支持 surrogate pair / 4 字节 UTF-8）
  - `deflateRaw()`：三级 fallback 链 — `CompressionStream('deflate-raw')` → `pako.deflateRaw` → 抛错
  - `CompressionStream.write` 修复：确保传入标准 `Uint8Array`（规避部分运行时对 `ArrayBuffer` 子类的限制）
  - 浏览器环境（`typeof window/document !== 'undefined'`）返回 `<img>` HTML 标签（绕过 CORS）
  - 非浏览器环境（RN/Node）直接 `fetch` SVG，带 AbortController 超时和响应格式校验
  - 支持 `options.server` / `options.plantumlServer` 自定义服务器地址，默认 `https://www.plantuml.com/plantuml/svg`

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

### 改动文件

- `packages/renderers/rn-diagram-worker/src/bridges/types.ts`（新建）
  - `BridgeEngine` 接口：`name`（engine 标识）、`cdnScripts`（CDN URL 列表）、`handleRenderJs`（WebView 内渲染函数体）
  - 函数签名约定：`function(msg, send)`，msg 含 `{ id, engine, code, options }`，send 回传结果
- `packages/renderers/rn-diagram-worker/src/bridges/echarts.ts`（新建）
  - 从原 `EChartsWebViewBridge.tsx` 抽出 WebView 内 JS 渲染逻辑
  - `createEChartsBridge(cdnUrl?)` 工厂函数，支持自定义 CDN 地址
  - 渲染流程：JSON.parse → `echarts.init(container, null, { renderer:'svg' })` → `animation: false` → 50ms 后捕获 SVG → CSS class 内联 → viewBox 注入 → 回传
- `packages/renderers/rn-diagram-worker/src/bridges/vega.ts`（新建）
  - `createVegaBridge()` / `createVegaLiteBridge()` 占位实现，返回 "not yet implemented" 错误
- `packages/renderers/rn-diagram-worker/src/bridges/index.ts`（新建）
  - 统一导出 `BridgeEngine` 类型和三个工厂函数
- `packages/renderers/rn-diagram-worker/src/DiagramWebViewBridge.tsx`（新建，替代原 `EChartsWebViewBridge.tsx`）
  - 通用无头 WebView 组件，接收 `BridgeEngine[]` 配置
  - `buildHtml(engines)` 将所有 CDN 脚本去重合并、所有渲染函数注入同一 HTML 模板
  - `_handlers` dispatch 表按 engine 名路由到对应处理函数
  - `forwardRef` + `useImperativeHandle` 暴露 `render({ engine, code, options })` 方法
  - handle 暴露 `engines: readonly string[]` 供消费端查询已注册 engine
  - 请求队列：WebView 未 ready 时缓存，ready 后自动 flush
  - 懒加载 `react-native-webview`，未安装时返回 null
  - 隐藏容器 1×1（非 0×0，iOS WKWebView 在零尺寸下不执行 JS）
- `packages/renderers/rn-diagram-worker/src/EChartsWebViewBridge.tsx`（删除）
  - 已被 `DiagramWebViewBridge.tsx` + `bridges/echarts.ts` 替代
- `packages/renderers/rn-diagram-worker/src/DiagramRenderContext.tsx`
  - Context value 改为 `{ service, webViewBridge }` 结构
  - `useMemo` 构建 `bridgeEngines` 数组（echarts + vega + vega-lite）
  - `DiagramWebViewBridge` 仅在 Hermes 运行时挂载
  - `useEChartsWebView()` → `useDiagramWebViewBridge()`（泛化）
- `packages/renderers/rn-diagram-worker/src/index.ts`
  - 导出改为 `DiagramWebViewBridge`、`DiagramWebViewBridgeHandle`、`BridgeEngine`
- `packages/renderers/rn/src/DiagramNode.tsx`
  - `useEChartsWebView()` → `useDiagramWebViewBridge()`
  - `attemptRender()` 泛化：通过 `bridge.engines.includes(engine)` 判断是否走 WebView，不再硬编码 echarts
  - `renderedViaBridge` 局部变量追踪渲染路径，控制 SVG normalize 策略（WebView 产出用 `normalizeSvgLight`，其他用 `normalizeSvg`）
- `packages/renderers/rn/src/svgUtils.ts`
  - 新增 `normalizeSvgLight()`：轻量 SVG 清理，保留内联样式和文本节点
- `packages/renderers/diagram-engine/src/engines/echarts.ts`
  - 新增 `resolveEchartsApi()`：处理 ESM default export 嵌套
  - 加运行时 API 可用性检查
  - SSR 参数：`renderer: 'svg'`、`ssr: true`，width/height 可通过 options 配置
