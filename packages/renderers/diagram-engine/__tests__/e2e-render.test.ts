/**
 * End-to-end rendering tests: markdown source → parse → DiagramEngine → SVG/HTML output.
 *
 * Verifies the full pipeline from markdown text through AST to rendered output
 * for every diagram/math feature that produces visual content.
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { parseMarkdown } from '@supramark/core';
import type {
  SupramarkDiagramNode,
  SupramarkMathBlockNode,
  SupramarkMathInlineNode,
} from '@supramark/core';
import { createDiagramEngine, type DiagramEngine } from '../src/index';

let engine: DiagramEngine;

beforeAll(() => {
  engine = createDiagramEngine();
});

// ─── Helpers ─────────────────────────────────────────────────────

function findNode(ast: any, type: string): any {
  for (const child of ast.children) {
    if (child.type === type) return child;
    if (child.children) {
      const found = findNode(child, type);
      if (found) return found;
    }
  }
  return null;
}

function findInlineNode(ast: any, type: string): any {
  for (const child of ast.children) {
    if (child.type === type) return child;
    if (child.children) {
      for (const inline of child.children) {
        if (inline.type === type) return inline;
      }
    }
  }
  return null;
}

// ─── Mermaid ─────────────────────────────────────────────────────

describe('E2E: Mermaid (markdown → SVG)', () => {
  it('flowchart renders to SVG', async () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;
    expect(node).toBeTruthy();
    expect(node.engine).toBe('mermaid');

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
    expect(result.payload).toContain('<svg');
    expect(result.payload).toContain('</svg>');
  });

  it('flowchart LR with labels renders to SVG', async () => {
    const md = '```mermaid\ngraph LR\n  Start[Begin] --> Process[Do Work] --> End[Done]\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });

  it('flowchart with decision renders to SVG', async () => {
    const md = [
      '```mermaid',
      'graph TD',
      '  A{Is valid?} -->|Yes| B[Accept]',
      '  A -->|No| C[Reject]',
      '```',
    ].join('\n');
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });
});

// ─── DOT / Graphviz ──────────────────────────────────────────────

describe('E2E: DOT/Graphviz (markdown → SVG)', () => {
  it('digraph renders to SVG', async () => {
    const md = '```dot\ndigraph { A -> B -> C }\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;
    expect(node).toBeTruthy();
    expect(node.engine).toBe('dot');

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
    expect(result.payload).toContain('<svg');
    expect(result.payload).toContain('</svg>');
  });

  it('graph with attributes renders to SVG', async () => {
    const md = [
      '```dot',
      'digraph G {',
      '  rankdir=LR;',
      '  node [shape=box];',
      '  start -> process -> end;',
      '  start [label="Start", style=filled, fillcolor=lightblue];',
      '  end [label="End", style=filled, fillcolor=lightgreen];',
      '}',
      '```',
    ].join('\n');
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
    expect(result.payload).toContain('Start');
    expect(result.payload).toContain('End');
  });

  it('undirected graph renders to SVG', async () => {
    const md = '```dot\ngraph { A -- B -- C -- A }\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });
});

// ─── ECharts ─────────────────────────────────────────────────────

describe('E2E: ECharts (markdown → SVG)', () => {
  it('line chart renders to SVG', async () => {
    const option = JSON.stringify({
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: [150, 230, 224, 218, 135] }],
    });
    const md = '```echarts\n' + option + '\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;
    expect(node).toBeTruthy();
    expect(node.engine).toBe('echarts');

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
    expect(result.payload).toContain('<svg');
    expect(result.payload).toContain('</svg>');
  });

  it('bar chart renders to SVG', async () => {
    const option = JSON.stringify({
      xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [120, 200, 150, 80] }],
    });
    const md = '```echarts\n' + option + '\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });

  it('pie chart renders to SVG', async () => {
    const option = JSON.stringify({
      series: [
        {
          type: 'pie',
          data: [
            { name: 'Category A', value: 40 },
            { name: 'Category B', value: 35 },
            { name: 'Category C', value: 25 },
          ],
        },
      ],
    });
    const md = '```echarts\n' + option + '\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });
});

// ─── Vega-Lite ───────────────────────────────────────────────────

describe('E2E: Vega-Lite (markdown → SVG)', () => {
  it('bar chart renders to SVG', async () => {
    const spec = JSON.stringify({
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { category: 'A', amount: 28 },
          { category: 'B', amount: 55 },
          { category: 'C', amount: 43 },
        ],
      },
      mark: 'bar',
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'amount', type: 'quantitative' },
      },
    });
    const md = '```vega-lite\n' + spec + '\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;
    expect(node).toBeTruthy();
    expect(node.engine).toBe('vega-lite');

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.format).toBe('svg');
    expect(result.payload).toContain('<svg');
    expect(result.payload).toContain('</svg>');
  });

  it('point chart renders to SVG', async () => {
    const spec = JSON.stringify({
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
          { x: 3, y: 15 },
          { x: 4, y: 25 },
          { x: 5, y: 30 },
        ],
      },
      mark: 'point',
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
      },
    });
    const md = '```vega-lite\n' + spec + '\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });

  it('line chart renders to SVG', async () => {
    const spec = JSON.stringify({
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { date: '2024-01', value: 10 },
          { date: '2024-02', value: 30 },
          { date: '2024-03', value: 20 },
        ],
      },
      mark: 'line',
      encoding: {
        x: { field: 'date', type: 'ordinal' },
        y: { field: 'value', type: 'quantitative' },
      },
    });
    const md = '```vega-lite\n' + spec + '\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('<svg');
  });
});

// ─── PlantUML ────────────────────────────────────────────────────

describe('E2E: PlantUML (markdown → SVG)', () => {
  it('sequence diagram parses correctly and render pipeline works', async () => {
    const md = '```plantuml\n@startuml\nAlice -> Bob : Hello\nBob -> Alice : Hi\n@enduml\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;
    expect(node).toBeTruthy();
    expect(node.engine).toBe('plantuml');
    expect(node.code).toContain('Alice');

    // PlantUML depends on external server — verify pipeline, accept either outcome
    const result = await engine.render({
      engine: node.engine,
      code: node.code,
      options: { timeout: 15000 },
    });
    expect(result.engine).toBe('plantuml');
    if (result.success) {
      expect(result.payload).toContain('<svg');
    } else {
      // Server unavailable / returned non-SVG — still a valid error path
      expect(result.error).toBeDefined();
    }
  });
});

// ─── Math (KaTeX) ────────────────────────────────────────────────

describe('E2E: Math/KaTeX (markdown → HTML)', () => {
  it('display math block renders to KaTeX HTML', async () => {
    const md = '$$\n\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'math_block') as SupramarkMathBlockNode;
    expect(node).toBeTruthy();
    expect(node.value).toContain('frac');

    const result = await engine.render({
      engine: 'math',
      code: node.value,
      options: { displayMode: true },
    });
    expect(result.success).toBe(true);
    expect(result.format).toBe('html');
    expect(result.payload).toContain('katex');
  });

  it('inline math renders to KaTeX HTML', async () => {
    const md = 'The formula $E = mc^2$ is famous.';
    const ast = await parseMarkdown(md);
    const node = findInlineNode(ast, 'math_inline') as SupramarkMathInlineNode;
    expect(node).toBeTruthy();
    expect(node.value).toContain('mc^2');

    const result = await engine.render({
      engine: 'math',
      code: node.value,
      options: { displayMode: false },
    });
    expect(result.success).toBe(true);
    expect(result.format).toBe('html');
    expect(result.payload).toContain('katex');
  });

  it('summation formula renders correctly', async () => {
    const md = '$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'math_block') as SupramarkMathBlockNode;

    const result = await engine.render({
      engine: 'math',
      code: node.value,
      options: { displayMode: true },
    });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('katex');
    expect(result.payload.length).toBeGreaterThan(100);
  });

  it('matrix renders correctly', async () => {
    const md = '$$\n\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\n$$';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'math_block') as SupramarkMathBlockNode;

    const result = await engine.render({
      engine: 'math',
      code: node.value,
      options: { displayMode: true },
    });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('katex');
  });

  it('integral renders correctly', async () => {
    const md = '$$\n\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n$$';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'math_block') as SupramarkMathBlockNode;

    const result = await engine.render({
      engine: 'math',
      code: node.value,
      options: { displayMode: true },
    });
    expect(result.success).toBe(true);
    expect(result.payload).toContain('katex');
  });
});

// ─── Error cases (E2E) ──────────────────────────────────────────

describe('E2E: Error handling', () => {
  it('invalid mermaid syntax returns structured error', async () => {
    const md = '```mermaid\nthis is completely invalid!!!\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(false);
    expect(result.format).toBe('error');
    expect(result.error).toBeDefined();
  });

  it('invalid DOT syntax returns structured error', async () => {
    const md = '```dot\nnot valid dot {{{ bad\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(false);
    expect(result.format).toBe('error');
  });

  it('invalid echarts JSON returns structured error', async () => {
    const md = '```echarts\nnot valid json at all\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(false);
    expect(result.format).toBe('error');
    expect(result.payload).toContain('parse');
  });

  it('invalid vega-lite JSON returns structured error', async () => {
    const md = '```vega-lite\n{broken json\n```';
    const ast = await parseMarkdown(md);
    const node = findNode(ast, 'diagram') as SupramarkDiagramNode;

    const result = await engine.render({ engine: node.engine, code: node.code });
    expect(result.success).toBe(false);
    expect(result.format).toBe('error');
  });
});
