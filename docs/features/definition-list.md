# Definition List

> 定义列表语法支持（Term + 多段描述）

# Definition List Feature

为 Supramark 提供定义列表支持。

## 功能

- 术语定义
- 多段描述

## 使用

查看 examples 目录获取更多示例。

## API 参考

### 函数

#### `createDefinitionListFeatureConfig`

创建 Definition List Feature 配置对象，用于在 SupramarkConfig 中启用定义列表支持

#### `options`

Definition List Feature 配置选项（当前为空对象）

### 接口

#### `DefinitionListFeatureOptions`

Definition List Feature 的配置选项接口（当前为空，保留用于未来扩展）

## 最佳实践

- 术语单独占一行，定义以 :   开头（冒号后至少 3 个空格或 1 个 tab）
- 一个术语可以有多个定义，每个定义单独一行并以 :   开头
- 多个术语可以共享同一个定义
- 定义内容支持多段落，使用缩进保持结构

## 常见问题

### 定义列表的语法格式是什么？

术语单独一行，定义以 :   开头（冒号后至少 3 个空格或 1 个 tab）。例如：Term\\n:   Definition

### 一个术语可以有多个定义吗？

可以。每个定义单独一行并以 :   开头即可，例如：Term\\n:   Definition 1\\n:   Definition 2

### 多个术语可以共享定义吗？

可以。连续写多个术语，然后写一个定义，这些术语将共享该定义。

