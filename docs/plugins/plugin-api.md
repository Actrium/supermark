# Plugin API 文档

本文档介绍如何为 Supramark 开发插件。

## 概览

Supramark 插件系统允许你在 Markdown 解析过程中转换 AST、添加自定义节点类型，或为现有节点添加额外的数据。

### 核心概念

- **插件（Plugin）**：实现 `SupramarkPlugin` 接口的对象
- **AST 转换（Transform）**：在解析后修改抽象语法树
- **插件依赖（Dependencies）**：声明插件间的执行顺序
- **共享数据（Shared Data）**：插件间通过 `context.data` 共享信息

---

## 快速开始

### 最简单的插件

```typescript
import type { SupramarkPlugin } from '@supramark/core';

const myFirstPlugin: SupramarkPlugin = {
  name: 'my-first-plugin',
  transform(root, context) {
    console.log('插件执行！');
    console.log('Markdown 源文本:', context.source);
    console.log('AST 根节点:', root);
  }
};
```

### 使用插件

```typescript
import { parseMarkdown } from '@supramark/core';

const markdown = `# Hello World`;

const ast = await parseMarkdown(markdown, {
  plugins: [myFirstPlugin]
});
```

---

## 插件接口

### SupramarkPlugin

```typescript
export interface SupramarkPlugin {
  /**
   * 插件名称，必须唯一。
   * 推荐使用 npm 包名格式。
   */
  name: string;

  /**
   * 插件版本（可选）。
   */
  version?: string;

  /**
   * 插件依赖列表（可选）。
   * 列出此插件依赖的其他插件名称。
   */
  dependencies?: string[];

  /**
   * AST 转换钩子。
   * 在 markdown 解析为 AST 后执行。
   */
  transform?(root: SupramarkRootNode, context: SupramarkParseContext): void | Promise<void>;
}
```

### SupramarkParseContext

```typescript
export interface SupramarkParseContext {
  /**
   * 原始 markdown 文本。
   */
  source: string;

  /**
   * 插件共享数据存储。
   * 插件可以在这里存储和读取数据，用于插件间通信。
   */
  data: Record<string, unknown>;
}
```

---

## 开发插件

### 1. 遍历 AST

插件最常见的操作是遍历 AST 并修改节点。

```typescript
const addIdToHeadingsPlugin: SupramarkPlugin = {
  name: 'add-id-to-headings',
  transform(root, context) {
    let headingIndex = 0;

    function visit(node: SupramarkNode) {
      if (node.type === 'heading') {
        // 为标题添加 ID
        if (!node.data) node.data = {};
        node.data.id = `heading-${++headingIndex}`;
      }

      // 递归遍历子节点
      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    }

    root.children.forEach(visit);
  }
};
```

### 2. 添加自定义节点

插件可以在 AST 中添加新的节点：

```typescript
const addFooterPlugin: SupramarkPlugin = {
  name: 'add-footer',
  transform(root, context) {
    // 在文档末尾添加一个段落
    root.children.push({
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: '本文档由 Supramark 生成'
        }
      ]
    });
  }
};
```

### 3. 修改现有节点

插件可以修改或删除现有节点：

```typescript
const uppercaseHeadingsPlugin: SupramarkPlugin = {
  name: 'uppercase-headings',
  transform(root, context) {
    function visit(node: SupramarkNode) {
      if (node.type === 'heading') {
        // 将标题文本转为大写
        node.children.forEach(child => {
          if (child.type === 'text') {
            child.value = child.value.toUpperCase();
          }
        });
      }

      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    }

    root.children.forEach(visit);
  }
};
```

### 4. 插件间通信

插件可以通过 `context.data` 共享数据：

```typescript
// 插件 A：收集所有标题
const collectHeadingsPlugin: SupramarkPlugin = {
  name: 'collect-headings',
  transform(root, context) {
    const headings: string[] = [];

    function visit(node: SupramarkNode) {
      if (node.type === 'heading') {
        const text = node.children
          .filter(child => child.type === 'text')
          .map(child => (child as SupramarkTextNode).value)
          .join('');
        headings.push(text);
      }

      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    }

    root.children.forEach(visit);

    // 存储到共享数据
    context.data.headings = headings;
  }
};

// 插件 B：使用插件 A 收集的数据
const tocPlugin: SupramarkPlugin = {
  name: 'toc-plugin',
  dependencies: ['collect-headings'], // 确保在 collect-headings 之后执行
  transform(root, context) {
    const headings = context.data.headings as string[] || [];

    if (headings.length === 0) return;

    // 在文档开头插入目录
    const tocItems = headings.map(heading => ({
      type: 'list_item' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [
            {
              type: 'text' as const,
              value: heading
            }
          ]
        }
      ]
    }));

    root.children.unshift({
      type: 'list',
      ordered: false,
      start: null,
      tight: undefined,
      children: tocItems
    });
  }
};
```

---

## 插件依赖

### 声明依赖

如果你的插件依赖其他插件，使用 `dependencies` 字段：

```typescript
const enhancedGfmPlugin: SupramarkPlugin = {
  name: 'enhanced-gfm',
  dependencies: ['gfm', 'emoji'], // 必须先执行 gfm 和 emoji 插件
  transform(root, context) {
    // 在 GFM 和 Emoji 插件之后执行
  }
};
```

### 依赖排序

Supramark 会自动对插件进行拓扑排序，确保：

1. 依赖的插件先执行
2. 检测循环依赖并抛出错误
3. 检测缺失的依赖并抛出错误

```typescript
// 使用示例
parseMarkdown(markdown, {
  plugins: [
    enhancedGfmPlugin,  // 依赖 gfm 和 emoji
    emojiPlugin,        // 无依赖
    gfmPlugin           // 无依赖
  ]
});

// 实际执行顺序：
// 1. gfmPlugin
// 2. emojiPlugin
// 3. enhancedGfmPlugin
```

---

## 异步插件

插件的 `transform` 方法支持异步操作：

```typescript
const fetchMetadataPlugin: SupramarkPlugin = {
  name: 'fetch-metadata',
  async transform(root, context) {
    // 异步获取数据
    const metadata = await fetch('https://api.example.com/metadata')
      .then(res => res.json());

    // 将元数据存储到共享数据
    context.data.metadata = metadata;
  }
};
```

---

## 最佳实践

### 1. 命名规范

- 使用清晰的、描述性的插件名称
- 推荐格式：
  - `@supramark/plugin-xxx` （官方插件）
  - `supramark-plugin-xxx` （社区插件）
  - `my-company-supramark-xxx` （公司内部插件）

### 2. 避免副作用

插件应该只修改 AST，避免其他副作用：

```typescript
// ❌ 不好：修改全局状态
const badPlugin: SupramarkPlugin = {
  name: 'bad-plugin',
  transform(root, context) {
    globalThis.someGlobalVar = 'modified'; // 不要这样做！
  }
};

// ✅ 好：只修改 AST 或 context.data
const goodPlugin: SupramarkPlugin = {
  name: 'good-plugin',
  transform(root, context) {
    context.data.myData = 'some value';
    root.children.push(/* ... */);
  }
};
```

### 3. 性能考虑

- 避免不必要的遍历
- 尽量减少深度递归
- 对大文档进行性能测试

```typescript
// ❌ 低效：多次遍历
const inefficientPlugin: SupramarkPlugin = {
  name: 'inefficient',
  transform(root, context) {
    // 第一次遍历
    root.children.forEach(node => {
      if (node.type === 'heading') {
        // ...
      }
    });

    // 第二次遍历
    root.children.forEach(node => {
      if (node.type === 'paragraph') {
        // ...
      }
    });
  }
};

// ✅ 高效：一次遍历
const efficientPlugin: SupramarkPlugin = {
  name: 'efficient',
  transform(root, context) {
    root.children.forEach(node => {
      if (node.type === 'heading') {
        // ...
      } else if (node.type === 'paragraph') {
        // ...
      }
    });
  }
};
```

### 4. 错误处理

优雅地处理错误，避免破坏整个解析流程：

```typescript
const robustPlugin: SupramarkPlugin = {
  name: 'robust-plugin',
  transform(root, context) {
    try {
      // 可能抛出错误的操作
      root.children.forEach(node => {
        if (node.type === 'heading') {
          // ...
        }
      });
    } catch (error) {
      console.error('Plugin error:', error);
      // 可选：将错误信息存储到 context.data
      context.data.errors = context.data.errors || [];
      (context.data.errors as Error[]).push(error);
    }
  }
};
```

### 5. 文档和示例

为你的插件提供完整的文档：

- README.md：功能说明、安装方法、基础用法
- 示例代码：常见用例
- TypeScript 类型定义
- 测试用例

---

## 工具函数

### 创建辅助函数

为常见操作创建辅助函数：

```typescript
// 辅助函数：遍历 AST
function walk(
  node: SupramarkNode,
  visitor: (node: SupramarkNode) => void
) {
  visitor(node);
  if ('children' in node && Array.isArray(node.children)) {
    node.children.forEach(child => walk(child, visitor));
  }
}

// 使用辅助函数
const myPlugin: SupramarkPlugin = {
  name: 'my-plugin',
  transform(root, context) {
    walk(root, (node) => {
      if (node.type === 'heading') {
        // 处理标题
      }
    });
  }
};
```

---

## 发布插件

### 1. 包结构

```
my-supramark-plugin/
├── src/
│   └── index.ts
├── dist/
│   ├── index.js
│   └── index.d.ts
├── package.json
├── README.md
└── tsconfig.json
```

### 2. package.json

```json
{
  "name": "supramark-plugin-my-feature",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@supramark/core": "^0.1.0"
  },
  "keywords": [
    "supramark",
    "plugin",
    "markdown"
  ]
}
```

### 3. 导出插件

```typescript
// src/index.ts
import type { SupramarkPlugin } from '@supramark/core';

export function myFeaturePlugin(options?: MyOptions): SupramarkPlugin {
  return {
    name: 'supramark-plugin-my-feature',
    version: '1.0.0',
    transform(root, context) {
      // 插件逻辑
    }
  };
}

export default myFeaturePlugin;
```

---

## 示例插件

### 统计字数插件

```typescript
const wordCountPlugin: SupramarkPlugin = {
  name: 'word-count',
  transform(root, context) {
    let wordCount = 0;

    function visit(node: SupramarkNode) {
      if (node.type === 'text') {
        const words = node.value.trim().split(/\s+/);
        wordCount += words.length;
      }

      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    }

    root.children.forEach(visit);

    // 存储到共享数据
    context.data.wordCount = wordCount;
  }
};
```

### 代码块语法高亮插件

```typescript
const syntaxHighlightPlugin: SupramarkPlugin = {
  name: 'syntax-highlight',
  transform(root, context) {
    function visit(node: SupramarkNode) {
      if (node.type === 'code' && node.lang) {
        // 在 data 中添加高亮信息
        if (!node.data) node.data = {};
        node.data.highlighted = true;
        node.data.language = node.lang;
      }

      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    }

    root.children.forEach(visit);
  }
};
```

---

## 常见问题

### Q: 插件执行顺序重要吗？

**A:** 是的。如果多个插件修改相同的节点，执行顺序会影响最终结果。使用 `dependencies` 字段明确声明依赖关系。

### Q: 可以删除节点吗？

**A:** 可以。通过过滤 children 数组来删除节点：

```typescript
root.children = root.children.filter(node => node.type !== 'paragraph');
```

### Q: 插件可以访问原始 Markdown 吗？

**A:** 可以，通过 `context.source` 访问。

### Q: 如何调试插件？

**A:** 使用 `console.log` 打印 AST 和中间状态，或使用 Node.js 调试器。

---

## 参考资料

- [AST 规范](../architecture/ast-spec.md)
- [Parsing API 文档](../api/parsing.md)
- [Supramark Core 源码](../../packages/core)

---

## 版本历史

- **v0.1.0** (2025-12-05)
  - 初始版本
  - 插件系统 API 定义
  - 依赖排序功能
  - 共享数据机制
