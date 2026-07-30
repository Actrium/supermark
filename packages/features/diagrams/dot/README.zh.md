# Diagram (DOT / Graphviz) Feature

DOT / Graphviz 图表支持 Feature。

- 语法：使用围栏代码块：

````markdown
```dot
digraph G { A -> B }
```
````

```graphviz
digraph G { A -> B }
```

```

- AST：统一解析为 `diagram` 节点，`engine` 为 `dot` 或 `graphviz`。
- 渲染：由 `@supramark/engines` 统一转换为 SVG。

```
