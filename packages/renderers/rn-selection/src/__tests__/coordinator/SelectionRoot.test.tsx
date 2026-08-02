import { afterEach, describe, expect, mock, test } from 'bun:test';
import React, { useEffect } from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import type { SupramarkNode } from '@supramark/core';
import type { SelectionUnit } from '../../model';
import type { SelectionStore } from '../../coordinator/state';

mock.module('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { SelectionRoot } = await import('../../coordinator/SelectionRoot');
const { useSelectionContext } = await import('../../coordinator/useDocumentSelection');

const NODE = { type: 'text', value: 'hello' } as SupramarkNode;

const UNITS: SelectionUnit[] = [
  {
    kind: 'text',
    unitId: 'p1#0',
    nodeId: 'p1',
    text: 'hello',
    node: NODE,
  },
];

function eventAt(x: number, y: number) {
  return {
    nativeEvent: {
      locationX: x,
      locationY: y,
      // Deliberately wrong. The root should use local touch coordinates when
      // RN supplies them, so a stale measured window origin cannot skew a touch
      // after a ScrollView moves.
      pageX: 9999,
      pageY: 9999,
    },
  };
}

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  if (renderer !== null) {
    act(() => {
      renderer?.unmount();
    });
  }
  renderer = null;
});

function renderSelectedRoot(props: { gestures?: boolean } = {}) {
  let store: SelectionStore | null = null;

  const RegisterBlock: React.FC = () => {
    const ctx = useSelectionContext();
    useEffect(() => {
      store = ctx.store;
      return ctx.registerBlock({
        nodeId: 'p1',
        unitIds: ['p1#0'],
        kind: 'text',
        rect: { x: 10, y: 100, w: 60, h: 20 },
      });
    }, [ctx]);
    return null;
  };

  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <SelectionRoot
        units={UNITS}
        overlay={false}
        handles={false}
        toolbar={false}
        gestures={props.gestures}
      >
        <RegisterBlock />
      </SelectionRoot>
    );
  });
  renderer = r;

  if (store === null) throw new Error('test did not capture the selection store');
  act(() => {
    store.beginAt({ nodeId: 'p1', unitId: 'p1#0', offset: 0 });
    store.extendTo({ nodeId: 'p1', unitId: 'p1#0', offset: 5 });
    store.commit();
  });

  return r.root.findByType('View' as unknown as React.ElementType);
}

describe('SelectionRoot responder negotiation', () => {
  test('claims a handle touch at start before the gesture becomes active', () => {
    const root = renderSelectedRoot();

    expect(root.props.onStartShouldSetResponder(eventAt(10, 94))).toBe(true);
  });

  test('does not claim an ordinary selected-text touch at start', () => {
    const root = renderSelectedRoot();

    expect(root.props.onStartShouldSetResponder(eventAt(40, 110))).toBe(false);
  });

  test('honours gestures=false even over a handle', () => {
    const root = renderSelectedRoot({ gestures: false });

    expect(root.props.onStartShouldSetResponder(eventAt(10, 94))).toBe(false);
  });
});
