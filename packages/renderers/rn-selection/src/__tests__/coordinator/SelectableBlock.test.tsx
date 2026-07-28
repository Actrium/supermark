import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';

// react-native's JS entry contains Flow syntax bun cannot load, and the
// vendored native component needs a real native view; both are mocked as host
// strings so react-test-renderer can render the tree and we can read props off
// it. bun's `mock.module` registry is process-wide, so both mocks live here,
// in the only file that renders React.
mock.module('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
}));
mock.module('@boomsi/react-native-selectable-text', () => ({
  SelectableRichText: 'SelectableRichText',
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { SelectableBlock } = await import('../../coordinator/SelectableBlock');
const { SelectionContext } = await import('../../coordinator/SelectionContext');
const { SelectionRegistry } = await import('../../coordinator/registry');

type ContextValue = React.ContextType<typeof SelectionContext>;
type SelectionUnitLike = Parameters<InstanceType<typeof SelectionRegistry>['setUnits']>[0][number];

// A text unit whose `node` is never inspected by the registry or the block.
const textUnit = (unitId: string, text: string): SelectionUnitLike =>
  ({
    kind: 'text',
    unitId,
    nodeId: 'p1',
    text,
    node: { type: 'text', value: text },
  }) as SelectionUnitLike;

function makeContext(units: SelectionUnitLike[]): NonNullable<ContextValue> {
  const registry = new SelectionRegistry(units);
  return {
    registry,
    store: {} as NonNullable<ContextValue>['store'],
    registerBlock: block => {
      const registered = registry.register(block);
      return () => registry.unregister(block.nodeId, registered);
    },
    updateLayout: (nodeId, rect) => registry.updateLayout(nodeId, rect),
    updateUnits: (nodeId, unitIds) => registry.updateUnits(nodeId, unitIds),
    createBlockSink: () => ({}),
  };
}

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  renderer = null;
});

function renderBlock(
  children: React.ReactNode = 'hello',
  units: SelectionUnitLike[] = [textUnit('p1#0', 'hello')]
): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <SelectionContext.Provider value={makeContext(units)}>
        <SelectableBlock nodeId="p1" unitIds={['p1#0']}>
          {children}
        </SelectableBlock>
      </SelectionContext.Provider>
    );
  });
  renderer = r;
  return r;
}

describe('SelectableBlock native props', () => {
  test('does not force `selectable` on the vendored view', () => {
    const r = renderBlock();
    const native = r.root.findByType('SelectableRichText' as unknown as React.ElementType);

    // The vendored component defaults `selectable` to false on purpose: with it
    // on, UITextView / Android TextView run their own long-press word selection
    // alongside `onTextLongPress`, painting a second native highlight under the
    // coordinator overlay. The commands turn it on transiently instead
    // (`selectTextRangeWithStart` / `clearTextSelection`), so passing it here
    // would defeat that discipline. Assert the prop is absent, not merely
    // falsy — passing `selectable={false}` explicitly would also be wrong,
    // because it would override a future default change.
    expect('selectable' in native.props).toBe(false);

    // Sanity: the rest of the wiring is still attached, so this is not passing
    // because the component failed to render.
    expect(typeof native.props.onTextLongPress).toBe('function');
    expect(typeof native.props.onMenuAction).toBe('function');
    expect(renderer).not.toBeNull();
  });
});

describe('SelectableBlock dev-mode text invariant', () => {
  const realDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  const realWarn = console.warn;

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = realDev;
    console.warn = realWarn;
  });

  function captureWarnings(fn: () => void): string[] {
    const seen: string[] = [];
    console.warn = (...args: unknown[]) => {
      seen.push(args.map(String).join(' '));
    };
    fn();
    return seen;
  }

  test('warns when the rendered text does not match the units summed length', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    // The host renders a bullet the units do not contain: every native offset
    // past it is shifted by two characters.
    const warnings = captureWarnings(() =>
      renderBlock('\u2022 hello', [textUnit('p1#0', 'hello')])
    );
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('SelectableBlock "p1"');
    expect(warnings[0]).toContain('sum to 5');
    expect(warnings[0]).toContain('renders 7');
  });

  test('stays silent when they match', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warnings = captureWarnings(() => renderBlock('hello', [textUnit('p1#0', 'hello')]));
    expect(warnings).toEqual([]);
  });

  test('stays silent in production', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const warnings = captureWarnings(() =>
      renderBlock('\u2022 hello', [textUnit('p1#0', 'hello')])
    );
    expect(warnings).toEqual([]);
  });

  test('stays silent when a unit is not in the stream yet', () => {
    // The block re-rendered before the root's `setUnits` effect: there is
    // nothing to compare against, and warning here would be pure noise.
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warnings = captureWarnings(() => renderBlock('hello', []));
    expect(warnings).toEqual([]);
  });
});
