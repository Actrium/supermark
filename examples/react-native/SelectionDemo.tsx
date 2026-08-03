/**
 * Selection demo screen.
 *
 * Uses a literal `SelectionUnit[]` fixture instead of `parse()`: `parse` is
 * async and routes through the linked native Rust markdown lib, which is
 * fragile to await inside an automated screenshot harness, and its exact
 * `nodeId` / unit granularity would then have to be reverse-engineered to
 * build matching `SelectableBlock`s. A literal fixture keeps the programmatic
 * "Select A..B" button deterministic (known `unitId`s) and needs no native
 * binary. `linearizeForSelection` remains available for real documents; this
 * fixture mirrors its output shape (text units + trailing block `break`s,
 * whole-unit `payload.markdown` on bold/heading units).
 *
 * The selection UI here is entirely self-drawn: long-press to select a word,
 * drag to extend, drag either handle to refine, tap to dismiss, and act from
 * the bar that appears. No native selection component is involved.
 */

import React, { useState, useSyncExternalStore } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import {
  SelectionRoot,
  SelectableBlock,
  useSelectionStore,
  serializeSelectionUnits,
  type SelectionUnit,
  type SelectionCopyRequest,
  type SelectionToolbarItem,
} from '@supramark/rn-selection';
import type { SupramarkNode } from '@supramark/core';

const NODE = { type: 'text', value: '' } as unknown as SupramarkNode;
const CJK_TEXT = String.fromCodePoint(0x6f22, 0x5b57, 0x6e2c, 0x8a66);

function t(unitId: string, nodeId: string, text: string, markdown?: string): SelectionUnit {
  return {
    kind: 'text',
    unitId,
    nodeId,
    text,
    node: NODE,
    ...(markdown ? { payload: { markdown } } : {}),
  } as SelectionUnit;
}

function brk(unitId: string, nodeId: string): SelectionUnit {
  return {
    kind: 'break',
    unitId,
    nodeId,
    text: '\n',
    reason: 'block',
    node: NODE,
  } as SelectionUnit;
}

// Blocks register VISIBLE text unit ids only (no trailing break).
const UNITS: SelectionUnit[] = [
  t('h#0', 'h', 'Selection Demo', '# Selection Demo'),
  brk('h#1', 'h'),
  t('p1#0', 'p1', 'Hello '),
  t('p1#1', 'p1', 'world', '**world**'),
  t('p1#2', 'p1', ' \u{1F31F}'),
  brk('p1#3', 'p1'),
  t('p2#0', 'p2', 'Second paragraph for range selection.'),
  brk('p2#1', 'p2'),
  t('cjk#0', 'cjk', CJK_TEXT),
  brk('cjk#1', 'cjk'),
];

// The bar is ours, so its items are just data. A product would add its own
// actions here ("Quote", "Ask AI", ...) and handle them by id in `onCopy`.
const TOOLBAR_ITEMS: SelectionToolbarItem[] = [
  { id: 'copy', title: 'Copy', format: 'plainText' },
  { id: 'copy-md', title: 'Copy MD', format: 'markdown' },
  { id: 'quote', title: 'Quote' },
];

interface SelectionDemoProps {
  onBack: () => void;
  e2e?: boolean;
  scrollSentinel?: boolean;
}

export default function SelectionDemo({
  onBack,
  e2e = false,
  scrollSentinel = false,
}: SelectionDemoProps) {
  const [status, setStatus] = useState('idle');

  const onCopy = (req: SelectionCopyRequest) => {
    setStatus(`${req.id} (${req.format}): ${req.text}`);
  };

  return (
    <SafeAreaView style={s.root}>
      <TouchableOpacity onPress={onBack}>
        <Text style={s.back}>back</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={s.body}>
        <SelectionRoot units={UNITS} onCopy={onCopy} toolbarItems={TOOLBAR_ITEMS}>
          <SelectableBlock nodeId="h" unitIds={['h#0']} style={s.h1}>
            Selection Demo
          </SelectableBlock>
          <SelectableBlock nodeId="p1" unitIds={['p1#0', 'p1#1', 'p1#2']} style={s.p}>
            <Text>
              Hello <Text style={s.bold}>world</Text> {'\u{1F31F}'}
            </Text>
          </SelectableBlock>
          <SelectableBlock nodeId="p2" unitIds={['p2#0']} style={s.p}>
            Second paragraph for range selection.
          </SelectableBlock>
          <SelectableBlock nodeId="cjk" unitIds={['cjk#0']} style={s.cjk}>
            {CJK_TEXT}
          </SelectableBlock>
          <SelectionControls e2e={e2e} onStatus={setStatus} />
        </SelectionRoot>
        <View style={s.statusPanel}>
          <Text testID="selection-status">{status}</Text>
        </View>
        {scrollSentinel && (
          <View style={s.scrollSentinel}>
            <Text testID="selection-scroll-sentinel">Scroll sentinel</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SelectionControls({
  e2e,
  onStatus,
}: {
  e2e: boolean;
  onStatus: (status: string) => void;
}) {
  const store = useSelectionStore();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const afterControlTap = (select: () => void) => {
    setTimeout(select, 0);
  };

  // Programmatic cross-block selection: the highlight spans both blocks and
  // carries handles and the action bar, exactly like a gesture-driven one.
  const selectAB = () => {
    afterControlTap(() => {
      store.beginAt({ nodeId: 'h', unitId: 'h#0', offset: 0 });
      store.extendTo({ nodeId: 'p1', unitId: 'p1#2', offset: 3 });
      store.commit();
    });
  };

  // Within a single block, for comparing against the cross-block case.
  const selectInBlock = () => {
    afterControlTap(() => {
      store.beginAt({ nodeId: 'p1', unitId: 'p1#0', offset: 0 });
      store.extendTo({ nodeId: 'p1', unitId: 'p1#1', offset: 5 });
      store.commit();
    });
  };

  const copyMarkdown = () => {
    const md = serializeSelectionUnits(snap.units, 'markdown');
    onStatus(typeof md === 'string' ? md : '');
  };

  const selectCjkHalf = () => {
    afterControlTap(() => {
      store.beginAt({ nodeId: 'cjk', unitId: 'cjk#0', offset: 0 });
      store.extendTo({ nodeId: 'cjk', unitId: 'cjk#0', offset: CJK_TEXT.length / 2 });
      store.commit();
      onStatus('cjk half');
    });
  };

  const clear = () => {
    store.clear();
    onStatus('idle');
  };

  return (
    <View style={s.controls}>
      <TouchableOpacity style={s.button} onPress={selectAB}>
        <Text style={s.buttonText}>Select A..B</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.button} onPress={selectInBlock}>
        <Text style={s.buttonText}>Select in block</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.button} onPress={copyMarkdown}>
        <Text style={s.buttonText}>Copy markdown</Text>
      </TouchableOpacity>
      {e2e && (
        <TouchableOpacity style={s.button} onPress={selectCjkHalf}>
          <Text style={s.buttonText}>Select CJK half</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.button} onPress={clear}>
        <Text style={s.buttonText}>Clear</Text>
      </TouchableOpacity>
      <Text testID="selection-phase">
        {snap.phase} · {snap.units.length} units
      </Text>
      {e2e && (
        <Text testID="selection-phase-ascii" style={s.e2eStatus}>
          {snap.phase} {snap.units.length} units
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 12 },
  h1: { fontSize: 22, fontWeight: '600' },
  p: { fontSize: 15, lineHeight: 22 },
  cjk: { fontSize: 26, lineHeight: 34 },
  bold: { fontWeight: '700' },
  statusPanel: {
    marginTop: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
  },
  scrollSentinel: {
    height: 1200,
    justifyContent: 'flex-end',
  },
  e2eStatus: { color: '#595959', fontSize: 12 },
  back: { color: '#2f54eb', padding: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  buttonText: { fontSize: 12, fontWeight: '600', color: '#2f54eb' },
});
