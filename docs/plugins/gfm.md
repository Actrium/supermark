# GFM 插件（GitHub Flavored Markdown）

本文档介绍 supramark 中 GFM 相关能力的**当前实现**与 Feature 建模。

> 说明：脚注、定义列表等虽然在广义 GFM 生态中也常见，  
> supramark 为它们分别提供了独立插件文档：  
> - 脚注：`docs/plugins/footnote.md`（Feature：`@supramark/feature-footnote`）  
> - 定义列表：`docs/plugins/definition-list.md`（Feature：`@supramark/feature-definition-list`）

本文聚焦以下 GFM 能力：

- GFM 删除线：`~~text~~` → `delete` 节点；
- 任务列表：`- [ ]` / `- [x]` → `list_item.checked`;
- GFM 表格：`| a | b |` → `table` / `table_row` / `table_cell`。

---

## 1. 解析实现（markdown-it）

在 `@supramark/core` 中，默认解析器 `parseMarkdown()` 基于 **markdown-it**，并在内部启用了：

- 自定义删除线插件：`strikethroughPlugin`；
- 自定义任务列表插件：`taskListPlugin`；
- 内置表格规则：`md.enable('table')`。

对应的 AST 映射逻辑详见 `packages/core/src/plugin.ts`，要点如下：

### 1.1 删除线（Strikethrough）

- 语法：`~~text~~`
- markdown-it 侧通过 `s_open` / `s_close` token；
- 在 supramark AST 中映射为：

  ```ts
  interface SupramarkDeleteNode extends SupramarkParentNode {
    type: 'delete';
    children: SupramarkNode[];
  }
  ```

### 1.2 任务列表（Task List）

- 语法：

  ```markdown
  - [ ] 未完成
  - [x] 已完成
  ```

- 解析逻辑：
  - `taskListPlugin` 在 `list_item_open` token 上打属性 `task-list-item="true|false"`；
  - 在 AST 阶段，这一属性被映射到 `list_item.checked?: boolean | null` 字段上；
  - `checked === true` 代表勾选，`false` 代表未勾选，`undefined` 代表普通列表项。

### 1.3 表格（Table）

- 语法：标准 GFM 表格；
- 解析逻辑：
  - 使用 markdown-it 内置 `table` 规则；
  - 映射到 supramark AST 中的：

    ```ts
    interface SupramarkTableNode { type: 'table'; align?: ('left' | 'right' | 'center' | null)[] }
    interface SupramarkTableRowNode { type: 'table_row'; children: SupramarkTableCellNode[] }
    interface SupramarkTableCellNode {
      type: 'table_cell';
      align?: 'left' | 'right' | 'center' | null;
      header?: boolean;
    }
    ```

---

## 2. 渲染策略

### 2.1 React Native（`@supramark/rn`）

- 删除线：在 `Supramark.tsx` 中将 `delete` 节点渲染为：

  ```tsx
  <Text style={styles.delete}>{renderInlineNodes(children, styles)}</Text>
  ```

- 任务列表：
  - 使用 `list_item.checked` 字段渲染为「☐ / ☑ + 文本」；
  - 保持布局与普通列表一致。

- 表格：
  - 使用 `View` + `Text` 组合实现简单表格布局；
  - `header` / `align` 通过样式控制对齐和表头粗体。

### 2.2 React Web（`@supramark/web`）

- 删除线：映射为 `<del>` 或带有删除线样式的 `<span>`；
- 任务列表：
  - 渲染为 `<li>` 内嵌 `input[type="checkbox"][disabled]` + 文本；
  - 复用 className 系统，方便宿主覆盖样式；
- 表格：
  - 渲染为语义化 `<table><thead><tbody><tr><th>/<td>` 结构；
  - align 信息通过 `text-align` / className 落地。

---

## 3. Feature 建模：`@supramark/feature-gfm`

为便于配置与能力发现，GFM 相关能力被抽象为一个聚合 Feature：

- 包：`packages/features/main/feature-gfm`；
- Feature ID：`@supramark/feature-gfm`；
- AST 匹配范围（通过 `selector` 实现）：
  - `node.type === 'delete'`；
  - `node.type === 'list_item' && node.checked !== undefined`；
  - `node.type === 'table' | 'table_row' | 'table_cell'`。

运行时可以通过配置启用/禁用 GFM 能力，例如：

```ts
import { FeatureRegistry, createConfigFromRegistry } from '@supramark/core';
import { gfmFeature } from '@supramark/feature-gfm';

FeatureRegistry.register(gfmFeature);

const config = createConfigFromRegistry(true);
```

结合 `docs/FEATURE_LIFECYCLE_AND_CONFIG.md` 中的配置桥梁，可以：

- 在**解析阶段**按需启用 GFM 相关插件（未来会逐步接入）；  
- 在**渲染阶段**通过 `config.features` 对删除线 / 任务列表 / 表格做统一开关或降级策略。 
