//! Integration test for the opt-in edge-label collision-avoidance pass (#93).
//!
//! Dagre places every flowchart edge label at its spline midpoint with no
//! mutual avoidance, so labels on edges that share a midpoint region overlap
//! (here: opposite-direction edges `A1 <-> COMMIT` plus a dense fan-in around
//! the `Devices` boundary). That overlap is upstream Mermaid behaviour
//! (confirmed via mermaid.live), so the default render stays byte-exact and
//! the decluster is opt-in via `RenderOptions::edge_label_decluster`.

#![cfg(feature = "metrics-ttf-parser")]

use mermaid_little::{convert_with_id, convert_with_options, RenderOptions};
use regex::Regex;
use std::sync::OnceLock;

/// The exact source from issue #93 — a `flowchart LR` whose edge labels stack.
const REPRO: &str = r#"flowchart LR
    subgraph Devices["用户设备"]
        A1["Alice / Laptop"]
        A2["Alice / Phone"]
        B1["Bob / Laptop"]
        B2["Bob / Phone"]
    end

    DIR["Directory + Domain Authority"]
    COMMIT["Conversation Committer"]
    RELAY["Encrypted Relay"]
    GW["Mail Gateway"]
    MTA["Existing MTA"]
    SMTP["SMTP Network"]

    A1 <-->|"已提交密文直连"| B1
    A2 <-->|"账户同步"| A1
    B2 <-->|"账户同步"| B1
    A1 -->|"签名提案 + HLC"| COMMIT
    COMMIT -->|"会话内序号 + 提交证明"| A1
    A1 -->|"接收设备离线时暂存"| RELAY
    RELAY -->|"拉取/唤醒"| B1
    Devices <-->|"签名目录与策略"| DIR
    Devices <-->|"外部邮件明文边界"| GW
    GW <--> MTA
    MTA <--> SMTP
"#;

#[derive(Clone, Copy)]
struct Rect {
    cx: f64,
    cy: f64,
    w: f64,
    h: f64,
}

/// Parse every `<g class="edgeLabel" transform="translate(cx,cy)">` and its
/// inner `foreignObject width height` out of the rendered SVG.
fn edge_label_rects(svg: &str) -> Vec<Rect> {
    static BLOCK_RE: OnceLock<Regex> = OnceLock::new();
    static SIZE_RE: OnceLock<Regex> = OnceLock::new();
    let block = BLOCK_RE.get_or_init(|| {
        Regex::new(
            r#"<g class="edgeLabel" transform="translate\(([-0-9.]+),\s*([-0-9.]+)\)">(?s:.*?)</g>\s*</g>"#,
        )
        .expect("block regex")
    });
    let size = SIZE_RE.get_or_init(|| {
        Regex::new(r#"width="([0-9.]+)"[^>]*height="([0-9.]+)""#).expect("size regex")
    });

    let mut rects = Vec::new();
    for cap in block.captures_iter(svg) {
        let (Ok(cx), Ok(cy)) = (cap[1].parse::<f64>(), cap[2].parse::<f64>()) else {
            continue;
        };
        let Some(idx) = cap[0].find("foreignObject") else {
            continue;
        };
        let Some(sm) = size.captures(&cap[0][idx..]) else {
            continue;
        };
        let (Ok(w), Ok(h)) = (sm[1].parse::<f64>(), sm[2].parse::<f64>()) else {
            continue;
        };
        if w > 0.0 && h > 0.0 {
            rects.push(Rect { cx, cy, w, h });
        }
    }
    rects
}

fn viewbox(svg: &str) -> (f64, f64, f64, f64) {
    let v = svg
        .split("viewBox=\"")
        .nth(1)
        .and_then(|s| s.split('"').next())
        .unwrap_or("0 0 0 0");
    let nums: Vec<f64> = v
        .split_whitespace()
        .filter_map(|t| t.parse().ok())
        .collect();
    match nums.as_slice() {
        [x, y, w, h] => (*x, *y, *w, *h),
        _ => (0.0, 0.0, 0.0, 0.0),
    }
}

/// Count overlapping label pairs (centre-based AABBs).
fn overlap_pairs(rects: &[Rect]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    for i in 0..rects.len() {
        for j in (i + 1)..rects.len() {
            let a = rects[i];
            let b = rects[j];
            let ox = (a.w / 2.0 + b.w / 2.0) - (a.cx - b.cx).abs();
            let oy = (a.h / 2.0 + b.h / 2.0) - (a.cy - b.cy).abs();
            if ox > 0.0 && oy > 0.0 {
                out.push((i, j));
            }
        }
    }
    out
}

#[test]
fn decluster_removes_edge_label_overlaps() {
    let baseline = convert_with_id(REPRO, "mermaid-1").expect("baseline render");
    let declustered = convert_with_options(
        REPRO,
        "mermaid-1",
        &RenderOptions::default().with_edge_label_decluster(true),
    )
    .expect("declustered render");

    let base_rects = edge_label_rects(&baseline);
    let decl_rects = edge_label_rects(&declustered);

    assert!(
        !base_rects.is_empty(),
        "expected edge labels in the rendered SVG"
    );

    // The issue's repro stacks labels at shared midpoints, so the byte-exact
    // baseline has at least one overlapping pair.
    let base_overlaps = overlap_pairs(&base_rects);
    assert!(
        !base_overlaps.is_empty(),
        "baseline should have overlapping edge labels (else the repro no longer reproduces #93)"
    );

    // The opt-in pass must remove every overlap.
    let decl_overlaps = overlap_pairs(&decl_rects);
    assert!(
        decl_overlaps.is_empty(),
        "declustered output still has {} overlapping pair(s)",
        decl_overlaps.len()
    );

    // Same number of labels rendered (the pass moves them, never drops them).
    assert_eq!(base_rects.len(), decl_rects.len());

    // Every label must stay inside the viewBox.
    let (vbx, vby, vbw, vbh) = viewbox(&declustered);
    for Rect { cx, cy, w, h } in &decl_rects {
        let left = cx - w / 2.0;
        let right = cx + w / 2.0;
        let top = cy - h / 2.0;
        let bottom = cy + h / 2.0;
        assert!(
            left >= vbx - 0.5
                && top >= vby - 0.5
                && right <= vbx + vbw + 0.5
                && bottom <= vby + vbh + 0.5,
            "label centre ({cx},{cy}) size ({w}x{h}) falls outside viewBox {vbx} {vby} {vbw} {vbh}"
        );
    }
}

#[test]
fn byte_exact_default_is_unchanged_by_options() {
    // `convert_with_id` and `convert_with_options(byte_exact)` must produce
    // identical output — the option must not perturb the default path.
    let a = convert_with_id(REPRO, "mermaid-1").expect("render a");
    let b =
        convert_with_options(REPRO, "mermaid-1", &RenderOptions::byte_exact()).expect("render b");
    assert_eq!(
        a, b,
        "byte_exact options must match the default convert path"
    );
}
