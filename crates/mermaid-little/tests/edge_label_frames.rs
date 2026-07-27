//! The edge-label decluster pass must compare labels in SCREEN space.
//!
//! Labels inside an isolated cluster are emitted under
//! `<g class="root" transform="translate(tx, ty)">`, so their raw coordinates
//! are cluster-local. Comparing those directly against a label from another
//! frame invents collisions between labels that are far apart on screen, and
//! the pass then slides both of them for no reason.
//!
//! The fixture below is tuned so the *flat* coordinates collide while the
//! *screen* coordinates do not:
//!
//! | label   | frame        | local coords     | screen coords    |
//! |---------|--------------|------------------|------------------|
//! | `gamma` | root         | (377.50, 87.45)  | (377.50,  87.45) |
//! | `beta`  | S2 (nested)  | (401.77, 66.15)  | (439.27, 310.04) |
//!
//! Flat: dx 24.3, dy 21.3 -> the boxes overlap, so a frame-blind pass pushes
//! them apart. Screen: dy 222.6 -> no overlap exists and nothing should move.

#![cfg(feature = "metrics-ttf-parser")]

use mermaid_little::{convert_with_id, convert_with_options, RenderOptions};
use regex::Regex;
use std::sync::OnceLock;

/// Two labelled edges inside a doubly-nested subgraph, plus one labelled edge
/// at the outer level whose local coordinates land near the cluster's.
const NESTED_FRAMES: &str = r#"flowchart TD
    C["C"] -->|"gamma"| D["D"]
    subgraph S1["Outer"]
      subgraph S2["Inner"]
        A["A"] -->|"alpha"| B["B"]
        B -->|"beta"| E["E"]
      end
    end
    D --> S1
"#;

fn edge_label_positions(svg: &str) -> Vec<(String, String)> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r#"<g class="edgeLabel" transform="translate\(([-0-9.]+),\s*([-0-9.]+)\)">"#)
            .expect("valid regex")
    });
    re.captures_iter(svg)
        .map(|c| (c[1].to_string(), c[2].to_string()))
        .collect()
}

fn isolated_root_translates(svg: &str) -> Vec<(f64, f64)> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r#"<g class="root" transform="translate\(([-0-9.]+),\s*([-0-9.]+)\)">"#)
            .expect("valid regex")
    });
    re.captures_iter(svg)
        .map(|c| (c[1].parse().unwrap_or(0.0), c[2].parse().unwrap_or(0.0)))
        .collect()
}

/// Guard the fixture itself: if a layout change stops producing nested
/// isolated clusters, the regression below would pass vacuously.
#[test]
fn fixture_still_produces_nested_isolated_clusters() {
    let svg = convert_with_id(NESTED_FRAMES, "frames").expect("render");
    let translates = isolated_root_translates(&svg);
    assert!(
        translates.len() >= 2,
        "expected at least two nested isolated cluster roots, got {translates:?}"
    );
    let cumulative_y: f64 = translates.iter().map(|(_, ty)| ty).sum();
    assert!(
        cumulative_y > 100.0,
        "cluster translate must be large enough that flat and screen space \
         disagree; got cumulative ty {cumulative_y}"
    );
}

/// No label in this diagram overlaps any other *on screen*, so enabling the
/// decluster must be a no-op. Before the frame fix, `gamma` (root frame) and
/// `beta` (cluster frame) were judged overlapping on their raw coordinates and
/// both were nudged: `gamma` 87.45 -> 96.45 and `beta` 66.15 -> 60.45.
#[test]
fn cross_frame_labels_are_not_declustered_against_each_other() {
    let base = convert_with_id(NESTED_FRAMES, "frames").expect("render base");
    let declustered = convert_with_options(
        NESTED_FRAMES,
        "frames",
        &RenderOptions::default().with_edge_label_decluster(true),
    )
    .expect("render declustered");

    assert_eq!(
        edge_label_positions(&base),
        edge_label_positions(&declustered),
        "labels in different render frames do not overlap on screen, so the \
         decluster pass must leave every one of them at its base position"
    );
}

/// Stronger form of the above: the whole document is untouched, which also
/// catches the viewBox being recomputed around phantom-displaced labels.
#[test]
fn decluster_is_a_no_op_when_nothing_overlaps_on_screen() {
    let base = convert_with_id(NESTED_FRAMES, "frames").expect("render base");
    let declustered = convert_with_options(
        NESTED_FRAMES,
        "frames",
        &RenderOptions::default().with_edge_label_decluster(true),
    )
    .expect("render declustered");
    assert_eq!(base, declustered);
}

/// Same-frame overlaps must still be resolved: the fix moves the comparison
/// into screen space, it does not disable the pass. Both labels here live in
/// the same cluster frame and genuinely stack, so they must separate.
#[test]
fn same_frame_overlaps_are_still_declustered() {
    const STACKED: &str = r#"flowchart LR
    subgraph S1["Outer"]
      subgraph S2["Inner"]
        A["A"] -->|"alpha"| B["B"]
        A -->|"beta"| B
      end
    end
    C["C"] -->|"gamma"| D["D"]
"#;
    let base = convert_with_id(STACKED, "stacked").expect("render base");
    let declustered = convert_with_options(
        STACKED,
        "stacked",
        &RenderOptions::default().with_edge_label_decluster(true),
    )
    .expect("render declustered");
    assert_ne!(
        edge_label_positions(&base),
        edge_label_positions(&declustered),
        "two labels stacked inside the same cluster frame must still be pushed apart"
    );
}
