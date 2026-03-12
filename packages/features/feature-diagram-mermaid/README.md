# `@supramark/feature-diagram-mermaid`

为 supramark 提供 ` ```mermaid ` 围栏代码块支持，解析后产出统一的 `diagram` 节点，`engine = "mermaid"`。

## 实现方式

Web 环境：

- 通过 `@supramark/diagram-engine` 的 `mermaid` 引擎直接渲染
- 引擎内部动态加载 `beautiful-mermaid`
- 在当前 JS 运行时中直接生成 SVG

React Native 环境：

- 优先走 `@supramark/rn-diagram-worker` 的 headless WebView bridge
- 在隐藏 WebView 中加载 `beautiful-mermaid` 的浏览器 bundle
- 该 bundle 是仓库内的 generated vendor 文件，不是手写源码
- 生成脚本位于 `scripts/build-beautiful-mermaid-bundle.js`
- 由 WebView 内部生成 SVG，并在回传前做一层样式实化和清理
- RN 侧最终使用 `react-native-svg` 渲染返回的 SVG

这样区分的原因是：Web 端可以直接运行图表库，而 RN 尤其 Android/Hermes 对浏览器型图表库兼容性较差，放到 WebView 中执行更稳定。
