# Diagram (ECharts) Feature

ECharts 图表支持 Feature。

- 语法：使用围栏代码块：

````markdown
```echarts
{ ... ECharts option JSON ... }
```
````

```

- AST：统一解析为 `diagram` 节点，`engine` 为 `echarts`。
- 渲染：通过统一的图表子系统（RN 端 headless WebView，Web 端 @supramark/web-diagram）生成 SVG。

```
