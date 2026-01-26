# 提示框 / 容器块插件（Admonition）

## 1. 支持语法

```markdown
::: note 提示标题
一些说明文字
:::

::: warning
需要注意的事项
:::
```

当前在 core 中默认启用的 kind 包括：

- `note`
- `tip`
- `info`
- `warning`
- `danger`

后续可以通过插件扩展更多 kind。

---

## 2. AST 结构

- 解析：
  - 基于 directive/container 风格插件（remark-directive / markdown-it-container 等），
    把容器块解析为 supramark AST 中的 `admonition` 节点；
  - 节点字段示例：

    ```ts
interface SupramarkAdmonitionNode extends SupramarkParentNode {
  type: 'admonition';
  kind: string;    // note / warning / tip / info / danger / ...
  title?: string;  // 可选标题，来自第一行容器参数
  children: SupramarkNode[];
}
    ```

与 mdast 对应关系：

- 核心 mdast 规范中没有原生 `Admonition` 节点；
- supramark 将其视为扩展节点，便于与各类文档系统的 callout/container 语法对应。

---

## 3. 解析管线（markdown-it）

在 `@supramark/core` 中，默认解析器 `parseMarkdown()` 会：

- 使用 `markdown-it-container` 针对上述五种 kind 注册容器规则：

  ```ts
  const ADMONITION_KINDS = ['note', 'tip', 'info', 'warning', 'danger'];
  for (const kind of ADMONITION_KINDS) {
    container(md, kind, {});
  }
  ```

- `markdown-it-container` 会产生形如 `container_note_open` / `container_note_close` 的 token；
- 在 `parseMarkdown()` 主循环中，supramark 会：
  - 在进入 `switch` 之前优先识别这些 token：

    ```ts
    const admonitionKind = getAdmonitionKindFromToken(token);
    if (admonitionKind && token.nesting === 1) {
      const info = (token.info || '').trim();
      const parts = info.split(/\s+/);
      const titleParts = parts.length > 1 ? parts.slice(1) : [];
      const title = titleParts.length > 0 ? titleParts.join(' ') : undefined;

      const admonition: SupramarkAdmonitionNode = {
        type: 'admonition',
        kind: admonitionKind,
        title,
        children: [],
      };

      const parent = stack[stack.length - 1];
      parent.children.push(admonition);
      stack.push(admonition);
      continue;
    }

    if (token.type.startsWith('container_') && token.nesting === -1) {
      const maybeAdmonition = stack[stack.length - 1];
      if (maybeAdmonition.type === 'admonition') {
        stack.pop();
      }
      continue;
    }
    ```

- 容器内部的段落 / 列表 / 表格等，全部通过现有逻辑映射为普通 AST 节点，并作为 `admonition.children` 的一部分。

---

## 4. 渲染策略（当前实现）

### React Native：`@supramark/rn`

- 在 `Supramark.tsx` 中为 `admonition` 添加了渲染分支：
  - 使用 `View` 作为外层容器，复用 `listItem` 风格；
  - 若 `title` 存在，使用加粗的 `Text` 在上方显示；
  - 内容部分复用 `renderNode` 渲染 `children`，支持段落、列表等任意嵌套。

这是一个简单的默认样式，后续可以：

- 在 `styles` 中增加 `admonition` 专用样式；
- 按照 `kind` 区分背景色和图标。

### React Web：`@supramark/web`

- 在 `Supramark.tsx` 中：
  - 将 `admonition` 渲染为：

    ```html
    <div class="admonition admonition-{kind} ...">
      <p><strong>{title}</strong></p>
      <div>...children...</div>
    </div>
    ```

  - 外层 className 目前复用 `paragraph` 的样式，并额外挂上 `admonition` / `admonition-{kind}` 以便用户在 CSS 中自定义风格。

---

## 5. 示例

在共享 demo（`examples/demos（从各 Feature 包聚合）`）中可以添加示例：

```markdown
::: note 提示
这是一个普通提示框。
:::

::: warning 警告
请勿在生产环境中直接使用测试密钥。
:::
```

在 React Native / React Web 示例应用中，选择「Admonition 示例」即可看到对应渲染效果。

---

## 6. 目标与后续工作

本插件的目标是把各类文档系统中的「提示框」语法统一封装进 supramark。后续可以考虑：

- 根据 `kind` 提供一套默认配色与 icon；
- 支持自定义 kind 与渲染组件（例如通过 plugin 或主题扩展）；
- 在 Web 端增强可访问性（例如为警告类提示添加适当的 ARIA role）。
