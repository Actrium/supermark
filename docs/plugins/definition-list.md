# 定义列表支持（Definition List）

本文档介绍 supramark 中 **定义列表（definition list）** 的 AST 设计与当前实现。

## 1. 支持语法

语法采用常见的 Markdown Extra / Pandoc 风格：

```markdown
术语一
:   描述一
:   描述一的补充说明

术语二
:   描述二
```

特点：

- 一个术语（term）后面可以跟多个描述（description）；
- 每个描述可以是一个或多个段落。

---

## 2. AST 结构

在 `@supramark/core` 中，定义列表相关节点如下（详见 `docs/architecture/ast-spec.md`）：

```ts
interface SupramarkDefinitionListNode extends SupramarkParentNode {
  type: 'definition_list';
  children: SupramarkDefinitionItemNode[];
}

interface SupramarkDefinitionItemNode extends SupramarkBaseNode {
  type: 'definition_item';
  term: SupramarkNode[];      // 术语部分（inline 节点）
  descriptions: SupramarkNode[][]; // 描述列表，每个元素是一段描述的节点序列
}
```

语义约定：

- `definition_list.children` 按顺序存放每个术语条目；
- `definition_item.term` 是术语本身的一行 inline 节点（通常为若干 `text`/`strong` 等）；
- `definition_item.descriptions` 是描述段落列表：
  - 每个元素是一段描述所包含的节点序列（通常是一个 `paragraph` 的 children）；
  - 当前实现主要针对简单文本描述，复杂嵌套结构会被简化。

---

## 3. 解析管线（markdown-it-deflist）

默认解析器 `parseMarkdown()` 内部启用了 [`markdown-it-deflist`](https://github.com/markdown-it/markdown-it-deflist)：

```ts
import deflist from 'markdown-it-deflist';

md.use(deflist as any);
```

该插件会产生如下 token：

- `dl_open` / `dl_close`：整个定义列表；
- `dt_open` / `dt_close`：单个术语；
- `dd_open` / `dd_close`：对应术语下的描述块；
- 以及内部的 `paragraph_open` / `inline` 等常规 token。

在 supramark 的 token → AST 映射阶段，核心逻辑是：

1. **列表容器**

   ```ts
   case 'dl_open': {
     const listNode: SupramarkDefinitionListNode = {
       type: 'definition_list',
       children: [],
     };
     parent.children.push(listNode);
     currentDefList = listNode;
     currentDefItem = null;
     collectingTerm = false;
     currentTermNodes = null;
     currentDescriptionNodes = null;
     break;
   }

   case 'dl_close': {
     currentDefList = null;
     currentDefItem = null;
     collectingTerm = false;
     currentTermNodes = null;
     currentDescriptionNodes = null;
     break;
   }
   ```

2. **术语（term）部分**

   ```ts
   case 'dt_open': {
     if (!currentDefList) {
       break;
     }
     const item: SupramarkDefinitionItemNode = {
       type: 'definition_item',
       term: [],
       descriptions: [],
     };
     currentDefList.children.push(item);
     currentDefItem = item;
     collectingTerm = true;
     currentTermNodes = item.term;
     currentDescriptionNodes = null;
     break;
   }

   case 'dt_close': {
     collectingTerm = false;
     currentTermNodes = null;
     break;
   }
   ```

   在 `inline` 分支中，如果 `collectingTerm === true`，则将当前 inline token 映射出的节点追加到 `currentDefItem.term`：

   ```ts
   case 'inline': {
     if (collectingTerm && currentTermNodes) {
       const termParent: SupramarkParentNode = {
         type: 'paragraph',
         children: [],
       } as SupramarkParagraphNode;
       mapInlineTokens(token.children, termParent);
       currentTermNodes.push(...termParent.children);
     } else if (currentDescriptionNodes) {
       // ...
     } else {
       const current = stack[stack.length - 1];
       mapInlineTokens(token.children, current);
     }
     break;
   }
   ```

3. **描述（description）部分**

   ```ts
   case 'dd_open': {
     if (!currentDefItem) {
       break;
     }
     const descNodes: SupramarkNode[] = [];
     currentDefItem.descriptions.push(descNodes);
     currentDescriptionNodes = descNodes;
     break;
   }

   case 'dd_close': {
     currentDescriptionNodes = null;
     break;
   }
   ```

   为了避免在 AST 中生成多余的 `paragraph` 包裹，`paragraph_open` / `paragraph_close` 中会在描述阶段被跳过：

   ```ts
   case 'paragraph_open': {
     if (collectingTerm && currentTermNodes) break;
     if (currentDescriptionNodes) break;
     // 正常段落处理 ...
   }

   case 'paragraph_close': {
     if (collectingTerm && currentTermNodes) break;
     if (currentDescriptionNodes) break;
     stack.pop();
     break;
   }
   ```

   在 `inline` 分支中，如果 `currentDescriptionNodes` 非空，就把当前 inline 映射到该描述段落数组中：

   ```ts
   if (currentDescriptionNodes) {
     const descParent: SupramarkParentNode = {
       type: 'paragraph',
       children: [],
     } as SupramarkParagraphNode;
     mapInlineTokens(token.children, descParent);
     currentDescriptionNodes.push(...descParent.children);
   }
   ```

---

## 4. 渲染策略（当前实现）

### React Native：`@supramark/rn`

- 在 `Supramark.tsx` 中：

  ```ts
  case 'definition_list': {
    const list = node as SupramarkDefinitionListNode;
    return (
      <View key={key} style={styles.list}>
        {list.children.map((item, index) => {
          const defItem = item as SupramarkDefinitionItemNode;
          return (
            <View key={index} style={styles.listItem}>
              <Text style={[styles.listItemText, { fontWeight: '600' }]}>
                {renderInlineNodes(defItem.term, styles)}
              </Text>
              {defItem.descriptions.map((descNodes, idx) => (
                <Text key={idx} style={styles.listItemText}>
                  {renderInlineNodes(descNodes, styles)}
                </Text>
              ))}
            </View>
          );
        })}
      </View>
    );
  }
  ```

- 使用现有 `list` / `listItem` / `listItemText` 样式，保证在移动端有良好可读性。

### React Web：`@supramark/web`

- 在 `Supramark.tsx` 中：

  ```tsx
  case 'definition_list': {
    const list = node as SupramarkDefinitionListNode;
    return (
      <dl key={key} className={classNames.paragraph}>
        {list.children.map((item, index) => {
          const defItem = item as SupramarkDefinitionItemNode;
          const termContent = renderInlineNodes(defItem.term, classNames);
          return (
            <React.Fragment key={index}>
              <dt><strong>{termContent}</strong></dt>
              {defItem.descriptions.map((descNodes, idx) => (
                <dd key={idx}>{renderInlineNodes(descNodes, classNames)}</dd>
              ))}
            </React.Fragment>
          );
        })}
      </dl>
    );
  }
  ```

- 采用语义化的 `<dl>/<dt>/<dd>` 结构，className 目前复用 `paragraph`，用户可在 CSS 中针对 `dl dt/dd` 进一步定制样式。

---

## 5. 示例

在共享 demo 数据中可以添加定义列表示例（`examples/demos（从各 Feature 包聚合）`）：

```markdown
# 定义列表示例

HTTP
:   一种应用层协议，用于超文本传输。
:   目前最常见的 Web 协议。

HTTPS
:   在 HTTP 之上加入 TLS 加密的安全协议。
```

在 React Native / React Web 示例应用中，选择「Definition List 示例」即可观察到术语与多段描述的渲染效果。

---

## 6. 后续可能的增强

- 支持更复杂的描述内容（列表、表格等）在 AST 中按块级节点保留，而不仅仅是拆成 inline 序列；
- 在 Web 端为定义列表提供默认的缩进和分隔线样式；
- 与 remark / mdast 的 definition list 插件保持一一映射，保证 `parseMarkdownWithRemark()` 侧也能产生一致的 AST。 

