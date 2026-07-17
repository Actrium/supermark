import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type {
  SelectionBoundaryUnit,
  SelectionBreakUnit,
  SelectionTextUnit,
  SelectionUnit,
} from '../../model';
import { SelectionRegistry, type LayoutRect, type RegisteredBlock } from '../../coordinator/registry';

// resolve/registry copy `node` but never inspect it.
const NODE = { type: 'text', value: '' } as SupramarkTextNode;
const tUnit = (unitId: string, nodeId: string, text: string): SelectionTextUnit => ({
  kind: 'text',
  unitId,
  nodeId,
  text,
  node: NODE,
});
const brk = (unitId: string, nodeId: string): SelectionBreakUnit => ({
  kind: 'break',
  unitId,
  nodeId,
  text: '\n',
  reason: 'block',
  node: NODE,
});
const bound = (unitId: string, nodeId: string): SelectionBoundaryUnit => ({
  kind: 'boundary',
  unitId,
  nodeId,
  node: NODE,
  reason: 'custom',
});

// Document order: text a#0, break a#1 (node a); text b#0 (node b); boundary c#0 (node c).
const baseUnits = (): SelectionUnit[] => [
  tUnit('a#0', 'a', 'a'),
  brk('a#1', 'a'),
  tUnit('b#0', 'b', 'b'),
  bound('c#0', 'c'),
];

const blockA: RegisteredBlock = { nodeId: 'a', unitIds: ['a#0', 'a#1'], kind: 'text' };
const blockB: RegisteredBlock = { nodeId: 'b', unitIds: ['b#0'], kind: 'text' };
const blockC: RegisteredBlock = { nodeId: 'c', unitIds: ['c#0'], kind: 'boundary' };

describe('SelectionRegistry', () => {
  test('iterates in document order regardless of registration order', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockC });
    reg.register({ ...blockA });
    reg.register({ ...blockB });
    expect(reg.getBlocks().map(b => b.nodeId)).toEqual(['a', 'b', 'c']);
  });

  test('unregister removes a block and keeps order', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockA });
    reg.register({ ...blockB });
    reg.register({ ...blockC });
    reg.unregister('b');
    expect(reg.getBlocks().map(b => b.nodeId)).toEqual(['a', 'c']);
  });

  test('updateLayout mutates rect and notifies', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockA });
    const events: Array<[string, string]> = [];
    reg.subscribe((change, nodeId) => events.push([change, nodeId]));
    const rect: LayoutRect = { x: 1, y: 2, w: 3, h: 4 };
    reg.updateLayout('a', rect);
    expect(reg.getBlock('a')?.rect).toEqual(rect);
    expect(events).toContainEqual(['layout', 'a']);
  });

  test('updateLayout on an unknown block is a no-op', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.updateLayout('missing', { x: 0, y: 0, w: 1, h: 1 });
    expect(reg.getBlock('missing')).toBeUndefined();
  });

  test('register replaces an existing block by nodeId', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockA });
    reg.register({ ...blockB });
    reg.register({ ...blockC });
    reg.register({ nodeId: 'a', unitIds: ['a#0'], kind: 'text', rect: { x: 5, y: 5, w: 5, h: 5 } });
    expect(reg.getBlocks()).toHaveLength(3);
    expect(reg.getBlock('a')?.unitIds).toEqual(['a#0']);
    expect(reg.getBlock('a')?.rect).toEqual({ x: 5, y: 5, w: 5, h: 5 });
  });

  test('getBlockForUnit maps unitId to its block', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockA });
    reg.register({ ...blockB });
    expect(reg.getBlockForUnit('a#1')?.nodeId).toBe('a');
    expect(reg.getBlockForUnit('b#0')?.nodeId).toBe('b');
    expect(reg.getBlockForUnit('nope')).toBeUndefined();
  });

  test('blocks whose units are absent from the index sort last', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockA });
    reg.register({ nodeId: 'x', unitIds: ['x#0'], kind: 'atom' });
    reg.register({ ...blockB });
    expect(reg.getBlocks().map(b => b.nodeId)).toEqual(['a', 'b', 'x']);
  });

  test('setUnits re-indexes and reorders existing blocks', () => {
    const reg = new SelectionRegistry(baseUnits());
    reg.register({ ...blockA });
    reg.register({ ...blockB });
    expect(reg.getBlocks().map(b => b.nodeId)).toEqual(['a', 'b']);
    // Swap node positions: b now precedes a in the linearized stream.
    reg.setUnits([tUnit('b#0', 'b', 'b'), tUnit('a#0', 'a', 'a'), brk('a#1', 'a')]);
    expect(reg.getBlocks().map(b => b.nodeId)).toEqual(['b', 'a']);
  });
});
