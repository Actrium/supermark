/**
 * Supramark Web ClassName 系统
 *
 * 此文件定义了 Supramark Web 组件的 className 类型和默认值。
 * 用户可以通过传入 classNames prop 来自定义每个元素的 className。
 */

/**
 * Supramark 可自定义的 className 键
 */
export interface SupramarkClassNames {
  // Block elements
  paragraph?: string;
  h1?: string;
  h2?: string;
  h3?: string;
  h4?: string;
  h5?: string;
  h6?: string;

  // Code blocks
  codeBlock?: string; // pre 元素
  code?: string; // code 元素

  // Lists
  listOrdered?: string; // ol 元素
  listUnordered?: string; // ul 元素
  listItem?: string; // li 元素
  taskListItem?: string; // 任务列表的 li
  taskCheckbox?: string; // 任务列表的 checkbox

  // Inline elements
  strong?: string;
  emphasis?: string;
  inlineCode?: string;
  link?: string;
  image?: string;
  delete?: string;

  // Tables
  table?: string;
  tableBody?: string; // tbody 元素
  tableRow?: string; // tr 元素
  tableCell?: string; // td 元素
  tableHeaderCell?: string; // th 元素

  // Diagram
  diagram?: string; // diagram 容器 div
  diagramPre?: string; // diagram 中的 pre
  diagramCode?: string; // diagram 中的 code

  // Container
  root?: string; // 最外层容器
}

/**
 * 默认 className（为空，用户可自由添加）
 */
export const defaultClassNames: SupramarkClassNames = {
  // 默认不添加任何 className，保持原生 HTML 元素
};

/**
 * 合并用户 className 和默认 className
 * @param customClassNames 用户自定义 className
 * @returns 合并后的 className
 */
export function mergeClassNames(customClassNames?: SupramarkClassNames): SupramarkClassNames {
  if (!customClassNames) {
    return defaultClassNames;
  }

  return {
    ...defaultClassNames,
    ...customClassNames,
  };
}

/**
 * Tailwind CSS 主题预设（示例）
 */
export const tailwindClassNames: SupramarkClassNames = {
  root: 'prose prose-slate max-w-none',
  paragraph: 'mb-4 leading-7',
  h1: 'text-4xl font-bold mb-4 mt-6',
  h2: 'text-3xl font-semibold mb-3 mt-5',
  h3: 'text-2xl font-semibold mb-3 mt-4',
  h4: 'text-xl font-medium mb-2 mt-3',
  h5: 'text-lg font-medium mb-2 mt-3',
  h6: 'text-base font-medium mb-2 mt-2',
  codeBlock: 'bg-gray-100 dark:bg-gray-800 rounded-md p-4 mb-4 overflow-x-auto',
  code: 'font-mono text-sm',
  listOrdered: 'list-decimal ml-6 mb-4',
  listUnordered: 'list-disc ml-6 mb-4',
  listItem: 'mb-1',
  taskListItem: 'list-none mb-1',
  taskCheckbox: 'mr-2',
  strong: 'font-bold',
  emphasis: 'italic',
  inlineCode: 'font-mono text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded',
  link: 'text-blue-600 dark:text-blue-400 hover:underline',
  image: 'max-w-full h-auto',
  delete: 'line-through',
  table: 'border-collapse border border-gray-300 dark:border-gray-700 mb-4 w-full',
  tableBody: '',
  tableRow: 'border-b border-gray-300 dark:border-gray-700',
  tableCell: 'border border-gray-300 dark:border-gray-700 px-4 py-2',
  tableHeaderCell:
    'border border-gray-300 dark:border-gray-700 px-4 py-2 bg-gray-100 dark:bg-gray-800 font-semibold',
  diagram: 'mb-4 border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden',
  diagramPre: 'p-4 bg-gray-50 dark:bg-gray-900',
  diagramCode: 'font-mono text-sm',
};

/**
 * 极简主题预设（示例）
 */
export const minimalClassNames: SupramarkClassNames = {
  root: 'supramark',
  paragraph: 'sm-p',
  h1: 'sm-h1',
  h2: 'sm-h2',
  h3: 'sm-h3',
  h4: 'sm-h4',
  h5: 'sm-h5',
  h6: 'sm-h6',
  codeBlock: 'sm-code-block',
  code: 'sm-code',
  listOrdered: 'sm-ol',
  listUnordered: 'sm-ul',
  listItem: 'sm-li',
  taskListItem: 'sm-task-li',
  taskCheckbox: 'sm-checkbox',
  strong: 'sm-strong',
  emphasis: 'sm-em',
  inlineCode: 'sm-inline-code',
  link: 'sm-link',
  image: 'sm-img',
  delete: 'sm-del',
  table: 'sm-table',
  tableBody: 'sm-tbody',
  tableRow: 'sm-tr',
  tableCell: 'sm-td',
  tableHeaderCell: 'sm-th',
  diagram: 'sm-diagram',
  diagramPre: 'sm-diagram-pre',
  diagramCode: 'sm-diagram-code',
};
