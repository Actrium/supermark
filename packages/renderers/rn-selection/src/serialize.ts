import type { SelectionPayload, SelectionUnit } from './model';

export type SelectionSerializeFormat =
  | 'plainText'
  | 'markdown'
  | 'html'
  | 'svg'
  | 'png'
  | 'source';

export function serializeSelectionUnits(
  units: readonly SelectionUnit[],
  format: SelectionSerializeFormat = 'plainText'
): string | Uint8Array | undefined {
  if (format === 'png') {
    // Binary formats cannot be concatenated as text. For milestone 1 we only
    // surface the first atom's PNG; the multi-atom story is decided in
    // milestone 4 alongside the engine-backed payloads.
    return firstPayload(units, 'png');
  }

  const chunks = units
    .map(unit => serializeUnit(unit, format))
    .filter((chunk): chunk is string => chunk !== undefined);
  return chunks.join('');
}

function serializeUnit(
  unit: SelectionUnit,
  format: Exclude<SelectionSerializeFormat, 'png'>
): string | undefined {
  switch (unit.kind) {
    case 'text': {
      // `text` is always plain text; markdown/html/source reconstruction lives
      // in the optional payload and falls back to the plain text so body
      // content is never dropped for payload-less units.
      if (format === 'plainText') return unit.text;
      if (format === 'svg') return unit.payload?.svg;
      const payload = unit.payload ? payloadField(unit.payload, format) : undefined;
      return payload ?? unit.text;
    }
    case 'break':
      // Breaks advance every text-like stream. HTML completion (e.g. `<br>`) is
      // deferred to milestone 4; for now every text format emits `'\n'`.
      if (format === 'svg') return undefined;
      return unit.text;
    case 'atom':
      return payloadField(unit.payload, format);
    case 'boundary':
      // Boundaries emit nothing; their anti-adjacency is handled by the
      // trailing break the linearizer appends after them.
      return undefined;
  }
}

function payloadField(
  payload: SelectionPayload,
  format: Exclude<SelectionSerializeFormat, 'png'>
): string | undefined {
  switch (format) {
    case 'plainText':
      return payload.plainText;
    case 'markdown':
      return payload.markdown;
    case 'html':
      return payload.html;
    case 'svg':
      return payload.svg;
    case 'source':
      return payload.source;
  }
}

function firstPayload(
  units: readonly SelectionUnit[],
  key: 'png'
): string | Uint8Array | undefined {
  // Milestone 1: only the first atom's binary payload is returned; the combined
  // semantics for multi-atom selections is deferred to milestone 4.
  for (const unit of units) {
    if (unit.kind === 'atom' && unit.payload[key]) return unit.payload[key];
  }
  return undefined;
}
