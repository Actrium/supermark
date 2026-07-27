import { beforeEach, describe, expect, mock, test } from 'bun:test';
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

type ContextValue = React.ContextType<typeof SelectionContext>;

function makeContext(): NonNullable<ContextValue> {
  return {
    registry: {} as NonNullable<ContextValue>['registry'],
    store: {} as NonNullable<ContextValue>['store'],
    registerBlock: () => () => undefined,
    updateLayout: () => undefined,
    updateUnits: () => undefined,
    createBlockSink: () => ({}),
  };
}

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  renderer = null;
});

function renderBlock(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <SelectionContext.Provider value={makeContext()}>
        <SelectableBlock nodeId="p1" unitIds={['p1#0']}>
          hello
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
