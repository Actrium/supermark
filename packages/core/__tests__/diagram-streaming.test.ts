import {
  shouldDeferDiagramRender,
  type SupramarkSourceState,
} from '../src/diagram-render-state';
import type { SupramarkDiagramNode } from '../src/ast';

describe('streaming diagram render state', () => {
  const createDiagram = (fenceClosed: boolean): SupramarkDiagramNode => ({
    type: 'diagram',
    engine: 'mermaid',
    code: 'graph TD; A-->B;',
    fence_closed: fenceClosed,
  });

  const expectDeferred = (
    sourceState: SupramarkSourceState,
    fenceClosed: boolean,
    expected: boolean
  ) => {
    expect(shouldDeferDiagramRender(createDiagram(fenceClosed), sourceState)).toBe(expected);
  };

  it('defers an open fence while the source is streaming', () => {
    expectDeferred('streaming', false, true);
  });

  it('renders an explicitly closed fence while the source is streaming', () => {
    expectDeferred('streaming', true, false);
  });

  it('renders an EOF auto-closed fence after the source is complete', () => {
    expectDeferred('complete', false, false);
  });

  it('renders an explicitly closed fence after the source is complete', () => {
    expectDeferred('complete', true, false);
  });
});
