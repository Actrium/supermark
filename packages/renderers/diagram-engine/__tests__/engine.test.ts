import { describe, it, expect, beforeAll } from 'bun:test';
import { createDiagramEngine, DiagramEngine } from '../src/index';
import type { DiagramRenderResult } from '../src/types';

describe('DiagramEngine', () => {
  describe('createDiagramEngine', () => {
    it('creates an engine instance', () => {
      const engine = createDiagramEngine();
      expect(engine).toBeInstanceOf(DiagramEngine);
    });

    it('accepts custom options', () => {
      const engine = createDiagramEngine({
        timeout: 5000,
        cache: { maxSize: 50, ttl: 60000 },
      });
      expect(engine).toBeInstanceOf(DiagramEngine);
      const stats = engine.getCacheStats();
      expect(stats.maxSize).toBe(50);
    });
  });

  describe('cache', () => {
    it('reports empty cache initially', () => {
      const engine = createDiagramEngine();
      const stats = engine.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('clears cache', async () => {
      const engine = createDiagramEngine();
      // render something to populate cache
      await engine.render({ engine: 'math', code: 'x^2', options: { displayMode: false } });
      expect(engine.getCacheStats().size).toBeGreaterThan(0);
      engine.clearCache();
      expect(engine.getCacheStats().size).toBe(0);
    });

    it('returns cache hit on repeat request', async () => {
      const engine = createDiagramEngine();
      const r1 = await engine.render({
        engine: 'math',
        code: 'a+b',
        options: { displayMode: false },
      });
      expect(r1.success).toBe(true);
      expect(r1.performance?.cacheHit).toBe(false);

      const r2 = await engine.render({
        engine: 'math',
        code: 'a+b',
        options: { displayMode: false },
      });
      expect(r2.success).toBe(true);
      expect(r2.performance?.cacheHit).toBe(true);
    });

    it('does not cache when disabled', async () => {
      const engine = createDiagramEngine({ cache: { enabled: false } });
      await engine.render({ engine: 'math', code: 'y', options: { displayMode: false } });
      expect(engine.getCacheStats().size).toBe(0);
    });
  });

  describe('unsupported engine', () => {
    it('returns error for unknown engine', async () => {
      const engine = createDiagramEngine();
      const result = await engine.render({ engine: 'nonexistent', code: 'test' });
      expect(result.success).toBe(false);
      expect(result.format).toBe('error');
      expect(result.error?.code).toBe('render_error');
      expect(result.payload).toContain('Unsupported diagram engine');
    });
  });

  describe('engine: math (KaTeX)', () => {
    let engine: DiagramEngine;
    beforeAll(() => {
      engine = createDiagramEngine();
    });

    it('renders inline math to HTML', async () => {
      const result = await engine.render({
        engine: 'math',
        code: 'x^2',
        options: { displayMode: false },
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('html');
      expect(result.payload).toContain('katex');
      expect(result.payload).toContain('x');
    });

    it('renders display math to HTML', async () => {
      const result = await engine.render({
        engine: 'math',
        code: '\\frac{a}{b}',
        options: { displayMode: true },
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('html');
      expect(result.payload).toContain('katex');
      expect(result.payload).toContain('frac');
    });

    it('renders complex equation', async () => {
      const result = await engine.render({
        engine: 'math',
        code: 'E = mc^2',
        options: { displayMode: true },
      });
      expect(result.success).toBe(true);
      expect(result.payload.length).toBeGreaterThan(50);
    });

    it('renders summation', async () => {
      const result = await engine.render({
        engine: 'math',
        code: '\\sum_{i=1}^{n} x_i',
        options: { displayMode: true },
      });
      expect(result.success).toBe(true);
      expect(result.payload).toContain('katex');
    });

    it('handles invalid TeX gracefully (throwOnError: false)', async () => {
      const result = await engine.render({
        engine: 'math',
        code: '\\invalid{',
        options: { displayMode: false },
      });
      // KaTeX with throwOnError:false still returns HTML (with error span)
      expect(result.success).toBe(true);
      expect(result.payload).toBeTruthy();
    });

    it('includes performance metrics', async () => {
      const result = await engine.render({
        engine: 'math',
        code: '\\alpha + \\beta',
        options: { displayMode: false },
      });
      expect(result.performance).toBeDefined();
      expect(typeof result.performance!.renderTime).toBe('number');
      expect(typeof result.performance!.cacheHit).toBe('boolean');
    });
  });

  describe('engine: mermaid (beautiful-mermaid)', () => {
    let engine: DiagramEngine;
    beforeAll(() => {
      engine = createDiagramEngine();
    });

    it('renders a flowchart to SVG', async () => {
      const result = await engine.render({
        engine: 'mermaid',
        code: 'graph TD\n  A --> B',
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
      expect(result.payload).toContain('</svg>');
    });

    it('renders a more complex flowchart', async () => {
      const result = await engine.render({
        engine: 'mermaid',
        code: 'graph LR\n  A[Start] --> B{Decision}\n  B -->|Yes| C[OK]\n  B -->|No| D[Fail]',
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
    });

    it('handles invalid mermaid syntax', async () => {
      const result = await engine.render({
        engine: 'mermaid',
        code: 'this is not valid mermaid syntax at all!!!',
      });
      expect(result.success).toBe(false);
      expect(result.format).toBe('error');
    });
  });

  describe('engine: dot (Graphviz via @viz-js/viz)', () => {
    let engine: DiagramEngine;
    beforeAll(() => {
      engine = createDiagramEngine();
    });

    it('renders a simple graph to SVG', async () => {
      const result = await engine.render({
        engine: 'dot',
        code: 'digraph { A -> B }',
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
      expect(result.payload).toContain('</svg>');
    });

    it('renders graphviz alias to SVG', async () => {
      const result = await engine.render({
        engine: 'graphviz',
        code: 'digraph { X -> Y -> Z }',
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
    });

    it('renders a directed graph with labels', async () => {
      const result = await engine.render({
        engine: 'dot',
        code: 'digraph G {\n  rankdir=LR;\n  a [label="Hello"];\n  b [label="World"];\n  a -> b;\n}',
      });
      expect(result.success).toBe(true);
      expect(result.payload).toContain('Hello');
      expect(result.payload).toContain('World');
    });

    it('handles invalid DOT syntax', async () => {
      const result = await engine.render({
        engine: 'dot',
        code: 'not valid dot code {{{',
      });
      expect(result.success).toBe(false);
      expect(result.format).toBe('error');
    });
  });

  describe('engine: echarts (SSR mode)', () => {
    let engine: DiagramEngine;
    beforeAll(() => {
      engine = createDiagramEngine();
    });

    it('renders a basic line chart to SVG', async () => {
      const option = {
        xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: [150, 230, 224] }],
      };
      const result = await engine.render({
        engine: 'echarts',
        code: JSON.stringify(option),
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
      expect(result.payload).toContain('</svg>');
    });

    it('renders a bar chart with custom dimensions', async () => {
      const option = {
        xAxis: { type: 'category', data: ['A', 'B', 'C'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [10, 20, 30] }],
      };
      const result = await engine.render({
        engine: 'echarts',
        code: JSON.stringify(option),
        options: { width: 800, height: 500 },
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
    });

    it('handles invalid JSON', async () => {
      const result = await engine.render({
        engine: 'echarts',
        code: 'not json',
      });
      expect(result.success).toBe(false);
      expect(result.format).toBe('error');
      expect(result.payload).toContain('parse');
    });

    it('renders a pie chart', async () => {
      const option = {
        series: [
          {
            type: 'pie',
            data: [
              { name: 'A', value: 40 },
              { name: 'B', value: 30 },
              { name: 'C', value: 30 },
            ],
          },
        ],
      };
      const result = await engine.render({
        engine: 'echarts',
        code: JSON.stringify(option),
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
    });
  });

  describe('engine: vega-lite', () => {
    let engine: DiagramEngine;
    beforeAll(() => {
      engine = createDiagramEngine();
    });

    it('renders a simple bar chart to SVG', async () => {
      const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { a: 'A', b: 28 },
            { a: 'B', b: 55 },
          ],
        },
        mark: 'bar',
        encoding: {
          x: { field: 'a', type: 'nominal' },
          y: { field: 'b', type: 'quantitative' },
        },
      };
      const result = await engine.render({
        engine: 'vega-lite',
        code: JSON.stringify(spec),
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
      expect(result.payload).toContain('<svg');
      expect(result.payload).toContain('</svg>');
    });

    it('renders a point chart', async () => {
      const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
            { x: 5, y: 6 },
          ],
        },
        mark: 'point',
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'y', type: 'quantitative' },
        },
      };
      const result = await engine.render({
        engine: 'vega-lite',
        code: JSON.stringify(spec),
      });
      expect(result.success).toBe(true);
      expect(result.format).toBe('svg');
    });

    it('handles invalid JSON', async () => {
      const result = await engine.render({
        engine: 'vega-lite',
        code: 'not json',
      });
      expect(result.success).toBe(false);
      expect(result.format).toBe('error');
    });
  });

  describe('engine: plantuml', () => {
    let engine: DiagramEngine;
    beforeAll(() => {
      engine = createDiagramEngine();
    });

    // PlantUML requires network access to an external server.
    // Test verifies the render pipeline works; actual success depends on network.
    it('attempts to render via PlantUML server', async () => {
      const result = await engine.render({
        engine: 'plantuml',
        code: '@startuml\nAlice -> Bob : Hello\n@enduml',
        options: { timeout: 15000 },
      });
      expect(result.engine).toBe('plantuml');
      expect(typeof result.id).toBe('string');
      expect(typeof result.success).toBe('boolean');
      // May succeed (SVG), fail (server down/changed), or timeout — all valid
      if (result.success) {
        expect(result.format).toBe('svg');
        expect(result.payload).toContain('<svg');
      } else {
        expect(result.format).toBe('error');
        expect(result.error).toBeDefined();
      }
    });

    it('returns error for non-SVG server response', async () => {
      // Use a server that returns HTML to verify validation
      const result = await engine.render({
        engine: 'plantuml',
        code: '@startuml\nA -> B\n@enduml',
        options: {
          server: 'https://httpbin.org/html',
          timeout: 10000,
        },
      });
      expect(result.success).toBe(false);
      expect(result.format).toBe('error');
    });
  });

  describe('result structure', () => {
    it('always includes id, engine, success, format, payload', async () => {
      const engine = createDiagramEngine();
      const result = await engine.render({
        engine: 'math',
        code: 'x',
        options: { displayMode: false },
      });
      expect(typeof result.id).toBe('string');
      expect(result.engine).toBe('math');
      expect(typeof result.success).toBe('boolean');
      expect(['svg', 'html', 'error']).toContain(result.format);
      expect(typeof result.payload).toBe('string');
    });

    it('error result includes error object', async () => {
      const engine = createDiagramEngine();
      const result = await engine.render({ engine: 'nonexistent', code: 'test' });
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBeDefined();
      expect(typeof result.error!.message).toBe('string');
    });
  });
});
