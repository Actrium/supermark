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
    case 'text':
      if (format === 'plainText') return unit.text;
      if (unit.payload) {
        const payload = payloadField(unit.payload, format);
        if (payload !== undefined) return payload;
      }
      return format === 'source' ? unit.text : undefined;
    case 'break':
      return format === 'plainText' || format === 'markdown' || format === 'source'
        ? unit.text
        : undefined;
    case 'atom':
      return payloadField(unit.payload, format);
    case 'boundary':
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
  for (const unit of units) {
    if (unit.kind === 'atom' && unit.payload[key]) return unit.payload[key];
  }
  return undefined;
}
