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
  PanResponder: {
    create: (config: Record<string, unknown>) => ({
      panHandlers: {
        onStartShouldSetResponder: config.onStartShouldSetPanResponder,
        onStartShouldSetResponderCapture: config.onStartShouldSetPanResponderCapture,
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
        onMoveShouldSetResponderCapture: config.onMoveShouldSetPanResponderCapture,
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
        onResponderTerminate: config.onPanResponderTerminate,
        onResponderTerminationRequest: config.onPanResponderTerminationRequest,
        onShouldBlockNativeResponder: config.onShouldBlockNativeResponder,
      },
    }),
  },
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { SelectionRoot } = await import('../../coordinator/SelectionRoot');
const { DEFAULT_LONG_PRESS_MS } = await import('../../coordinator/gesture');
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

function eventAt(x: number, y: number, location = { x: -500, y: -500 }, timestamp?: number) {
  return {
    nativeEvent: {
      // Deliberately child-space. The root must ignore locationX/Y because RN
      // reports them relative to the deepest target, not SelectionRoot.
      locationX: location.x,
      locationY: location.y,
      pageX: x,
      pageY: y,
      timestamp,
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

function renderRootWithBlock(
  props: { gestures?: boolean; longPressMs?: number; selected?: boolean; handles?: boolean } = {},
  options?: Parameters<typeof create>[1]
) {
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
        handles={props.handles}
        toolbar={false}
        gestures={props.gestures}
        longPressMs={props.longPressMs}
      >
        <RegisterBlock />
      </SelectionRoot>,
      options
    );
  });
  renderer = r;

  if (store === null) throw new Error('test did not capture the selection store');
  if (props.selected !== false) {
    act(() => {
      store.beginAt({ nodeId: 'p1', unitId: 'p1#0', offset: 0 });
      store.extendTo({ nodeId: 'p1', unitId: 'p1#0', offset: 5 });
      store.commit();
    });
  }

  return { root: r.root.findAllByType('View' as unknown as React.ElementType)[0], store };
}

describe('SelectionRoot responder negotiation', () => {
  test('claims a handle touch at start before the gesture becomes active', () => {
    const { root } = renderRootWithBlock();

    expect(root.props.onStartShouldSetResponder(eventAt(10, 94))).toBe(true);
    expect(root.props.onStartShouldSetResponderCapture(eventAt(10, 94))).toBe(false);
  });

  test('claims a selectable block touch so Android delivers long-press responder events', () => {
    const { root } = renderRootWithBlock({ selected: false });

    expect(root.props.onStartShouldSetResponder(eventAt(40, 110))).toBe(true);
    expect(root.props.onStartShouldSetResponderCapture(eventAt(40, 110))).toBe(false);
  });

  test('claims blank root touches so tap-dismiss and blank long-press can run', () => {
    const { root } = renderRootWithBlock({ selected: false });

    expect(root.props.onStartShouldSetResponder(eventAt(40, 200))).toBe(true);
  });

  test('honours gestures=false even over a handle', () => {
    const { root } = renderRootWithBlock({ gestures: false });

    expect(root.props.onStartShouldSetResponder(eventAt(10, 94))).toBe(false);
  });

  test('long press resolves from page coordinates, not child location', async () => {
    const { root, store } = renderRootWithBlock({ longPressMs: 1, selected: false });

    await act(async () => {
      root.props.onResponderGrant(eventAt(40, 110));
      await new Promise(resolve => setTimeout(resolve, 5));
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.phase).toBe('selected');
    expect(snapshot.range).toEqual({
      anchor: { nodeId: 'p1', unitId: 'p1#0', offset: 0 },
      focus: { nodeId: 'p1', unitId: 'p1#0', offset: 5 },
    });
  });

  test('blank long press inside a wide block but outside its text line clears selection', async () => {
    let store: SelectionStore | null = null;

    const RegisterWideBlock: React.FC = () => {
      const ctx = useSelectionContext();
      useEffect(() => {
        store = ctx.store;
        return ctx.registerBlock({
          nodeId: 'p1',
          unitIds: ['p1#0'],
          kind: 'text',
          rect: { x: 10, y: 100, w: 300, h: 20 },
          metrics: {
            textLength: 5,
            lines: [{ start: 0, end: 5, visibleEnd: 5, x: 0, y: 0, w: 50, h: 20 }],
          },
        });
      }, [ctx]);
      return null;
    };

    act(() => {
      renderer = create(
        <SelectionRoot units={UNITS} overlay={false} handles={false} toolbar={false} longPressMs={1}>
          <RegisterWideBlock />
        </SelectionRoot>
      );
    });
    if (store === null) throw new Error('test did not capture the selection store');
    act(() => {
      store.beginAt({ nodeId: 'p1', unitId: 'p1#0', offset: 0 });
      store.extendTo({ nodeId: 'p1', unitId: 'p1#0', offset: 5 });
      store.commit();
    });

    const root = renderer.root.findByType('View' as unknown as React.ElementType);
    await act(async () => {
      root.props.onResponderGrant(eventAt(250, 110));
      await new Promise(resolve => setTimeout(resolve, 5));
    });

    expect(store.getSnapshot().range).toBeNull();
    expect(store.getSnapshot().phase).toBe('idle');
  });

  test('touchEnd commits when Android does not deliver responderRelease', async () => {
    const { root, store } = renderRootWithBlock({ longPressMs: 1, selected: false });

    await act(async () => {
      root.props.onResponderGrant(eventAt(40, 110));
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    act(() => {
      root.props.onResponderMove(eventAt(80, 110));
    });

    expect(store.getSnapshot().phase).toBe('selecting');

    act(() => {
      root.props.onTouchEnd(eventAt(80, 110));
    });

    expect(store.getSnapshot().phase).toBe('selected');
  });

  test('uses native event timestamps when Android flushes press callbacks late', () => {
    const { root, store } = renderRootWithBlock({ selected: false });

    act(() => {
      root.props.onResponderGrant(eventAt(40, 110, { x: -500, y: -500 }, 1000));
      root.props.onTouchEnd(eventAt(40, 110, { x: -500, y: -500 }, 1500));
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.phase).toBe('selected');
    expect(snapshot.range).toEqual({
      anchor: { nodeId: 'p1', unitId: 'p1#0', offset: 0 },
      focus: { nodeId: 'p1', unitId: 'p1#0', offset: 5 },
    });
  });

  test('arms the root timer with the gesture default long-press threshold', () => {
    const { root } = renderRootWithBlock({ selected: false });
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const delays: number[] = [];

    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      delays.push(Number(args[1] ?? 0));
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

    try {
      act(() => {
        root.props.onResponderGrant(eventAt(40, 110));
      });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }

    expect(delays).toEqual([DEFAULT_LONG_PRESS_MS]);
  });

  test('does not release a stationary pending long press to the enclosing scroll view', () => {
    const { root } = renderRootWithBlock({ selected: false });

    act(() => {
      root.props.onResponderGrant(eventAt(40, 110));
    });

    expect(root.props.onResponderTerminationRequest(eventAt(40, 110), { dx: 1, dy: 1 })).toBe(
      false
    );
    expect(root.props.onResponderTerminationRequest(eventAt(40, 130), { dx: 0, dy: 20 })).toBe(
      true
    );
  });

  test('blocks native responders while a press is pending or a selection is active', async () => {
    const { root } = renderRootWithBlock({ selected: false, longPressMs: 1 });

    expect(root.props.onShouldBlockNativeResponder()).toBe(false);

    act(() => {
      root.props.onResponderGrant(eventAt(40, 110));
    });
    expect(root.props.onShouldBlockNativeResponder()).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    expect(root.props.onShouldBlockNativeResponder()).toBe(true);

    act(() => {
      root.props.onResponderRelease(eventAt(40, 110));
    });
    expect(root.props.onShouldBlockNativeResponder()).toBe(false);
  });

  test('uses native measure page origin in the same coordinate space as touch pageX/Y', async () => {
    let store: SelectionStore | null = null;

    const RegisterMeasuredBlock: React.FC = () => {
      const ctx = useSelectionContext();
      useEffect(() => {
        store = ctx.store;
        return ctx.registerBlock({
          nodeId: 'p1',
          unitIds: ['p1#0'],
          kind: 'text',
          rect: { x: 10, y: 20, w: 60, h: 20 },
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
          longPressMs={1}
        >
          <RegisterMeasuredBlock />
        </SelectionRoot>,
        {
          createNodeMock: element =>
            element.type === 'View'
              ? {
                  measure: (cb: (...args: number[]) => void) => cb(0, 0, 100, 100, 30, 80),
                }
              : null,
        }
      );
    });
    renderer = r;
    if (store === null) throw new Error('test did not capture the selection store');
    const root = r.root.findByType('View' as unknown as React.ElementType);

    await act(async () => {
      root.props.onLayout({ nativeEvent: { layout: { width: 100, height: 100 } } });
      root.props.onResponderGrant(eventAt(40, 100));
      await new Promise(resolve => setTimeout(resolve, 5));
    });

    expect(store.getSnapshot().phase).toBe('selected');
  });

  test('does not wait for async native measure before arming the long-press timer', () => {
    const { root } = renderRootWithBlock(
      { selected: false },
      {
        createNodeMock: element =>
          element.type === 'View'
            ? {
                measure: () => undefined,
              }
            : null,
      }
    );
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const delays: number[] = [];

    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      delays.push(Number(args[1] ?? 0));
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

    try {
      act(() => {
        root.props.onResponderGrant(eventAt(40, 110));
      });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }

    expect(delays).toEqual([DEFAULT_LONG_PRESS_MS]);
  });

  test('measures block layout against SelectionRoot when a native handle is available', () => {
    let measuredAgainstRoot = false;
    let registry: ReturnType<typeof useSelectionContext>['registry'] | null = null;
    const blockHandle = {
      measureLayout: (
        relativeToNativeNode: unknown,
        onSuccess: (x: number, y: number, width: number, height: number) => void
      ) => {
        measuredAgainstRoot = relativeToNativeNode !== null;
        onSuccess(7, 9, 30, 11);
      },
    };

    const RegisterMeasuredBlock: React.FC = () => {
      const ctx = useSelectionContext();
      useEffect(() => {
        registry = ctx.registry;
        const dispose = ctx.registerBlock({
          nodeId: 'p1',
          unitIds: ['p1#0'],
          kind: 'text',
        });
        ctx.measureLayout?.('p1', blockHandle, { x: 1, y: 2, w: 3, h: 4 });
        return dispose;
      }, [ctx]);
      return null;
    };

    act(() => {
      renderer = create(
        <SelectionRoot units={UNITS} overlay={false} handles={false} toolbar={false}>
          <RegisterMeasuredBlock />
        </SelectionRoot>,
        {
          createNodeMock: element => (element.type === 'View' ? { measure: () => {} } : null),
        }
      );
    });

    expect(measuredAgainstRoot).toBe(true);
    expect(registry?.getBlock('p1')?.rect).toEqual({ x: 7, y: 9, w: 30, h: 11 });
  });

  test('handle drags resolve from page coordinates through the root origin', () => {
    let store: SelectionStore | null = null;

    const RegisterMeasuredBlock: React.FC = () => {
      const ctx = useSelectionContext();
      useEffect(() => {
        store = ctx.store;
        return ctx.registerBlock({
          nodeId: 'p1',
          unitIds: ['p1#0'],
          kind: 'text',
          rect: { x: 10, y: 100, w: 60, h: 20 },
          metrics: {
            textLength: 5,
            lines: [{ start: 0, end: 5, visibleEnd: 5, x: 0, y: 0, w: 50, h: 20 }],
          },
        });
      }, [ctx]);
      return null;
    };

    act(() => {
      renderer = create(
        <SelectionRoot units={UNITS} overlay={false} toolbar={false}>
          <RegisterMeasuredBlock />
        </SelectionRoot>,
        {
          createNodeMock: element =>
            element.type === 'View'
              ? {
                  measure: (cb: (...args: number[]) => void) => cb(0, 0, 300, 500, 100, 200),
                }
              : null,
        }
      );
    });
    if (store === null) throw new Error('test did not capture the selection store');

    const root = renderer.root.findAllByType('View' as unknown as React.ElementType)[0];
    act(() => {
      root.props.onLayout({ nativeEvent: { layout: { width: 300, height: 500 } } });
      store.beginAt({ nodeId: 'p1', unitId: 'p1#0', offset: 0 });
      store.extendTo({ nodeId: 'p1', unitId: 'p1#0', offset: 5 });
      store.commit();
    });

    const handleKnobs = renderer.root
      .findAllByType('View' as unknown as React.ElementType)
      .filter(node => {
        const style = node.props.style as { backgroundColor?: string; width?: number; height?: number };
        return style?.backgroundColor === '#3399ff' && style.width === 12 && style.height === 12;
      });
    expect(handleKnobs).toHaveLength(2);

    const endKnob = [...handleKnobs].sort(
      (a, b) => (a.props.style.top as number) - (b.props.style.top as number)
    )[1];
    act(() => {
      endKnob.props.onResponderGrant(eventAt(160, 326));
      endKnob.props.onResponderMove(eventAt(130, 310), { dx: 999, dy: 999 });
    });

    expect(store.getSnapshot().range).toEqual({
      anchor: { nodeId: 'p1', unitId: 'p1#0', offset: 0 },
      focus: { nodeId: 'p1', unitId: 'p1#0', offset: 2 },
    });
  });
});
