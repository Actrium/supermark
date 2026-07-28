//! Opt-in edge-label collision avoidance for flowcharts.
//!
//! Dagre (and upstream Mermaid) place every edge label at the midpoint of its
//! spline with no mutual avoidance, so labels on edges that share a midpoint
//! region — opposite-direction edges between the same node pair, or a dense
//! fan-in — stack on top of each other. This is confirmed upstream behaviour
//! (see issue #93), not a Supramark regression, so the default render path
//! stays byte-exact with `mermaid@11.14.0`.
//!
//! This module provides an opt-in post-layout pass that nudges overlapping
//! label bounding boxes apart. It runs on the *final* rendered label centres
//! (after `recompute_edge_label_position`), so it agrees with whatever the
//! renderer actually draws. The pass is greedy iterative pairwise separation
//! along the axis of minimum penetration — the standard AABB resolution used
//! by label-displacers in graph layout. Each label may only move a bounded
//! distance from its base position so it stays tethered to its edge.
//!
//! **Best-effort, not a guarantee.** The pass *reduces* overlap but does not
//! promise zero overlaps: when `max_displacement` binds, labels that cannot
//! be pushed far enough apart remain stacked. The property the pass actually
//! provides is "overlap count strictly decreases"; "zero overlaps" is a
//! fixture-specific fact that holds for some layouts (e.g. the #93 repro)
//! and not others. Tests assert the general property, and only assert zero
//! for a fixture known to fully resolve.
//!
//! The function is pure arithmetic over centre-based rects `(cx, cy, w, h)`
//! so it is trivially testable without laying out a real diagram.

/// A centre-based axis-aligned label rectangle.
pub type LabelRect = (f64, f64, f64, f64);

/// Separation tuning. Picked to remove the overlap clusters reported in #93
/// (which sit within ~20 px of each other) while keeping labels visibly
/// anchored to their edges.
pub struct DeclusterConfig {
    /// Extra gap left between labels after separation, in diagram units.
    pub gap: f64,
    /// Maximum distance a label centre may move from its base position.
    pub max_displacement: f64,
    /// Upper bound on resolution iterations. Greedy separation converges
    /// quickly for the small N of a typical flowchart; the cap is a backstop.
    pub max_iters: usize,
}

impl Default for DeclusterConfig {
    fn default() -> Self {
        Self {
            gap: 6.0,
            max_displacement: 80.0,
            max_iters: 16,
        }
    }
}

/// Push overlapping label rects apart in place, with no obstacles.
///
/// `centres[i] = (cx, cy, w, h)` — the label centre and its full width/height.
/// `base[i]` is the original centre used to clamp displacement; pass the same
/// slice as `centres` before mutation if you want clamping relative to the
/// input positions (the normal case). On return, `centres` holds the adjusted
/// centres; widths/heights are unchanged.
pub fn decluster(centres: &mut [LabelRect], base: &[LabelRect], cfg: &DeclusterConfig) {
    decluster_with_obstacles(centres, base, &[], cfg);
}

/// Like [`decluster`], but labels are also pushed out of static `obstacles`
/// (e.g. flowchart node rectangles). Obstacles never move — the full
/// penetration plus gap is borne by the label alone (one-way), resolved along
/// the axis of minimum penetration and clamped to the label's base position.
/// With `obstacles` empty this is identical to [`decluster`].
pub fn decluster_with_obstacles(
    centres: &mut [LabelRect],
    base: &[LabelRect],
    obstacles: &[LabelRect],
    cfg: &DeclusterConfig,
) {
    let n = centres.len();
    debug_assert_eq!(base.len(), n);
    if n == 0 {
        return;
    }
    for _ in 0..cfg.max_iters {
        let moved_o = push_off_obstacles(centres, base, obstacles, cfg);
        let moved_l = separate_labels(centres, base, cfg);
        if !moved_o && !moved_l {
            break;
        }
    }
    // Final sweep: label<->label only. Issue #93 is label/label overlap, so
    // the pass must end with labels mutually separated wherever a separation
    // exists, even if an obstacle push earlier in the loop drove two labels
    // together. We do NOT run a trailing obstacle pass here: on a dense layout
    // nudging a label off a node pushes it into a neighbour, reintroducing the
    // label/label overlap this sweep just removed. Node overlap from dagre's
    // midpoint placement is upstream behaviour and only best-effort — the
    // earlier interleaved obstacle passes already remove what they can without
    // trading label/label overlap for it.
    for _ in 0..cfg.max_iters {
        if !separate_labels(centres, base, cfg) {
            break;
        }
    }
}

/// One pass of mutual label<->label separation. Returns true if any label
/// moved. Each overlapping pair is pushed apart along the axis of minimum
/// penetration, splitting the displacement equally between the two labels.
fn separate_labels(centres: &mut [LabelRect], base: &[LabelRect], cfg: &DeclusterConfig) -> bool {
    let n = centres.len();
    let mut moved = false;
    for i in 0..n {
        for j in (i + 1)..n {
            let (ax, ay, aw, ah) = centres[i];
            let (bx, by, bw, bh) = centres[j];
            let pen_x = (aw / 2.0 + bw / 2.0) - (ax - bx).abs();
            let pen_y = (ah / 2.0 + bh / 2.0) - (ay - by).abs();
            if pen_x <= 0.0 || pen_y <= 0.0 {
                continue;
            }
            moved = true;
            if pen_x < pen_y {
                let dir = if ax <= bx { -1.0 } else { 1.0 };
                let push = (pen_x + cfg.gap) / 2.0;
                centres[i].0 = clamp_to_base(base[i].0, ax + dir * push, cfg);
                centres[j].0 = clamp_to_base(base[j].0, bx - dir * push, cfg);
            } else {
                let dir = if ay <= by { -1.0 } else { 1.0 };
                let push = (pen_y + cfg.gap) / 2.0;
                centres[i].1 = clamp_to_base(base[i].1, ay + dir * push, cfg);
                centres[j].1 = clamp_to_base(base[j].1, by - dir * push, cfg);
            }
        }
    }
    moved
}

/// One pass of one-way label<->obstacle separation. Returns true if any label
/// moved. The label bears the full penetration plus gap; obstacles never move.
fn push_off_obstacles(
    centres: &mut [LabelRect],
    base: &[LabelRect],
    obstacles: &[LabelRect],
    cfg: &DeclusterConfig,
) -> bool {
    let n = centres.len();
    let mut moved = false;
    for i in 0..n {
        for &(ox, oy, ow, oh) in obstacles {
            let (ax, ay, aw, ah) = centres[i];
            let pen_x = (aw / 2.0 + ow / 2.0) - (ax - ox).abs();
            let pen_y = (ah / 2.0 + oh / 2.0) - (ay - oy).abs();
            if pen_x <= 0.0 || pen_y <= 0.0 {
                continue;
            }
            moved = true;
            if pen_x < pen_y {
                let dir = if ax <= ox { -1.0 } else { 1.0 };
                let push = pen_x + cfg.gap;
                centres[i].0 = clamp_to_base(base[i].0, centres[i].0 + dir * push, cfg);
            } else {
                let dir = if ay <= oy { -1.0 } else { 1.0 };
                let push = pen_y + cfg.gap;
                centres[i].1 = clamp_to_base(base[i].1, centres[i].1 + dir * push, cfg);
            }
        }
    }
    moved
}

/// Clamp `value` to within `max_displacement` of `base_value`.
fn clamp_to_base(base_value: f64, value: f64, cfg: &DeclusterConfig) -> f64 {
    let delta = value - base_value;
    let clamped = delta.clamp(-cfg.max_displacement, cfg.max_displacement);
    base_value + clamped
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rects_equal(a: &[LabelRect], b: &[(f64, f64)]) {
        for (i, ((cx, cy, _, _), (ex, ey))) in a.iter().zip(b.iter()).enumerate() {
            assert!(
                (cx - ex).abs() < 1e-6 && (cy - ey).abs() < 1e-6,
                "rect[{i}] centre = ({cx}, {cy}), expected ({ex}, {ey})"
            );
        }
    }

    #[test]
    fn no_op_when_no_overlap() {
        let mut r = [(0.0, 0.0, 10.0, 10.0), (100.0, 100.0, 10.0, 10.0)];
        let base = r;
        decluster(&mut r, &base, &DeclusterConfig::default());
        rects_equal(&r, &[(0.0, 0.0), (100.0, 100.0)]);
    }

    #[test]
    fn separates_vertically_stacked_labels() {
        // Two 20x10 labels sharing the same centre — the A1<->COMMIT case.
        let mut r = [(50.0, 50.0, 20.0, 10.0), (50.0, 50.0, 20.0, 10.0)];
        let base = r;
        decluster(&mut r, &base, &DeclusterConfig::default());
        // Equal penetration both axes; the else-branch picks vertical.
        assert!(
            (r[0].1 - r[1].1).abs() > 10.0,
            "labels must split vertically"
        );
        // Widths unchanged.
        assert_eq!(r[0].2, 20.0);
        assert_eq!(r[1].3, 10.0);
        // Symmetric about the original centre.
        assert!(((r[0].1 + r[1].1) / 2.0 - 50.0).abs() < 1e-9);
    }

    #[test]
    fn result_has_no_remaining_overlaps() {
        // A dense cluster of four labels plus a distant one.
        let mut r = vec![
            (50.0, 50.0, 30.0, 10.0),
            (52.0, 52.0, 30.0, 10.0),
            (48.0, 48.0, 30.0, 10.0),
            (51.0, 51.0, 30.0, 10.0),
            (500.0, 500.0, 30.0, 10.0),
        ];
        let base = r.clone();
        decluster(&mut r, &base, &DeclusterConfig::default());
        for i in 0..r.len() {
            for j in (i + 1)..r.len() {
                let (ax, ay, aw, ah) = r[i];
                let (bx, by, bw, bh) = r[j];
                let pen_x = (aw / 2.0 + bw / 2.0) - (ax - bx).abs();
                let pen_y = (ah / 2.0 + bh / 2.0) - (ay - by).abs();
                assert!(
                    pen_x <= 0.0 || pen_y <= 0.0,
                    "labels {i} and {j} still overlap (pen_x={pen_x}, pen_y={pen_y})"
                );
            }
        }
    }

    #[test]
    fn displacement_is_clamped() {
        // A tiny max_displacement must cap how far a label can move even when
        // a large overlap would otherwise push it far.
        let cfg = DeclusterConfig {
            gap: 0.0,
            max_displacement: 5.0,
            max_iters: 16,
        };
        let mut r = [(0.0, 0.0, 200.0, 200.0), (0.0, 0.0, 200.0, 200.0)];
        let base = r;
        decluster(&mut r, &base, &cfg);
        // Horizontal penetration (200) == vertical (200); vertical branch.
        assert!((r[0].1 - 0.0).abs() <= 5.0 + 1e-9);
        assert!((r[1].1 - 0.0).abs() <= 5.0 + 1e-9);
    }

    #[test]
    fn fewer_than_two_labels_is_noop() {
        let mut r = [(10.0, 10.0, 5.0, 5.0)];
        let base = r;
        decluster(&mut r, &base, &DeclusterConfig::default());
        rects_equal(&r, &[(10.0, 10.0)]);
    }
}
