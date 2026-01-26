# Math

> LaTeX 数学公式支持

# Math Feature

为 Supramark 提供 LaTeX 数学公式支持。

## 功能

- 行内公式：\

## API 参考

### 函数

#### `createMathFeatureConfig`

创建 Math Feature 配置对象，用于在 SupramarkConfig 中启用数学公式支持

#### `options`

Math Feature 配置选项，可指定渲染引擎等参数

### 接口

#### `MathFeatureOptions`

Math Feature 的配置选项接口

## 最佳实践

- 使用 $ 包裹行内公式，使用 $$ 包裹块级公式
- 复杂公式建议使用块级格式以提高可读性
- 确保 LaTeX 语法正确，避免渲染错误

## 常见问题

### 支持哪些 LaTeX 语法？

支持标准 LaTeX 数学模式的大部分语法，具体取决于所选的渲染引擎（KaTeX 或 MathJax）。

### 如何切换渲染引擎？

通过配置 options.engine 字段，可选值为 

