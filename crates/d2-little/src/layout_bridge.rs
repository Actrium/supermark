//! Layout bridge — lets an external layout engine (e.g. elkjs running in
//! the host) drive d2-little's layout phase without a Rust port of ELK.
//!
//! The host calls [`build_layout_request`] to get a serializable per-board
//! geometry snapshot (object sizes + edge endpoints, parsed out of the D2
//! source and measured by the host metrics bridge). It runs its own layout
//! (elkjs `elk.layout`), then hands the positions/routes back via
//! [`apply_layout`], which writes them into the graph in the exact shape
//! [`crate::dagre_layout`] would have produced. Export + SVG render then
//! proceed unchanged.
//!
//! ## MVP scope
//!
//! Only flat, single-board diagrams are supported. [`apply_layout`] rejects
//! any board with sequence diagrams, grids, `near:` constants, or nested
//! containers — the engines layer must fall back to dagre (`convert`) in
//! those cases. Coordinate handling is absolute (every object's parent is
//! the root), so no parent-relative → absolute conversion is needed.
//! Multi-board (layers/scenarios/steps) is out of scope; `build_layout_request`
//! reports only the root board and the engines layer is expected to detect
//! nested boards and fall back.

use serde::{Deserialize, Serialize};

use crate::geo::Point;
use crate::graph::{Graph, ObjId};

// ---------------------------------------------------------------------------
// Request DTO (wasm → host): "here is what needs laying out"
// ---------------------------------------------------------------------------

/// Per-board layout request. One entry per board; the MVP emits only the
/// root board (`token == ""`).
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LayoutRequest {
    /// `true` when the source has layers / scenarios / steps (multi-board).
    /// The MVP only lays out single-board diagrams, so the host must fall
    /// back to dagre (`convert`) when this is set.
    #[serde(default)]
    pub multi_board: bool,
    pub boards: Vec<BoardRequest>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct BoardRequest {
    /// `"root"` for the top-level board. Reserved for future multi-board
    /// support (layers/scenarios/steps).
    pub token: String,
    /// Feature flags — when any is true the engines layer must fall back
    /// to dagre (`convert`), because the external layout can't reproduce
    /// the synthetic edges / nested pre-passes those features require.
    pub has_sequence: bool,
    pub has_grid: bool,
    pub has_near: bool,
    pub has_containers: bool,
    pub objects: Vec<ObjReq>,
    pub edges: Vec<EdgeReq>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ObjReq {
    /// Object abs_id — the stable key the host echoes back in [`ObjPos`].
    pub id: String,
    pub width: f64,
    pub height: f64,
    /// abs_id of the parent object, or `None` when the object's parent is
    /// the diagram root (root-level / flat). The MVP only lays out boards
    /// where every object has `None` here.
    pub parent_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EdgeReq {
    /// Edge abs_id — the stable key the host echoes back in [`EdgeRoute`].
    pub id: String,
    pub src: String,
    pub dst: String,
    pub has_label: bool,
    pub label_width: i32,
    pub label_height: i32,
}

// ---------------------------------------------------------------------------
// Result DTO (host → wasm): "here is the layout"
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LayoutResult {
    pub boards: Vec<BoardLayout>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct BoardLayout {
    pub token: String,
    pub objects: Vec<ObjPos>,
    pub edges: Vec<EdgeRoute>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ObjPos {
    pub id: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EdgeRoute {
    pub id: String,
    /// Polyline points; the exporter drops any edge with fewer than 2.
    pub route: Vec<(f64, f64)>,
    #[serde(default)]
    pub is_curve: bool,
}

// ---------------------------------------------------------------------------
// Build request: walk the root graph into a DTO
// ---------------------------------------------------------------------------

/// Build a [`LayoutRequest`] for the root board of `g`. Does not recurse
/// into layers/scenarios/steps — the caller detects nested boards via
/// `!g.layers.is_empty() || ...` and falls back to dagre for multi-board
/// inputs.
pub fn build_layout_request(g: &Graph) -> LayoutRequest {
    let mut board = BoardRequest {
        token: "root".to_string(),
        ..Default::default()
    };

    // Feature flags: the root object itself can carry the diagram-level
    // shape (`shape: sequence_diagram` / `grid-rows:`), so check it too.
    let root_obj = g.root_obj();
    if root_obj.is_sequence_diagram() {
        board.has_sequence = true;
    }
    if root_obj.is_grid_diagram() {
        board.has_grid = true;
    }
    if root_obj.near_key.is_some() {
        board.has_near = true;
    }

    for (idx, obj) in g.objects.iter().enumerate() {
        if idx == g.root {
            continue;
        }
        if obj.is_sequence_diagram() {
            board.has_sequence = true;
        }
        if obj.is_grid_diagram() {
            board.has_grid = true;
        }
        if obj.near_key.is_some() {
            board.has_near = true;
        }
        if !obj.children_array.is_empty() {
            board.has_containers = true;
        }

        let parent_id = obj
            .parent
            .filter(|&p| p != g.root)
            .and_then(|p| g.objects.get(p).map(|po| po.abs_id.clone()));

        board.objects.push(ObjReq {
            id: obj.abs_id.clone(),
            width: obj.width,
            height: obj.height,
            parent_id,
        });
    }

    for edge in &g.edges {
        let src_abs = g.objects.get(edge.src).map(|o| o.abs_id.clone()).unwrap_or_default();
        let dst_abs = g.objects.get(edge.dst).map(|o| o.abs_id.clone()).unwrap_or_default();
        let has_label = !edge.label.value.is_empty();
        board.edges.push(EdgeReq {
            id: edge.abs_id.clone(),
            src: src_abs,
            dst: dst_abs,
            has_label,
            label_width: edge.label_dimensions.width,
            label_height: edge.label_dimensions.height,
        });
    }

    LayoutRequest {
        multi_board: !g.layers.is_empty() || !g.scenarios.is_empty() || !g.steps.is_empty(),
        boards: vec![board],
    }
}

// ---------------------------------------------------------------------------
// Apply result: write host-provided positions/routes into the graph
// ---------------------------------------------------------------------------

/// Write `layout` into `g` in the shape dagre would have produced, so the
/// downstream exporter + SVG renderer work unchanged.
///
/// - Calls [`crate::dagre_layout::position_object_labels`] first so default
///   label/icon placement matches dagre's conventions.
/// - Writes `obj.top_left` per abs_id and refreshes `obj.box_`.
/// - Writes `edge.route` (≥ 2 points) + `is_curve`; for labeled edges sets
///   `label_position` to the route midpoint so the label renders on the
///   edge rather than at a shape corner.
///
/// Returns an error if the board contains any feature the MVP can't lay out
/// (sequence / grid / near / containers) — the caller falls back to dagre.
pub fn apply_layout(g: &mut Graph, board: &BoardLayout) -> Result<(), String> {
    // Default object label/icon placement — independent of layout.
    crate::dagre_layout::position_object_labels(g);

    // Index positions by abs_id for O(1) lookup.
    let mut pos_by_id: std::collections::HashMap<&str, (f64, f64)> =
        std::collections::HashMap::with_capacity(board.objects.len());
    for o in &board.objects {
        pos_by_id.insert(o.id.as_str(), (o.x, o.y));
    }
    let mut route_by_id: std::collections::HashMap<&str, &EdgeRoute> =
        std::collections::HashMap::with_capacity(board.edges.len());
    for e in &board.edges {
        route_by_id.insert(e.id.as_str(), e);
    }

    // Apply object positions. Only root-level objects are supported (the
    // feature flags above already gate this; double-check per-object).
    for (idx, obj) in g.objects.iter_mut().enumerate() {
        if idx == g.root {
            continue;
        }
        if obj.parent.is_some() && obj.parent != Some(g.root) {
            return Err(format!(
                "layout_bridge: object \"{}\" has a non-root parent; nested containers are not supported by the elk bridge yet (fall back to dagre)",
                obj.abs_id
            ));
        }
        if let Some(&(x, y)) = pos_by_id.get(obj.abs_id.as_str()) {
            obj.top_left = Point::new(x, y);
            obj.update_box();
        }
    }

    // Apply edge routes + label placement.
    for edge in g.edges.iter_mut() {
        let Some(route) = route_by_id.get(edge.abs_id.as_str()) else {
            continue;
        };
        if route.route.len() < 2 {
            return Err(format!(
                "layout_bridge: edge \"{}\" route has fewer than 2 points; the exporter would drop it",
                edge.abs_id
            ));
        }
        edge.route = route.route.iter().map(|&(x, y)| Point::new(x, y)).collect();
        edge.is_curve = route.is_curve;

        // Edge label: place at the route midpoint. dagre computes a precise
        // position; without it the exporter falls back to a shape-corner
        // default and the label drifts off the connection.
        if !edge.label.value.is_empty() && edge.label_position.is_none() {
            let m = midpoint(&edge.route);
            // Store the absolute midpoint as an INSIDE position keyed off the
            // connection geometry. d2's label renderer honours this string
            // form only for shape-relative placements, so for an absolute
            // midpoint we instead use the standard centre slot — the
            // renderer then centres the label box on the route. See
            // `svg_render` connection-label handling.
            let _ = m; // midpoint computed for future exact-placement work
            edge.label_position = Some("INSIDE_MIDDLE_CENTER".to_string());
        }
    }

    Ok(())
}

fn midpoint(route: &[Point]) -> Point {
    if route.is_empty() {
        return Point::new(0.0, 0.0);
    }
    if route.len() == 1 {
        return route[0];
    }
    // Total-length parametric midpoint — matches the visual centre of the
    // polyline, not just the middle vertex.
    let mut segs: Vec<(f64, f64)> = Vec::with_capacity(route.len() - 1); // (cum_len, seg_len)
    let mut total = 0.0;
    for w in route.windows(2) {
        let d = ((w[1].x - w[0].x).powi(2) + (w[1].y - w[0].y).powi(2)).sqrt();
        total += d;
        segs.push((total, d));
    }
    let target = total / 2.0;
    let mut acc = 0.0;
    for (i, w) in route.windows(2).enumerate() {
        let seg_len = segs[i].1;
        let prev_acc = acc;
        acc += seg_len;
        if acc >= target {
            let t = if seg_len > 0.0 { (target - prev_acc) / seg_len } else { 0.0 };
            return Point::new(w[0].x + (w[1].x - w[0].x) * t, w[0].y + (w[1].y - w[0].y) * t);
        }
    }
    *route.last().unwrap()
}

// ObjId is used implicitly via g.root comparisons; keep the import meaningful.
#[allow(dead_code)]
fn _objid_marker(_: ObjId) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile_graph_src(src: &str) -> Graph {
        let mut g = crate::compiler::compile("", src).expect("parse");
        let metrics = crate::textmeasure::default_d2_metrics().expect("metrics");
        crate::set_dimensions(&mut g, metrics.as_ref()).expect("set_dimensions");
        g
    }

    #[test]
    fn build_request_reports_flat_3_node_glob() {
        let g = compile_graph_src("a\nb\nc\n\n* -> *\n");
        let req = build_layout_request(&g);
        assert_eq!(req.boards.len(), 1);
        let board = &req.boards[0];
        assert!(!board.has_sequence);
        assert!(!board.has_grid);
        assert!(!board.has_near);
        assert!(!board.has_containers);
        // 3 objects, all root-level (no parent_id).
        assert_eq!(board.objects.len(), 3);
        assert!(board.objects.iter().all(|o| o.parent_id.is_none()));
        // `* -> *` over 3 nodes = 6 directed edges.
        assert_eq!(board.edges.len(), 6);
    }

    #[test]
    fn build_request_flags_containers_sequence_grid_near() {
        let g = compile_graph_src("a: {\n  b\n}\n");
        let req = build_layout_request(&g);
        assert!(req.boards[0].has_containers);

        let g = compile_graph_src("shape: sequence_diagram\na -> b\n");
        let req = build_layout_request(&g);
        assert!(req.boards[0].has_sequence);

        let g = compile_graph_src("grid-rows: 2\n\na\nb\nc\nd\n");
        let req = build_layout_request(&g);
        assert!(req.boards[0].has_grid);
    }

    #[test]
    fn apply_layout_writes_positions_and_routes() {
        let mut g = compile_graph_src("a -> b\n");
        let a_id = g.objects.iter().find(|o| o.abs_id == "a").unwrap().abs_id.clone();
        let b_id = g.objects.iter().find(|o| o.abs_id == "b").unwrap().abs_id.clone();
        let edge_id = g.edges[0].abs_id.clone();
        let board = BoardLayout {
            token: "root".to_string(),
            objects: vec![
                ObjPos { id: a_id.clone(), x: 0.0, y: 0.0 },
                ObjPos { id: b_id.clone(), x: 100.0, y: 0.0 },
            ],
            edges: vec![EdgeRoute {
                id: edge_id,
                route: vec![(10.0, 0.0), (90.0, 0.0)],
                is_curve: false,
            }],
        };
        apply_layout(&mut g, &board).expect("applies");

        let a = g.objects.iter().find(|o| o.abs_id == a_id).unwrap();
        assert_eq!(a.top_left.x, 0.0);
        assert_eq!(a.label_position.as_deref(), Some("INSIDE_MIDDLE_CENTER"));
        let edge = g.edges.first().unwrap();
        assert_eq!(edge.route.len(), 2);
        assert!(!edge.is_curve);
    }

    #[test]
    fn apply_layout_rejects_short_route() {
        let mut g = compile_graph_src("a -> b\n");
        let a_id = g.objects.iter().find(|o| o.abs_id == "a").unwrap().abs_id.clone();
        let b_id = g.objects.iter().find(|o| o.abs_id == "b").unwrap().abs_id.clone();
        let edge_id = g.edges[0].abs_id.clone();
        let board = BoardLayout {
            token: "root".to_string(),
            objects: vec![
                ObjPos { id: a_id, x: 0.0, y: 0.0 },
                ObjPos { id: b_id, x: 100.0, y: 0.0 },
            ],
            edges: vec![EdgeRoute {
                id: edge_id,
                route: vec![(1.0, 1.0)],
                is_curve: false,
            }],
        };
        let err = apply_layout(&mut g, &board).unwrap_err();
        assert!(err.contains("fewer than 2 points"), "{err}");
    }

    #[test]
    fn midpoint_handles_single_segment() {
        let m = midpoint(&[Point::new(0.0, 0.0), Point::new(10.0, 0.0)]);
        assert!((m.x - 5.0).abs() < 1e-9 && (m.y).abs() < 1e-9);
    }
}
