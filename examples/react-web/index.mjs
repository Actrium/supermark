import http from 'node:http';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  Supramark,
  parseMarkdown,
  buildDiagramSupportScripts,
  buildMathSupportScripts,
} from '@supramark/web';
import { DEMOS } from '../demos.mjs';
import {
  createCoreMarkdownFeatureConfig,
} from '@supramark/feature-core-markdown';
import {
  createGfmFeatureConfig,
} from '@supramark/feature-gfm';
import {
  createAdmonitionFeatureConfig,
} from '@supramark/feature-admonition';
import {
  createDefinitionListFeatureConfig,
} from '@supramark/feature-definition-list';
import {
  createHtmlPageFeatureConfig,
} from '@supramark/feature-html-page';
import {
  createMapFeatureConfig,
} from '@supramark/feature-map';
import {
  createDiagramVegaLiteFeatureConfig,
} from '@supramark/feature-diagram-vega-lite';
import {
  createDiagramEchartsFeatureConfig,
} from '@supramark/feature-diagram-echarts';

// 统一的 Supramark 配置示例：
// - 展示如何只启用部分 Feature，并通过 options 调整行为；
// - 同时演示 diagram 配置在解析 / 渲染 / 浏览器脚本之间的复用。
const BASE_CONFIG = {
  features: [
    // 基础 Markdown
    createCoreMarkdownFeatureConfig(true),
    // GFM：启用表格和任务列表，关闭删除线
    createGfmFeatureConfig(true, {
      tables: true,
      taskListItems: true,
      strikethrough: false,
    }),
    // 仅允许 note / tip / warning 三类 Admonition
    createAdmonitionFeatureConfig(true, {
      kinds: ['note', 'tip', 'warning'],
    }),
    // 定义列表宽松模式：描述之间增加额外间距
    createDefinitionListFeatureConfig(true, {
      compact: false,
    }),
    // HTML Page：启用 :::html 容器
    createHtmlPageFeatureConfig(true),
    // Map：启用 :::map 容器
    createMapFeatureConfig(true, {
      provider: 'custom',
    }),
    // Diagram：显式启用 Vega-Lite / ECharts 图表特性
    createDiagramVegaLiteFeatureConfig(true),
    createDiagramEchartsFeatureConfig(true),
  ],

  diagram: {
    defaultTimeoutMs: 10000,
    defaultCache: {
      enabled: true,
      maxSize: 50,
      ttl: 300000,
    },
  },
};

async function main() {
  const demosWithAst = [];

  for (const demo of DEMOS) {
    const ast = await parseMarkdown(demo.markdown, { config: BASE_CONFIG });
    demosWithAst.push({ ...demo, ast });
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const server = http.createServer((req, res) => {
    // 解析 URL 参数
    const url = new URL(req.url, `http://localhost:${port}`);
    const demoId = url.searchParams.get('demo');

    // 根据参数决定显示哪个页面
    const activeDemo = demoId ? demosWithAst.find((d) => d.id === demoId) : null;
    const pageHtml = buildReactPage(demosWithAst, activeDemo);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.end(pageHtml);
  });

  server.listen(port, () => {
    console.log(`supramark React Web demo 已启动：http://localhost:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error in react-web demo:', err);
  process.exitCode = 1;
});

function ReactDemoPage({ demos, activeDemo }) {
  const h = React.createElement;

  // 菜单页：显示所有 demo 列表
  if (!activeDemo) {
    return h(
      'html',
      { lang: 'zh-CN' },
      h(
        'head',
        null,
        h('meta', { charSet: 'utf-8' }),
        h('title', null, 'supramark React Web demo（@supramark/web）'),
        h('style', {
          dangerouslySetInnerHTML: {
            __html: `
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 0; }
        .subtitle { color: #666; margin-bottom: 30px; }
        .menu-list { list-style: none; padding: 0; }
        .menu-item { padding: 16px; margin-bottom: 12px; border: 1px solid #eee; border-radius: 8px; cursor: pointer; transition: all 0.2s; text-decoration: none; display: block; color: inherit; }
        .menu-item:hover { background-color: #f5f5f5; border-color: #2f54eb; }
        .menu-item-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #333; }
        .menu-item-desc { font-size: 14px; color: #666; }
      `,
          },
        }),
      ),
      h(
        'body',
        null,
        h(
          'div',
          { className: 'container' },
          h('h1', null, 'supramark React Web demo（@supramark/web）'),
          h('p', { className: 'subtitle' }, '选择要演示的类型，进入详情查看 markdown 与渲染结果。'),
          h(
            'div',
            { className: 'menu-list' },
            ...demos.map((demo) =>
              h(
                'a',
                { key: demo.id, href: `?demo=${demo.id}`, className: 'menu-item' },
                h('div', { className: 'menu-item-title' }, demo.title),
                h('div', { className: 'menu-item-desc' }, demo.description),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // 详情页：显示选中的 demo
  return h(
    'html',
    { lang: 'zh-CN' },
    h(
      'head',
      null,
      h('meta', { charSet: 'utf-8' }),
      h('title', null, `${activeDemo.title} - supramark React Web demo`),
      h('style', {
        dangerouslySetInnerHTML: {
          __html: `
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        .back-link { display: inline-block; color: #2f54eb; text-decoration: none; margin-bottom: 20px; font-size: 14px; }
        .back-link:hover { text-decoration: underline; }
        h1 { color: #333; margin-top: 0; margin-bottom: 8px; }
        .description { color: #666; margin-bottom: 30px; }
        h2 { color: #555; font-size: 16px; font-weight: 600; margin-top: 30px; margin-bottom: 12px; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #eee; }
        code { font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; }
        .render-box { border: 1px solid #eee; padding: 16px; border-radius: 8px; background: #fff; }
      `,
        },
      }),
    ),
    h(
      'body',
      null,
      h(
        'div',
        { className: 'container' },
        h('a', { href: '/', className: 'back-link' }, '‹ 返回目录'),
        h('h1', null, activeDemo.title),
        h('p', { className: 'description' }, activeDemo.description),
        h('h2', null, 'Markdown 源文本'),
        h('pre', null, h('code', null, activeDemo.markdown)),
        h('h2', null, 'React 渲染结果（<Supramark />）'),
        h(
          'div',
          { className: 'render-box' },
          h(Supramark, {
            markdown: activeDemo.markdown,
            ast: activeDemo.ast,
            config: BASE_CONFIG,
          }),
        ),
      ),
    ),
  );
}

function buildReactPage(demos, activeDemo = null) {
  const markup = renderToString(React.createElement(ReactDemoPage, { demos, activeDemo }));
  const scripts =
    buildDiagramSupportScripts(BASE_CONFIG.diagram) + buildMathSupportScripts();
  return '<!DOCTYPE html>' + markup + scripts;
}
