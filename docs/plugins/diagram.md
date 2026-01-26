# 图表 / 流程图插件（Mermaid / PlantUML / Vega / ECharts 等）

supramark 中的「图表插件」主要处理以下几类场景（解析统一为 `diagram` 节点，渲染优先支持 Mermaid / PlantUML / Vega-Lite，其余暂为占位方案）：

- ` ```mermaid `：流程图、时序图、甘特图等；
- ` ```plantuml `：UML 各种图（RN + Web 通过 PlantUML server 渲染为 SVG）；
- ` ```vega` / ` ```vega-lite` / ` ```chart` / ` ```chartjs``：Vega-Lite 规格的数据可视化图表（RN + Web 通过 Vega-Lite 渲染为 SVG）；
- ` ```echarts`：ECharts 图表（RN + Web 通过 ECharts SVG 渲染器渲染为 SVG）；
- ` ```dot` / ` ```graphviz`：Graphviz / DOT 图（当前仅解析为 diagram，占位渲染）。

## 解析层

- 在 Markdown 中，把特定语言的代码块解析为统一的 `diagram` 节点，例如：

  ```ts
  interface SupramarkDiagramNode {
    type: 'diagram';
    engine:
      | 'mermaid'
      | 'plantuml'
      | 'vega'
      | 'vega-lite'
      | 'echarts'
      | 'chart'
      | 'chartjs'
      | 'dot'
      | 'graphviz'
      | string;
    code: string;        // 原始代码块内容
    meta?: Record<string, unknown>;
  }
  ```

- 具体解析将基于 remark 或 markdown-it 的代码块回调，封装为 `@supramark/core` 的插件。

## 渲染层（React Native）

- `@supramark/rn` 提供 `DiagramNode` 默认渲染器：
  - 调用 `@supramark/rn-diagram-worker` 的 `render({ engine, code })`；
  - 当前：
    - `engine === 'mermaid'`：通过 headless WebView + Mermaid v9 渲染为 SVG；
    - `engine === 'plantuml'`：通过 headless WebView + 远端 PlantUML server 渲染为 SVG；
    - `engine === 'vega' | 'vega-lite'`：通过 headless WebView + `vega-embed` 渲染为 SVG；
    - `engine === 'echarts'`：通过 headless WebView + ECharts（SVG 渲染器）渲染为 SVG；
    - 其它引擎（dot / graphviz 等）仍返回「未实现」错误，并以占位文本 `[diagram: engine]` 显示。

## 图表引擎整合（集成/封装）

- Mermaid：在 headless WebView / 浏览器中注入 `mermaid.min.js`，把 `code` 渲染为 SVG（**当前已实现 RN + Web**）；
- PlantUML：通过远端 PlantUML server 渲染为 SVG（**当前已实现 RN + Web**）；
- Vega / Vega-Lite：在 Web 中通过 `vega-embed` 渲染为 SVG，在 RN 中通过 headless WebView + `vega-embed` → `view.toSVG()` 渲染 SVG（**当前已实现 RN + Web，仍属首版实现**）；
- ECharts：在 Web 中通过 ECharts SVG 渲染器、在 RN 中通过 headless WebView + ECharts（renderer: 'svg'）渲染为 SVG（**当前已实现 RN + Web，仍属首版实现**）；
- DOT / Graphviz：考虑通过 wasm 或外部服务生成 SVG（**当前仅解析为 diagram，占位渲染**）。

## 输出格式与管线

- 首选输出格式为 **SVG 字符串**，便于在 RN 中使用 `react-native-svg` 渲染，也便于 Web/Node 侧复用；
- 个别场景允许输出 PNG（base64），在 RN 中由 `<Image />` 渲染，作为降级方案；
- 从 supramark 视角，图表渲染子系统是一个「`diagram` 节点 → {format, payload}」的黑盒，前端只关心如何展示结果，而不关心具体图表库的实现。

supramark 不试图重写这些图表库，而是提供统一的「请求 → 渲染结果」接口。

## Diagram 配置（SupramarkConfig.diagram）

图表子系统的行为通过 `SupramarkConfig.diagram` 统一配置，结构定义在 `@supramark/core/src/ast.ts` 中：

```ts
interface SupramarkDiagramConfig {
  defaultTimeoutMs?: number;
  defaultCache?: {
    enabled?: boolean;
    maxSize?: number;
    ttl?: number;
  };
  engines?: Record<
    SupramarkDiagramEngineId,
    {
      enabled?: boolean;
      timeoutMs?: number;
      server?: string;
      cache?: {
        enabled?: boolean;
        maxSize?: number;
        ttl?: number;
      };
    }
  >;
}
```

典型用法（RN + Web 共享同一份配置）：

```ts
const config: SupramarkConfig = {
  diagram: {
    defaultTimeoutMs: 12000,
    defaultCache: {
      enabled: true,
      maxSize: 100,
      ttl: 5 * 60 * 1000,
    },
    engines: {
      plantuml: {
        server: 'https://my-plantuml.example.com/svg',
        timeoutMs: 15000,
      },
      'vega-lite': {
        timeoutMs: 8000,
      },
    },
  },
};
```

- 在 **RN 端**：
  - `<DiagramRenderProvider diagramConfig={config.diagram}>` 使用 `defaultTimeoutMs` / `defaultCache` 控制 WebView worker 的全局超时与缓存；
  - `<Supramark markdown={...} config={config} />` 通过 `DiagramNode` 将 `engines[engine]` 中的 `server` / `timeoutMs` 合并进单个 diagram 的渲染 options。
- 在 **Web 端**：
  - `buildDiagramSupportScripts(config.diagram)` 会把配置序列化为 `window.__SUPRAMARK_DIAGRAM_CONFIG__`，浏览器脚本据此调整：
    - 全局超时 / 缓存开关；
    - Mermaid / PlantUML / Vega-Lite 等各引擎的超时与 PlantUML server 等参数。

如果不提供 `diagram` 字段，则 RN / Web 都会使用各自内置的默认值，行为与之前版本保持一致。
