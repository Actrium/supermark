# Diagram (Vega-Lite) Feature

Vega-Lite / Vega / ChartJS 图表支持 Feature。

- 语法：使用围栏代码块：

````markdown
```vega-lite
{ ... Vega-Lite JSON spec ... }
```
````

```

- AST：统一解析为 `diagram` 节点，`engine` 字段为 `vega-lite` / `vega` / `chart` / `chartjs`。
- 渲染：通过统一的图表子系统（RN 端 headless WebView，Web 端 @supramark/web-diagram）生成 SVG。

本包当前主要用于：

- 在 FeatureRegistry 中声明「Vega-Lite 图表」能力；
- 通过 `createDiagramVegaLiteFeatureConfig()` 为运行时配置提供强类型桥梁；
- 为文档和示例提供规范化入口。

```
