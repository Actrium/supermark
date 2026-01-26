# Admonition

> 提示框 / 容器块语法支持（note/tip/warning 等）

# Admonition Feature

为 Supramark 提供提示框容器块支持。

## 功能

- note 提示框
- warning 警告框
- 自定义提示框

## 使用

查看 examples 目录获取更多示例。

## API 参考

### 函数

#### `createAdmonitionFeatureConfig`

创建 Admonition Feature 配置对象，用于在 SupramarkConfig 中启用提示框支持

#### `options`

Admonition Feature 配置选项，可指定允许的提示框类别

### 接口

#### `AdmonitionFeatureOptions`

Admonition Feature 的配置选项接口

## 最佳实践

- 使用 ::: 包裹提示框内容，格式为 ::: kind title
- 为提示框添加有意义的标题，提高可读性
- 根据内容重要性选择合适的提示框类型（note/tip/info/warning/danger）
- 确保提示框的开始标记（:::）和结束标记（:::）成对出现

## 常见问题

### Admonition Feature 支持哪些提示框类型？

默认支持 note（提示）、tip（技巧）、info（信息）、warning（警告）、danger（危险）五种类型，也可以使用自定义类型。

### 如何自定义提示框类型？

可以在 ::: 后使用任意字符串作为自定义类型，例如 ::: custom 我的提示框。不过建议优先使用预定义的类型以保持一致性。

### 提示框内可以包含哪些内容？

提示框内可以包含段落、列表、代码块、引用块等各种 Markdown 元素，提供丰富的内容展示能力。

