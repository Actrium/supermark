import { describe, expect, it, mock } from 'bun:test';

// Issue #40: mermaid flowchart labels rendered off-center.
//   - Node text sat at the bottom of its box instead of the vertical
//     middle (foreignObject height = ascent+descent, but the inner div
//     paints at line-height 1.5 and overflows downward under
//     `display: table-cell`).
//   - Edge-label text sat ~width/2 to the LEFT of its edge (the label
//     group's `translate(-w/2, …)` recentred the background rect but the
//     text-anchor=middle text self-centres at x=0, so it never got the
//     shift).
//
// Both are visual artifacts of markup that faithfully mirrors upstream
// mermaid; supramark recenters them in `inlineMermaidSvg`. These tests
// pin the post-processing by feeding a raw (pre-fix) SVG fragment
// through `renderMermaidSvg` with the wasm mocked.

const RAW_EDGE_LABEL =
  '<g class="edgeLabel" transform="translate(200, 100)">' +
  '<g class="label" data-id="L_a_b_0" transform="translate(-42, -7)">' +
  '<g><rect class="background" style="" x="-2" y="-2" width="88" height="18"></rect>' +
  '<text y="-10.1" text-anchor="middle" style="">' +
  '<tspan class="text-outer-tspan row" x="0" y="-0.1em" dy="1.1em" text-anchor="middle">' +
  '<tspan font-style="normal" class="text-inner-tspan" font-weight="normal">edge</tspan>' +
  '<tspan font-style="normal" class="text-inner-tspan" font-weight="normal"> label</tspan>' +
  '</tspan></text></g></g></g>';

const RAW_NODE_LABEL =
  '<g class="node default  " id="n0" transform="translate(200, 50)">' +
  '<rect class="basic label-container" rx="5" ry="5" x="-100" y="-22" width="200" height="44"></rect>' +
  '<g class="label" style="" transform="translate(-90, -7)"><rect></rect>' +
  '<foreignObject width="180" height="14">' +
  '<div style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml">' +
  '<span class="nodeLabel "><p>The cat in the hat</p></span>' +
  '</div></foreignObject></g></g>';

const RAW_SVG =
  '<svg id="mermaid-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
  '<style>#mermaid-1{font-family:sans-serif;font-size:16px;fill:#333;}#mermaid-1 p{margin:0;}</style>' +
  '<g><g class="nodes">' +
  RAW_NODE_LABEL +
  '</g><g class="edgeLabels">' +
  RAW_EDGE_LABEL +
  '</g></g></svg>';

mock.module('../src/host-bridge.js', () => ({
  __esModule: true,
  installHostMetricsBridge: () => {},
}));

// Both entries are tracked so the wiring tests below can assert which wasm
// entry the engines layer routed through. The same rich RAW_SVG satisfies
// the #40 content assertions (the post-processing is independent of which
// entry produced the SVG).
const convertFn = mock(() => RAW_SVG);
const convertWithOptionsFn = mock((_mmd: string, _id: string, _flag: boolean) => RAW_SVG);

mock.module('@actrium/mermaid-little-web', () => ({
  __esModule: true,
  convert: convertFn,
  convert_with_options: convertWithOptionsFn,
}));

const { renderMermaidSvg } = await import('../src/mermaid/index.ts');

describe('mermaid label centering (#40)', () => {
  it('recenters edge-label text on the edge midpoint', async () => {
    const out = await renderMermaidSvg('flowchart LR\n  a -- "edge label" --> b');

    // The label group must drop its -w/2 x-shift: the text self-centres
    // via text-anchor=middle, so any x-shift moves it off the edge.
    const labelTransform = out.match(
      /<g class="label" data-id="L_a_b_0" transform="translate\(([^)]+)\)"/
    )?.[1];
    expect(labelTransform).toBe('0, -7');

    // The background rect must straddle x=0 (x = -width/2) so it shares
    // the text's centre line. width=88 → x=-44.
    const rectX = out.match(/<rect class="background"[^>]* x="([^"]+)"/)?.[1];
    expect(rectX).toBe('-44');
  });

  it('centers node-label content vertically inside the foreignObject', async () => {
    const out = await renderMermaidSvg('flowchart LR\n  a("The cat in the hat")');

    // The upstream `display: table-cell` lets the div grow to its
    // (taller, line-height:1.5) content and overflow the foreignObject
    // downward. Flex-centering with height:100% pins the div to the
    // foreignObject box and centers its content.
    expect(out).not.toContain('display: table-cell;');
    expect(out).toContain('display: flex; align-items: center; justify-content: center;');
    expect(out).toContain('height: 100%');
    // foreignObject overflow must be visible so the (possibly taller)
    // painted text isn't clipped.
    expect(out).toContain('<foreignObject overflow="visible"');
    // <p> default margin collapses (would otherwise re-introduce an offset).
    expect(out).toContain('margin:0');
  });
});

describe('mermaid edge-label decluster wiring (#126 item 3)', () => {
  it('routes through convert_with_options when edgeLabelDecluster is set', async () => {
    const code = 'flowchart LR\n  A -->|label| B';
    await renderMermaidSvg(code, { edgeLabelDecluster: true });

    expect(convertWithOptionsFn.mock.calls.at(-1)).toEqual([code, 'mermaid-1', true]);
  });

  it('does not call the byte-exact convert when decluster is on', async () => {
    const before = convertFn.mock.calls.length;
    await renderMermaidSvg('flowchart LR\n  A --> B', { edgeLabelDecluster: true });
    expect(convertFn.mock.calls.length).toBe(before);
  });

  it('keeps the default path on convert(code) without the option', async () => {
    const code = 'flowchart LR\n  A --> B';
    await renderMermaidSvg(code);

    expect(convertFn.mock.calls.at(-1)).toEqual([code]);
  });

  it('does not call convert_with_options on the default path', async () => {
    const before = convertWithOptionsFn.mock.calls.length;
    await renderMermaidSvg('flowchart LR\n  A --> B');
    expect(convertWithOptionsFn.mock.calls.length).toBe(before);
  });
});
