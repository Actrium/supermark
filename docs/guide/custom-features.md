# 自定义 Feature 开发指南

本指南整理了**从零开发一个新 Feature** 的完整流程，覆盖：

- 语法与 AST 设计  
- 使用脚手架创建 Feature 包  
- 接入 `@supramark/core` 解析管线  
- 在 `@supramark/rn` / `@supramark/web` 中渲染  
- 配置桥接、示例与文档、测试与质量

> 推荐在动手前先阅读：
>
> - `docs/FEATURE_INTERFACE_ENHANCEMENT.md`
> - `docs/FEATURE_LIFECYCLE_AND_CONFIG.md`
> - `docs/PLUGIN_SYSTEM.md`
> - `docs/CREATE_FEATURE_GUIDE.md`

---

## 1. 先设计能力与语法 / AST

在写任何代码之前，先回答几个问题并写进 TODO / MEMO：

- 这个 Feature 要解决什么问题？（目标 / 非目标）
- Markdown 语法长什么样？给出 2–3 段代表性示例：
  - 行内 / 块级？
  - 是否与现有语法冲突（例如 ```html 已经有含义）？
- AST 期望长什么样？
  - 复用现有节点类型（如 `diagram` 的某个 engine）还是新增类型？
  - 每个字段的含义和类型是什么？哪些是必需的？

如果需要**新增节点类型**，记下后面要修改：

- `packages/core/src/ast.ts`
- `docs/architecture/ast-spec.md`

---

## 2. 用 CLI 脚手架创建 Feature 包

在仓库根目录执行：

```bash
npm run create-feature
```

按提示填写名称 / 节点类型 / 描述等信息，或者使用非交互模式：

```bash
npm run create-feature -- \
  -n "Math Formula" \
  -t "math_inline" \
  -d "LaTeX 数学公式支持"
```

脚手架会在 `packages/features/<family>/feature-xxx/` 下生成（family 通常为 `main` / `container` / `fence`）：

- `package.json` / `tsconfig.json`
- `src/feature.ts`（Feature 定义主体）
- `src/index.ts`
- `__tests__/feature.test.ts`
- `README.md`

> 详细参数说明见 `docs/CREATE_FEATURE_GUIDE.md`。

生成后先确认能编译：

```bash
npm run build --workspace @supramark/feature-xxx
```

---

## 3. 补全 Feature 定义（语义与配置）

编辑对应目录下的 `src/feature.ts`，按以下步骤完善：

1. **metadata**
   - 设定唯一的 `id`（约定：`@supramark/feature-xxx`）
   - 填写 `name` / `version` / `description` / `tags` 等。

2. **syntax.ast**
   - `type`: 绑定到某个 AST 节点类型（如 `diagram` / `math_inline`）。
   - `selector`: 如果多个 Feature 共享同一节点类型（如 diagram 引擎），用 selector 筛子节点子集。
   - `interface`: 用于文档和工具：
     - `required` / `optional`
     - `fields`（字段名 → 类型 + 描述）
   - `constraints`: 简单说明父子节点限制（如只能出现在 `root` / `paragraph` 下）。
   - `examples`: 给出若干示例节点。

3. **配置 Options（如需要）**
   - 定义强类型 options：
     ```ts
     export interface XxxFeatureOptions {
       // 例如：
       engine?: 'katex' | 'mathjax';
       compact?: boolean;
     }
     ```
   - 通过辅助类型导出配置形态：
     ```ts
     export type XxxFeatureConfig =
       FeatureConfigWithOptions<XxxFeatureOptions>;
     ```
   - 提供 helper：
     ```ts
     export function createXxxFeatureConfig(
       enabled = true,
       options?: XxxFeatureOptions,
     ): XxxFeatureConfig {
       return { id: '@supramark/feature-xxx', enabled, options };
     }

     export function getXxxFeatureOptions(
       config?: SupramarkConfig,
     ): XxxFeatureOptions | undefined {
       return getFeatureOptionsAs<XxxFeatureOptions>(
         config,
         '@supramark/feature-xxx',
       );
     }
     ```

> 这一阶段主要是“规范化”：让 Feature 在类型系统和文档中是完整、自洽的，不急着改运行时。

---

## 4. 接入 core：AST 类型与 Markdown 解析

### 4.1 新增或扩展 AST 节点

如果 Feature 需要**新节点类型**（例如 `html_page`）：

1. 在 `packages/core/src/ast.ts` 中：
   - 把新类型加入 `SupramarkNodeType` union；
   - 定义对应 interface（如 `SupramarkHtmlPageNode`）；
   - 将其纳入 `SupramarkBlockNode` / `SupramarkInlineNode` 等 union 中。
2. 在 `docs/architecture/ast-spec.md` 中补充节点说明与示例。

如果只是复用现有节点（如 `diagram` 的新引擎），可以略过这一步。

### 4.2 `createMarkdownIt`：注册所需插件 / 容器

在 `packages/core/src/plugin.ts` 的 `createMarkdownIt(config)` 中：

- 使用 `isFeatureEnabled` / `getFeatureOptionsAs` 判断 Feature 是否启用；
- 根据 Feature 注册对应 markdown-it 插件或容器，例如：

```ts
// 示例：Admonition
if (isFeatureOn('@supramark/feature-admonition')) {
  const adOptions =
    getFeatureOptionsAs<AdmonitionOptions>(config, '@supramark/feature-admonition') ?? {};
  const kinds = adOptions.kinds?.length ? adOptions.kinds : SUPRAMARK_ADMONITION_KINDS;
  for (const kind of kinds) {
    container(md, kind, {});
  }
}

// 示例：HTML Page
if (isFeatureOn('@supramark/feature-html-page')) {
  container(md, 'html', {}); // :::html
}
```

### 4.3 `parseMarkdown`：从 token 映射到 AST

在同一文件中，找到 `export async function parseMarkdown(...)`：

- 对 **块级 token** 在主循环中增加分支；
- 对 **行内 token** 在 `mapInlineTokens` 里增加分支；
- 必要时维护自己的状态（类似 Definition List 的 `currentDefList` / `currentDefItem`）。

示例：HTML Page 容器：

```ts
// parseMarkdown 中
if (token.type === 'container_html_open') {
  insideHtmlContainer = true;
  let html = '';
  if (token.map && token.map.length === 2) {
    const [start, end] = token.map;
    const innerStart = start + 1;
    const innerEnd = end - 1 > innerStart ? end - 1 : end;
    html = sourceLines.slice(innerStart, innerEnd).join('\n');
  }
  const htmlPage: SupramarkHtmlPageNode = { type: 'html_page', html };
  const parentForHtml = stack[stack.length - 1];
  parentForHtml.children.push(htmlPage);
  continue;
}
if (token.type === 'container_html_close') {
  insideHtmlContainer = false;
  continue;
}
if (insideHtmlContainer) {
  continue; // 容器内部 token 已由 html_page 节点承载
}
```

完成后，重新构建 core：

```bash
npm run build --workspace @supramark/core
```

---

## 5. 接入 React Native 渲染（@supramark/rn）

主入口在 `packages/rn/src/Supramark.tsx`。

1. 引入新的 AST 节点类型 / 配置 helper：
   ```ts
   import type { SupramarkHtmlPageNode } from '@supramark/core';
   ```
2. 如需要宿主参与，扩展 `Supramark` 组件 props，如：
   ```ts
   interface SupramarkProps {
     // ...
     onOpenHtmlPage?: (node: SupramarkHtmlPageNode) => void;
   }
   ```
3. 在 `renderNode` 中增加对应 `case`，结合 Feature 配置决定渲染方式或降级：
   ```tsx
   case 'html_page': {
     const htmlPage = node as SupramarkHtmlPageNode;
     const title = htmlPage.title || '[HTML 页面]';
     const content = (
       <View style={styles.listItem}>
         <Text style={[styles.listItemText, { fontWeight: '600' }]}>{title}</Text>
         <Text style={styles.listItemText}>
           点击卡片以在独立容器中打开 HTML 页面（需要宿主实现 onOpenHtmlPage 回调）。
         </Text>
       </View>
     );
     if (!onOpenHtmlPage) return <View key={key}>{content}</View>;
     return (
       <TouchableOpacity key={key} onPress={() => onOpenHtmlPage(htmlPage)}>
         {content}
       </TouchableOpacity>
     );
   }
   ```

> 原则：**Feature 关闭或宿主未提供能力时，优雅降级**（退回普通文本 / 代码块），而不是抛异常。

---

## 6. 接入 Web 渲染（@supramark/web）

类似地，在 `packages/web/src/Supramark.tsx` 中：

1. 引入节点类型与配置 helper；
2. 扩展 props（如 `onOpenHtmlPage`、`diagramConfig`）；
3. 在 `renderNode` / `renderInlineNode` 中增加新 `case`：
   - 直接渲染为 DOM；
   - 或渲染为带 `data-*` 标记的占位元素，由浏览器脚本（如 `@supramark/web-diagram`、`mathSupport.ts`）完成真实渲染。

示例：diagram 占位：

```tsx
case 'diagram': {
  const diagram = node as SupramarkDiagramNode;
  return (
    <div key={key} data-suprimark-diagram={diagram.engine} className={classNames.diagram}>
      <pre className={classNames.diagramPre}>
        <code className={classNames.diagramCode}>{diagram.code}</code>
      </pre>
    </div>
  );
}
```

对于需要额外脚本的 Feature（如 Math / 各类图表），通常会在对应 Web 包中提供 helper，例如：

- `@supramark/web-diagram`：`buildDiagramSupportScripts()`
- `@supramark/web`：`mathSupport.ts` 自动注入 KaTeX。

---

## 7. 配置桥接与 FeatureRegistry

现在所有 Feature 都通过统一的配置桥接：

- 在 **core** 中：`isFeatureEnabled` / `getFeatureOptionsAs` 决定解析行为；
- 在 **RN/Web 渲染** 中：`isFeatureGroupEnabled` / `getFeatureOptionsAs` 控制渲染与降级。

在应用层或示例中，推荐使用各 Feature 包提供的强类型 helper，而不是手写裸对象：

```ts
import {
  createCoreMarkdownFeatureConfig,
} from '@supramark/feature-core-markdown';
import {
  createGfmFeatureConfig,
} from '@supramark/feature-gfm';
import {
  createAdmonitionFeatureConfig,
} from '@supramark/feature-admonition';

const BASE_CONFIG: SupramarkConfig = {
  features: [
    createCoreMarkdownFeatureConfig(true),
    createGfmFeatureConfig(true, { tables: true, taskListItems: true, strikethrough: false }),
    createAdmonitionFeatureConfig(true, { kinds: ['note', 'warning'] }),
    // ...
  ],
  diagram: {
    defaultTimeoutMs: 10000,
    defaultCache: { enabled: true, maxSize: 100, ttl: 300000 },
  },
};
```

> 目标：**业务代码只看见强类型配置，不直接操作 `unknown` 或随意字符串。**

---

## 8. 示例与文档

### 8.1 Feature 内示例

在 Feature 包中添加 `src/examples.ts`：

```ts
import type { ExampleDefinition } from '@supramark/core';

export const htmlPageExamples: ExampleDefinition[] = [
  {
    name: 'HTML Page 卡片',
    description: '使用 :::html 容器定义独立 HTML 页面，在 Markdown 中以卡片形式呈现。',
    markdown: `
:::html
<!doctype html>
<html>...</html>
:::
    `.trim(),
  },
];
```

在根目录的 `demos.ts` / `demos.mjs` 中汇总：

```ts
import { htmlPageExamples } from '@supramark/feature-html-page';

export const DEMOS: DemoItem[] = [
  // ...
  ...htmlPageExamples.map(ex => ({ ...ex, id: 'html-page' })),
];
```

React Native / React Web 示例中通过菜单展示这些 demo。

### 8.2 文档

为新 Feature 补充文档：

- `docs/features/xxx.md`：语法 / AST / 配置 / 示例；
- 如涉及 AST 变更：更新 `docs/architecture/ast-spec.md`；
- 如涉及 Feature 配置：在 `docs/FEATURE_LIFECYCLE_AND_CONFIG.md` 中补充；
- 如有特殊运行时约束（例如 Html Page 需要宿主提供 WebView），在文档中明确写出。

---

## 9. 测试与质量保证

1. 在 `__tests__/feature.test.ts` 中，至少覆盖：
   - Feature metadata / syntax.ast 定义；
   - selector 行为；
   - 配置 helper（`createXxxFeatureConfig` / `getXxxFeatureOptions`）。
2. 如有 core 解析逻辑变更，可以在 `@supramark/core` 的测试中增加快照或用例。
3. 运行测试与质量检查：

```bash
npm run test:core
npm run test:features
npm run lint:features
npm run quality
```

更多细节参考 `docs/FEATURE_QUALITY_ASSURANCE.md`。

---

## 10. 进阶：让 Feature 真正“驱动解析管线”

目前的设计是：

- Feature 负责：**规范 + 配置 + 能力发现**；
- `packages/core/src/plugin.ts` 负责：具体的 MarkdownIt 插件注册与 token→AST 映射（手写逻辑）。

未来可以逐步演进为：

- 在 Feature 中声明 MarkdownIt hook（如 container / block / inline 处理器）；
- 由 `FeatureRegistry` 统一读取这些 hook，并在 `createMarkdownIt` / `parseMarkdown` 中自动注册；
- 解析管线不再显式知道某个 Feature 的名字，只通过“谁注册了什么 hook”工作。

这类能力会在后续版本逐步引入；当前阶段建议先严格按照本指南的步骤实现功能，优先保证：

- AST / 配置 / 行为在 Feature 维度上是完整、自洽的；
- RN / Web 两端都有清晰、可演示的默认实现与降级路径；
- 所有新功能都走统一的 Feature Interface，而不是散落的特例代码。
