//! Layout bridge — lets an external layout engine (elkjs running in the host)
//! drive d2-little's layout phase without a Rust port of ELK.
//!
//! d2's `d2elklayout` is a thin wrapper around elkjs (the official JS build of
//! ELK): it builds an ELK graph JSON with a specific option set, hands it to
//! `elk.layout`, then post-processes the result (parent-relative → absolute
//! coordinates, margin shrink-back, `TraceToShape`, `deleteBends`). This
//! module is a faithful Rust port of `d2layouts/d2elklayout/layout.go`
//! (d2 v0.7.1), so output is byte-comparable with upstream d2 elk.
//!
//! The host calls [`build_layout_request`] to get the complete ELK input
//! graph (plus feature flags for fallback decisions), runs `elkjs@0.8.2`
//! `elk.layout` on `request.elk_graph`, and hands the laid-out graph back via
//! [`apply_layout`], which writes positions/routes into the d2-little graph
//! exactly as d2 would. Export + SVG render then proceed unchanged.
//!
//! `elkjs` must be `0.8.2` — the exact version d2 v0.7.1 bundles (see
//! `d2layouts/d2elklayout/NOTICE.txt`). Other versions route differently.

use serde::{Deserialize, Serialize};

use crate::geo::{Point, Segment, Spacing};
use crate::graph::{Graph, ObjId};
use crate::label::{self, Position};
use crate::shape::ShapeOps;

// ---------------------------------------------------------------------------
// Constants — mirror d2's `d2elklayout` defaults.
// ---------------------------------------------------------------------------

const PORT_SPACING: f64 = 40.0;
const EDGE_NODE_SPACING: i64 = 40;

const DEFAULT_NODE_SPACING: i64 = 70;
const DEFAULT_PADDING: &str = "[top=50,left=50,bottom=50,right=50]";
const DEFAULT_EDGE_NODE_SPACING: i64 = 40;
const DEFAULT_SELF_LOOP_SPACING: i64 = 50;

// ---------------------------------------------------------------------------
// ELK DTOs — mirror d2's `ELKGraph` / `ELKNode` / `ELKEdge` / ... structs.
// serde ignores unknown fields (e.g. elkjs' `$H` hash), so the same structs
// deserialize both the input we build and the output elkjs returns.
// ---------------------------------------------------------------------------

/// ELK layout options. json keys match d2's `elkOpts` struct tags exactly
/// (including the non-standard `spacing.*` keys d2 uses for the configurable
/// between-layers spacings).
#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkOpts {
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.spacing.edgeNode")]
    pub edge_node: Option<i64>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "elk.layered.nodePlacement.bk.fixedAlignment"
    )]
    pub fixed_alignment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.layered.thoroughness")]
    pub thoroughness: Option<i64>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "elk.layered.spacing.edgeEdgeBetweenLayers"
    )]
    pub edge_edge_between_layers_spacing: Option<i64>,
    #[serde(rename = "elk.direction")]
    pub direction: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.hierarchyHandling")]
    pub hierarchy_handling: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.edgeLabels.inline")]
    pub inline_edge_labels: Option<bool>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "elk.layered.crossingMinimization.forceNodeModelOrder"
    )]
    pub force_node_model_order: Option<bool>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "elk.layered.considerModelOrder.strategy"
    )]
    pub consider_model_order: Option<String>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "elk.layered.cycleBreaking.strategy"
    )]
    pub cycle_breaking_strategy: Option<String>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "elk.layered.edgeRouting.selfLoopDistribution"
    )]
    pub self_loop_distribution: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.nodeSize.constraints")]
    pub node_size_constraints: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.contentAlignment")]
    pub content_alignment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.nodeSize.minimum")]
    pub node_size_minimum: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.port.side")]
    pub port_side: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.portConstraints")]
    pub port_constraints: Option<String>,

    // ConfigurableOpts (flattened — Go embeds the struct).
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.algorithm")]
    pub algorithm: Option<String>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "spacing.nodeNodeBetweenLayers"
    )]
    pub node_spacing: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "elk.padding")]
    pub padding: Option<String>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "spacing.edgeNodeBetweenLayers"
    )]
    pub edge_node_spacing: Option<i64>,
    #[serde(rename = "elk.spacing.nodeSelfLoop")]
    pub self_loop_spacing: i64,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkPort {
    pub id: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "layoutOptions")]
    pub layout_options: Option<ElkOpts>,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkLabel {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "layoutOptions")]
    pub layout_options: Option<ElkOpts>,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkEdgeSection {
    #[serde(rename = "startPoint")]
    pub start: ElkPoint,
    #[serde(rename = "endPoint")]
    pub end: ElkPoint,
    #[serde(default, rename = "bendPoints", skip_serializing_if = "Vec::is_empty")]
    pub bend_points: Vec<ElkPoint>,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkEdge {
    pub id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub targets: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sections: Vec<ElkEdgeSection>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<ElkLabel>,
    #[serde(default)]
    pub container: String,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkNode {
    pub id: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<ElkNode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ports: Vec<ElkPort>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<ElkLabel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "layoutOptions")]
    pub layout_options: Option<ElkOpts>,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
pub struct ElkGraph {
    #[serde(default)]
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "layoutOptions")]
    pub layout_options: Option<ElkOpts>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<ElkNode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub edges: Vec<ElkEdge>,
}

// ---------------------------------------------------------------------------
// Request / Result wrappers (wasm ↔ host).
// ---------------------------------------------------------------------------

/// Per-board layout request. `elk_graph` is the complete ELK input graph
/// built by [`build_layout_request`] — the host runs `elkjs.layout` on it
/// directly. The feature flags tell the host when to fall back to dagre
/// (`convert`) because the external layout can't reproduce d2's
/// sequence / grid / `near:` specialized layouts.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LayoutRequest {
    #[serde(default)]
    pub multi_board: bool,
    #[serde(default)]
    pub has_sequence: bool,
    #[serde(default)]
    pub has_grid: bool,
    #[serde(default)]
    pub has_near: bool,
    pub elk_graph: ElkGraph,
}

/// Host-supplied layout result: the laid-out ELK graph returned by
/// `elkjs.layout`. [`apply_layout`] walks it back into the d2-little graph.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LayoutResult {
    pub elk_graph: ElkGraph,
}

// ---------------------------------------------------------------------------
// Build request: walk the d2-little graph into an ELK input graph.
// Faithful port of d2 `Layout` graph-construction (layout.go:177-447).
// ---------------------------------------------------------------------------

pub fn build_layout_request(g: &mut Graph) -> LayoutRequest {
    let direction = root_direction(g);
    let dir_str = direction_string(direction);

    let self_loop_spacing = DEFAULT_SELF_LOOP_SPACING;
    let mut root_opts = ElkOpts {
        thoroughness: Some(8),
        edge_edge_between_layers_spacing: Some(50),
        edge_node: Some(EDGE_NODE_SPACING),
        hierarchy_handling: Some("INCLUDE_CHILDREN".to_string()),
        fixed_alignment: Some("BALANCED".to_string()),
        consider_model_order: Some("NODES_AND_EDGES".to_string()),
        cycle_breaking_strategy: Some("GREEDY_MODEL_ORDER".to_string()),
        node_size_constraints: Some("MINIMUM_SIZE".to_string()),
        content_alignment: Some("H_CENTER V_CENTER".to_string()),
        direction: dir_str.clone(),
        algorithm: Some("layered".to_string()),
        node_spacing: Some(DEFAULT_NODE_SPACING),
        edge_node_spacing: Some(DEFAULT_EDGE_NODE_SPACING),
        self_loop_spacing,
        ..Default::default()
    };
    let is_width = matches!(direction, Direction::Down | Direction::Up | Direction::None);
    let max_self_loop = children_max_self_loop(g, g.root, is_width);
    if self_loop_spacing == DEFAULT_SELF_LOOP_SPACING {
        root_opts.self_loop_spacing = root_opts.self_loop_spacing.max(max_self_loop / 2 + 5);
    }

    let mut elk_graph = ElkGraph {
        id: String::new(),
        layout_options: Some(root_opts),
        children: Vec::new(),
        edges: Vec::new(),
    };

    // Set label/icon positions for ELK (layout.go:214-217).
    for obj in g.objects.iter_mut() {
        position_labels_icons(obj);
    }

    let mut elk_nodes: std::collections::HashMap<ObjId, ElkNode> =
        std::collections::HashMap::new();

    // BFS walk (layout.go:223-356). Parent before child.
    let walk_order = bfs_walk_order(g, g.root);

    for &obj_id in &walk_order {
        let mut incoming = 0f64;
        let mut outgoing = 0f64;
        for e in &g.edges {
            if e.src == obj_id {
                outgoing += 1.0;
            }
            if e.dst == obj_id {
                incoming += 1.0;
            }
        }

        let mut width = g.objects[obj_id].width;
        let mut height = g.objects[obj_id].height;

        if incoming >= 2.0 || outgoing >= 2.0 && g.objects[obj_id].width_attr.is_none() {
            match direction {
                Direction::Right | Direction::Left => {
                    height = height.max(incoming.max(outgoing) * PORT_SPACING);
                }
                _ => {
                    width = width.max(incoming.max(outgoing) * PORT_SPACING);
                }
            }
        }

        if g.objects[obj_id].has_label() && g.objects[obj_id].has_icon() {
            height += g.objects[obj_id].label_dimensions.height as f64 + label::PADDING;
        }

        let (margin, _padding) = g.objects[obj_id].spacing_opt(label::PADDING, label::PADDING, false);
        let w = margin.left + width + margin.right;
        let h = margin.top + height + margin.bottom;

        let mut n = ElkNode {
            id: g.objects[obj_id].abs_id.clone(),
            width: w,
            height: h,
            ..Default::default()
        };

        if !g.objects[obj_id].children_array.is_empty() {
            let mut opts = ElkOpts {
                force_node_model_order: Some(true),
                thoroughness: Some(8),
                edge_edge_between_layers_spacing: Some(50),
                hierarchy_handling: Some("INCLUDE_CHILDREN".to_string()),
                fixed_alignment: Some("BALANCED".to_string()),
                edge_node: Some(EDGE_NODE_SPACING),
                consider_model_order: Some("NODES_AND_EDGES".to_string()),
                cycle_breaking_strategy: Some("GREEDY_MODEL_ORDER".to_string()),
                node_size_constraints: Some("MINIMUM_SIZE".to_string()),
                content_alignment: Some("H_CENTER V_CENTER".to_string()),
                direction: String::new(),
                // NOTE: d2 does NOT set `elk.algorithm` on container nodes —
                // only on the root. Setting it here makes elkjs treat the
                // compound as a separate layout root and skip hierarchical
                // child placement (children end up at 0,0). Inherited via
                // the root's `INCLUDE_CHILDREN`.
                node_spacing: Some(DEFAULT_NODE_SPACING),
                edge_node_spacing: Some(DEFAULT_EDGE_NODE_SPACING),
                self_loop_spacing,
                ..Default::default()
            };
            if opts.self_loop_spacing == DEFAULT_SELF_LOOP_SPACING {
                opts.self_loop_spacing =
                    opts.self_loop_spacing.max(children_max_self_loop(g, obj_id, is_width) / 2 + 5);
            }
            match direction {
                Direction::Down | Direction::Up | Direction::None => {
                    opts.node_size_minimum = Some(format!("({}, {})", h.ceil() as i64, w.ceil() as i64));
                }
                Direction::Right | Direction::Left => {
                    opts.node_size_minimum = Some(format!("({}, {})", w.ceil() as i64, h.ceil() as i64));
                }
            }
            if g.objects[obj_id].is_container() {
                let mut pad = parse_padding(DEFAULT_PADDING);
                pad = adjust_padding(g, obj_id, w, h, pad);
                opts.padding = Some(pad.to_string());
            }
            n.layout_options = Some(opts);
        } else {
            n.layout_options = Some(ElkOpts {
                self_loop_distribution: Some("EQUALLY".to_string()),
                ..Default::default()
            });
        }

        if g.objects[obj_id].has_label() {
            n.labels.push(ElkLabel {
                text: g.objects[obj_id].label.value.clone(),
                width: g.objects[obj_id].label_dimensions.width as f64,
                height: g.objects[obj_id].label_dimensions.height as f64,
                ..Default::default()
            });
        }

        // Store in a flat map; the tree is assembled after the walk so that
        // children added later land on the SAME node that ends up in the tree
        // (Go uses `*ELKNode` pointers; we assemble bottom-up by ObjId instead).
        elk_nodes.insert(obj_id, n);
    }

    // Assemble the ELK node tree from the flat map (parent → children).
    fn assemble(
        g: &Graph,
        obj_id: ObjId,
        elk_nodes: &mut std::collections::HashMap<ObjId, ElkNode>,
    ) -> Option<ElkNode> {
        let mut n = elk_nodes.remove(&obj_id)?;
        for &ch in &g.objects[obj_id].children_array.clone() {
            if let Some(child) = assemble(g, ch, elk_nodes) {
                n.children.push(child);
            }
        }
        Some(n)
    }
    let root_children = g.objects[g.root].children_array.clone();
    for &ch in &root_children {
        if let Some(n) = assemble(g, ch, &mut elk_nodes) {
            elk_graph.children.push(n);
        }
    }

    // Edges (layout.go:371-429). Non-SQL-table edges connect whole nodes by AbsID.
    for edge in &g.edges {
        let src = g.objects[edge.src].abs_id.clone();
        let dst = g.objects[edge.dst].abs_id.clone();
        let mut e = ElkEdge {
            id: edge.abs_id.clone(),
            sources: vec![src],
            targets: vec![dst],
            ..Default::default()
        };
        if !edge.label.value.is_empty() {
            e.labels.push(ElkLabel {
                text: edge.label.value.clone(),
                width: edge.label_dimensions.width as f64,
                height: edge.label_dimensions.height as f64,
                layout_options: Some(ElkOpts {
                    inline_edge_labels: Some(true),
                    ..Default::default()
                }),
                ..Default::default()
            });
        }
        elk_graph.edges.push(e);
    }

    let mut has_sequence = false;
    let mut has_grid = false;
    let mut has_near = false;
    if g.root_obj().is_sequence_diagram() {
        has_sequence = true;
    }
    if g.root_obj().is_grid_diagram() {
        has_grid = true;
    }
    if g.root_obj().near_key.is_some() {
        has_near = true;
    }
    for (idx, obj) in g.objects.iter().enumerate() {
        if idx == g.root {
            continue;
        }
        if obj.is_sequence_diagram() {
            has_sequence = true;
        }
        if obj.is_grid_diagram() {
            has_grid = true;
        }
        if obj.near_key.is_some() {
            has_near = true;
        }
    }

    LayoutRequest {
        multi_board: !g.layers.is_empty() || !g.scenarios.is_empty() || !g.steps.is_empty(),
        has_sequence,
        has_grid,
        has_near,
        elk_graph,
    }
}

// ---------------------------------------------------------------------------
// Apply result: write host-provided positions/routes into the graph.
// Faithful port of d2 `Layout` post-processing (layout.go:484-648 + deleteBends).
// ---------------------------------------------------------------------------

pub fn apply_layout(g: &mut Graph, result: &LayoutResult) -> Result<(), String> {
    let laid = &result.elk_graph;

    let mut elk_by_id: std::collections::HashMap<&str, &ElkNode> = std::collections::HashMap::new();
    for c in &laid.children {
        index_elk_nodes(c, &mut elk_by_id);
    }
    let mut elk_edge_by_id: std::collections::HashMap<&str, &ElkEdge> = std::collections::HashMap::new();
    for e in &laid.edges {
        elk_edge_by_id.insert(e.id.as_str(), e);
    }

    // Apply object positions (layout.go:484-499). BFS so parents are placed first.
    let walk_order = bfs_walk_order(g, g.root);
    let mut by_id: std::collections::HashMap<String, ObjId> = std::collections::HashMap::new();
    for &obj_id in &walk_order {
        let parent = g.objects[obj_id].parent;
        let (parent_x, parent_y) = match parent {
            Some(p) if p != g.root => (g.objects[p].top_left.x, g.objects[p].top_left.y),
            _ => (0.0, 0.0),
        };
        let abs_id = g.objects[obj_id].abs_id.clone();
        if let Some(n) = elk_by_id.get(abs_id.as_str()) {
            let obj = &mut g.objects[obj_id];
            obj.top_left = Point::new(parent_x + n.x, parent_y + n.y);
            obj.width = n.width.ceil();
            obj.height = n.height.ceil();
            obj.update_box();
        }
        by_id.insert(abs_id, obj_id);
    }

    // Apply edge routes (layout.go:501-529).
    for ei in 0..g.edges.len() {
        let abs_id = g.edges[ei].abs_id.clone();
        let Some(e) = elk_edge_by_id.get(abs_id.as_str()).copied() else {
            continue;
        };
        let (parent_x, parent_y) = if !e.container.is_empty() {
            if let Some(&cid) = by_id.get(e.container.as_str()) {
                (g.objects[cid].top_left.x, g.objects[cid].top_left.y)
            } else {
                (0.0, 0.0)
            }
        } else {
            (0.0, 0.0)
        };
        let mut points: Vec<Point> = Vec::new();
        for s in &e.sections {
            points.push(Point::new(parent_x + s.start.x, parent_y + s.start.y));
            for bp in &s.bend_points {
                points.push(Point::new(parent_x + bp.x, parent_y + bp.y));
            }
            points.push(Point::new(parent_x + s.end.x, parent_y + s.end.y));
        }
        g.edges[ei].route = points;
        g.edges[ei].is_curve = false;
    }

    // Margin shrink-back + edge shifting (layout.go:531-598).
    let adjustments: Vec<Spacing> = g
        .objects
        .iter()
        .map(|o| o.spacing_opt(label::PADDING, label::PADDING, false).0)
        .collect();
    apply_margins(g, &adjustments);

    // TraceToShape + label position + 3d/multiple (layout.go:600-644).
    for ei in 0..g.edges.len() {
        if g.edges[ei].route.len() < 2 {
            continue;
        }
        let src_id = g.edges[ei].src;
        let dst_id = g.edges[ei].dst;
        let start = g.edges[ei].route[0];
        let end = g.edges[ei].route[g.edges[ei].route.len() - 1];

        let (src_dx, src_dy) = g.objects[src_id].get_modifier_element_adjustments();
        let mut original_src_tl = None;
        if src_dx != 0.0 || src_dy != 0.0 {
            if start.x > g.objects[src_id].top_left.x + src_dx
                && start.y < g.objects[src_id].top_left.y + g.objects[src_id].height - src_dy
            {
                original_src_tl = Some(g.objects[src_id].top_left);
                let o = original_src_tl.unwrap();
                g.objects[src_id].top_left = Point::new(o.x + src_dx, o.y - src_dy);
                g.objects[src_id].update_box();
            }
        }
        let (dst_dx, dst_dy) = g.objects[dst_id].get_modifier_element_adjustments();
        let mut original_dst_tl = None;
        if dst_dx != 0.0 || dst_dy != 0.0 {
            if end.x > g.objects[dst_id].top_left.x + dst_dx
                && end.y < g.objects[dst_id].top_left.y + g.objects[dst_id].height - dst_dy
            {
                original_dst_tl = Some(g.objects[dst_id].top_left);
                let o = original_dst_tl.unwrap();
                g.objects[dst_id].top_left = Point::new(o.x + dst_dx, o.y - dst_dy);
                g.objects[dst_id].update_box();
            }
        }

        let route = g.edges[ei].route.clone();
        let (new_start, new_end) = g.edges[ei].trace_to_shape(&route, 0, route.len() - 1, g);
        let has_label = !g.edges[ei].label.value.is_empty();
        g.edges[ei].route = route[new_start..=new_end].to_vec();
        if has_label {
            g.edges[ei].label_position = Some(Position::InsideMiddleCenter.as_str().to_string());
        }

        if let Some(o) = original_src_tl {
            g.objects[src_id].top_left = o;
            g.objects[src_id].update_box();
        }
        if let Some(o) = original_dst_tl {
            g.objects[dst_id].top_left = o;
            g.objects[dst_id].update_box();
        }
    }

    delete_bends(g);

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Direction {
    Down,
    Up,
    Right,
    Left,
    None,
}

fn root_direction(g: &Graph) -> Direction {
    match g.root_obj().direction.value.as_str() {
        "down" => Direction::Down,
        "up" => Direction::Up,
        "right" => Direction::Right,
        "left" => Direction::Left,
        _ => Direction::None,
    }
}

fn direction_string(d: Direction) -> String {
    match d {
        Direction::Down => "DOWN".to_string(),
        Direction::Up => "UP".to_string(),
        Direction::Right => "RIGHT".to_string(),
        Direction::Left => "LEFT".to_string(),
        Direction::None => "DOWN".to_string(),
    }
}

fn bfs_walk_order(g: &Graph, root: ObjId) -> Vec<ObjId> {
    let mut out = Vec::new();
    fn rec(g: &Graph, obj: ObjId, out: &mut Vec<ObjId>) {
        for &ch in &g.objects[obj].children_array {
            out.push(ch);
            rec(g, ch, out);
        }
    }
    rec(g, root, &mut out);
    out
}

fn index_elk_nodes<'a>(
    node: &'a ElkNode,
    map: &mut std::collections::HashMap<&'a str, &'a ElkNode>,
) {
    map.insert(node.id.as_str(), node);
    for c in &node.children {
        index_elk_nodes(c, map);
    }
}

fn children_max_self_loop(g: &Graph, parent: ObjId, is_width: bool) -> i64 {
    let mut max = 0i64;
    for &ch in &g.objects[parent].children_array {
        for e in &g.edges {
            if e.src == e.dst && e.src == ch && !e.label.value.is_empty() {
                let v = if is_width {
                    e.label_dimensions.width as i64
                } else {
                    e.label_dimensions.height as i64
                };
                max = max.max(v);
            }
        }
    }
    max
}

/// d2 `positionLabelsIcons` (layout.go:1110-1142).
fn position_labels_icons(obj: &mut crate::graph::Object) {
    if obj.icon.is_some() && obj.icon_position.is_none() {
        if !obj.children_array.is_empty() {
            obj.icon_position = Some(Position::InsideTopLeft.as_str().to_string());
            if obj.label_position.is_none() {
                obj.label_position = Some(Position::InsideTopRight.as_str().to_string());
                return;
            }
        } else if obj.sql_table.is_some() || obj.class.is_some() || !obj.language.is_empty() {
            obj.icon_position = Some(Position::OutsideTopLeft.as_str().to_string());
        } else {
            obj.icon_position = Some(Position::InsideMiddleCenter.as_str().to_string());
        }
    }
    if obj.has_label() && obj.label_position.is_none() {
        if !obj.children_array.is_empty() {
            obj.label_position = Some(Position::InsideTopCenter.as_str().to_string());
        } else if obj.has_outside_bottom_label() {
            obj.label_position = Some(Position::OutsideBottomCenter.as_str().to_string());
        } else if obj.icon.is_some() {
            obj.label_position = Some(Position::InsideTopCenter.as_str().to_string());
        } else {
            obj.label_position = Some(Position::InsideMiddleCenter.as_str().to_string());
        }
        if obj.label_dimensions.width as f64 > obj.width
            || obj.label_dimensions.height as f64 > obj.height
        {
            if !obj.children_array.is_empty() {
                obj.label_position = Some(Position::OutsideTopCenter.as_str().to_string());
            } else {
                obj.label_position = Some(Position::OutsideBottomCenter.as_str().to_string());
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Margin shrink-back + edge shifting (layout.go:531-598).
// ---------------------------------------------------------------------------

fn apply_margins(g: &mut Graph, adjustments: &[Spacing]) {
    let mut obj_edges: std::collections::HashMap<ObjId, Vec<usize>> =
        std::collections::HashMap::new();
    for (ei, e) in g.edges.iter().enumerate() {
        obj_edges.entry(e.src).or_default().push(ei);
        if e.dst != e.src {
            obj_edges.entry(e.dst).or_default().push(ei);
        }
    }

    for obj_id in 0..g.objects.len() {
        let margin = adjustments[obj_id];
        if margin.left == 0.0 && margin.right == 0.0 && margin.top == 0.0 && margin.bottom == 0.0 {
            continue;
        }
        let edges: Vec<usize> = obj_edges.get(&obj_id).cloned().unwrap_or_default();
        let tl_x = g.objects[obj_id].top_left.x;
        let tl_y = g.objects[obj_id].top_left.y;
        let w = g.objects[obj_id].width;
        let h = g.objects[obj_id].height;

        if margin.left > 0.0 {
            for &ei in &edges {
                let e = &mut g.edges[ei];
                let l = e.route.len();
                if l == 0 { continue; }
                if e.src == obj_id && e.route[0].x == tl_x { e.route[0].x += margin.left; }
                if e.dst == obj_id && e.route[l - 1].x == tl_x { e.route[l - 1].x += margin.left; }
            }
            g.objects[obj_id].top_left.x += margin.left;
            shift_descendants(g, obj_id, margin.left / 2.0, 0.0);
            g.objects[obj_id].width -= margin.left;
            g.objects[obj_id].update_box();
        }
        if margin.right > 0.0 {
            for &ei in &edges {
                let e = &mut g.edges[ei];
                let l = e.route.len();
                if l == 0 { continue; }
                if e.src == obj_id && e.route[0].x == tl_x + w { e.route[0].x -= margin.right; }
                if e.dst == obj_id && e.route[l - 1].x == tl_x + w { e.route[l - 1].x -= margin.right; }
            }
            shift_descendants(g, obj_id, -margin.right / 2.0, 0.0);
            g.objects[obj_id].width -= margin.right;
            g.objects[obj_id].update_box();
        }
        if margin.top > 0.0 {
            for &ei in &edges {
                let e = &mut g.edges[ei];
                let l = e.route.len();
                if l == 0 { continue; }
                if e.src == obj_id && e.route[0].y == tl_y { e.route[0].y += margin.top; }
                if e.dst == obj_id && e.route[l - 1].y == tl_y { e.route[l - 1].y += margin.top; }
            }
            g.objects[obj_id].top_left.y += margin.top;
            shift_descendants(g, obj_id, 0.0, margin.top / 2.0);
            g.objects[obj_id].height -= margin.top;
            g.objects[obj_id].update_box();
        }
        if margin.bottom > 0.0 {
            for &ei in &edges {
                let e = &mut g.edges[ei];
                let l = e.route.len();
                if l == 0 { continue; }
                if e.src == obj_id && e.route[0].y == tl_y + h { e.route[0].y -= margin.bottom; }
                if e.dst == obj_id && e.route[l - 1].y == tl_y + h { e.route[l - 1].y -= margin.bottom; }
            }
            shift_descendants(g, obj_id, 0.0, -margin.bottom / 2.0);
            g.objects[obj_id].height -= margin.bottom;
            g.objects[obj_id].update_box();
        }
    }
}

/// d2 `Object.ShiftDescendants` (d2graph/layout.go:103-141).
fn shift_descendants(g: &mut Graph, obj: ObjId, dx: f64, dy: f64) {
    let n_edges = g.edges.len();
    let mut moved: std::collections::HashSet<usize> = std::collections::HashSet::new();
    for ei in 0..n_edges {
        let (s, d) = (g.edges[ei].src, g.edges[ei].dst);
        if is_descendant_of(g, s, obj) && is_descendant_of(g, d, obj) {
            for p in &mut g.edges[ei].route {
                p.x += dx;
                p.y += dy;
            }
            moved.insert(ei);
        }
    }

    let descendants = descendants_list(g, obj);
    for &curr in &descendants {
        g.objects[curr].top_left.x += dx;
        g.objects[curr].top_left.y += dy;
        g.objects[curr].update_box();
        for ei in 0..n_edges {
            if moved.contains(&ei) {
                continue;
            }
            let (s, d) = (g.edges[ei].src, g.edges[ei].dst);
            let is_src = s == curr;
            let is_dst = d == curr;
            if is_src && is_dst {
                for p in &mut g.edges[ei].route {
                    p.x += dx;
                    p.y += dy;
                }
            } else if is_src {
                if dx == 0.0 { shift_start(g, ei, dy, false); }
                else if dy == 0.0 { shift_start(g, ei, dx, true); }
                else { g.edges[ei].route[0].x += dx; g.edges[ei].route[0].y += dy; }
            } else if is_dst {
                if dx == 0.0 { shift_end(g, ei, dy, false); }
                else if dy == 0.0 { shift_end(g, ei, dx, true); }
                else { let l = g.edges[ei].route.len(); g.edges[ei].route[l - 1].x += dx; g.edges[ei].route[l - 1].y += dy; }
            }
            if is_src || is_dst {
                moved.insert(ei);
            }
        }
    }
}

fn is_descendant_of(g: &Graph, self_id: ObjId, ancestor: ObjId) -> bool {
    if self_id == ancestor {
        return true;
    }
    let mut p = g.objects[self_id].parent;
    while let Some(pid) = p {
        if pid == ancestor { return true; }
        p = g.objects[pid].parent;
    }
    false
}

fn descendants_list(g: &Graph, obj: ObjId) -> Vec<ObjId> {
    let mut out = Vec::new();
    fn rec(g: &Graph, parent: ObjId, out: &mut Vec<ObjId>) {
        for &ch in &g.objects[parent].children_array {
            out.push(ch);
            rec(g, ch, out);
        }
    }
    rec(g, obj, &mut out);
    out
}

fn shift_start(g: &mut Graph, ei: usize, delta: f64, is_horizontal: bool) {
    let route = &mut g.edges[ei].route;
    if route.len() < 2 { return; }
    let pos = |p: &Point| if is_horizontal { p.x } else { p.y };
    let is_increasing = pos(&route[0]) < pos(&route[1]);
    if is_horizontal { route[0].x += delta; } else { route[0].y += delta; }
    if is_increasing == (delta < 0.0) { return; }
    let start = route[0];
    let is_aligned = |p: &Point| if is_horizontal { p.y == start.y } else { p.x == start.x };
    let is_past_start = |p: &Point| {
        if delta > 0.0 { pos(p) < pos(&start) } else { pos(p) > pos(&start) }
    };
    let mut to_remove = vec![false; route.len()];
    let mut needs_removal = false;
    for i in 1..route.len().saturating_sub(1) {
        if !is_aligned(&route[i]) { break; }
        if is_past_start(&route[i]) { to_remove[i] = true; needs_removal = true; }
    }
    if needs_removal {
        let mut new_route = Vec::with_capacity(route.len());
        for (i, p) in route.iter().enumerate() {
            if !to_remove[i] { new_route.push(*p); }
        }
        *route = new_route;
    }
}

fn shift_end(g: &mut Graph, ei: usize, delta: f64, is_horizontal: bool) {
    let route = &mut g.edges[ei].route;
    if route.len() < 2 { return; }
    let pos = |p: &Point| if is_horizontal { p.x } else { p.y };
    let last = route.len() - 1;
    let is_increasing = pos(&route[last - 1]) < pos(&route[last]);
    if is_horizontal { route[last].x += delta; } else { route[last].y += delta; }
    if is_increasing == (delta > 0.0) { return; }
    let end = route[last];
    let is_aligned = |p: &Point| if is_horizontal { p.y == end.y } else { p.x == end.x };
    let is_past_end = |p: &Point| {
        if delta > 0.0 { pos(p) < pos(&end) } else { pos(p) > pos(&end) }
    };
    let mut to_remove = vec![false; route.len()];
    let mut needs_removal = false;
    let mut i = route.len().saturating_sub(2);
    while i > 0 {
        if !is_aligned(&route[i]) { break; }
        if is_past_end(&route[i]) { to_remove[i] = true; needs_removal = true; }
        i -= 1;
    }
    if needs_removal {
        let mut new_route = Vec::with_capacity(route.len());
        for (i, p) in route.iter().enumerate() {
            if !to_remove[i] { new_route.push(*p); }
        }
        *route = new_route;
    }
}

// ---------------------------------------------------------------------------
// deleteBends (layout.go:659-884).
// ---------------------------------------------------------------------------

fn delete_bends(g: &mut Graph) {
    // S-shapes at source/target (layout.go:662-773).
    for &is_source in &[true, false] {
        for ei in 0..g.edges.len() {
            if g.edges[ei].route.len() < 4 || g.edges[ei].src == g.edges[ei].dst {
                continue;
            }
            let (endpoint_id, start_idx, corner_idx, end_idx, column_index) = if is_source {
                (g.edges[ei].src, 0usize, 1usize, 2usize, g.edges[ei].src_table_column_index)
            } else {
                let l = g.edges[ei].route.len();
                (g.edges[ei].dst, l - 1, l - 2, l - 3, g.edges[ei].dst_table_column_index)
            };
            let start = g.edges[ei].route[start_idx];
            let corner = g.edges[ei].route[corner_idx];
            let end = g.edges[ei].route[end_idx];
            let (dx, dy) = g.objects[endpoint_id].get_modifier_element_adjustments();
            let endpoint_tl = g.objects[endpoint_id].top_left;
            let endpoint_w = g.objects[endpoint_id].width;
            let endpoint_h = g.objects[endpoint_id].height;

            let is_horizontal = start.y.ceil() == corner.y.ceil();
            let attached = match column_index {
                Some(_) => true,
                None if is_horizontal => {
                    end.y > endpoint_tl.y + 10.0 - dy && end.y < endpoint_tl.y + endpoint_h - 10.0
                }
                None => {
                    end.x > endpoint_tl.x + 10.0 && end.x < endpoint_tl.x + endpoint_w - 10.0 + dx
                }
            };
            if !attached { continue; }

            let new_start_raw = if is_horizontal { Point::new(start.x, end.y) } else { Point::new(end.x, start.y) };
            let endpoint_box = g.objects[endpoint_id].box_;
            let shape_type = crate::target::dsl_shape_to_shape_type(&g.objects[endpoint_id].shape.value);
            let endpoint_shape = crate::shape::Shape::new(shape_type, endpoint_box);
            let new_start = crate::shape::trace_to_shape_border(&endpoint_shape, &new_start_raw, &end);

            let old_segment = Segment::new(start, corner);
            let new_segment = Segment::new(new_start, end);
            let old_intersects = count_object_intersects(g, ei, &old_segment);
            let new_intersects = count_object_intersects(g, ei, &new_segment);
            if new_intersects > old_intersects { continue; }
            let (old_cross, old_over, old_close, old_touch) = count_edge_intersects(g, ei, &old_segment);
            let (new_cross, new_over, new_close, new_touch) = count_edge_intersects(g, ei, &new_segment);
            if new_cross > old_cross || new_over > old_over || new_close > old_close || new_touch > old_touch {
                continue;
            }

            let mut new_route = Vec::with_capacity(g.edges[ei].route.len() - 1);
            if is_source {
                new_route.push(new_start);
                new_route.extend_from_slice(&g.edges[ei].route[3..]);
            } else {
                let l = g.edges[ei].route.len();
                new_route.extend_from_slice(&g.edges[ei].route[..l - 3]);
                new_route.push(new_start);
            }
            g.edges[ei].route = new_route;
        }
    }

    // Ladders (layout.go:775-883).
    use std::collections::HashMap;
    let mut points: HashMap<(i64, i64), i64> = HashMap::new();
    for e in &g.edges {
        for p in &e.route {
            *points.entry((p.x.round() as i64, p.y.round() as i64)).or_insert(0) += 1;
        }
    }
    for ei in 0..g.edges.len() {
        if g.edges[ei].route.len() < 6 || g.edges[ei].src == g.edges[ei].dst { continue; }
        let mut i = 1;
        let len = g.edges[ei].route.len();
        while i + 3 < len {
            let before = g.edges[ei].route[i - 1];
            let start = g.edges[ei].route[i];
            let corner = g.edges[ei].route[i + 1];
            let end = g.edges[ei].route[i + 2];
            let after = g.edges[ei].route[i + 3];
            let c = *points.get(&(corner.x.round() as i64, corner.y.round() as i64)).unwrap_or(&0);
            if c > 1 { i += 1; continue; }

            let (new_corner, not_ladder) = if start.x.ceil() == corner.x.ceil() {
                let nc = Point::new(end.x, start.y);
                let nl = (end.x > start.x) != (start.x > before.x) || (end.y > start.y) != (after.y > end.y);
                (nc, nl)
            } else {
                let nc = Point::new(start.x, end.y);
                let nl = (end.y > start.y) != (start.y > before.y) || (end.x > start.x) != (after.x > end.x);
                (nc, nl)
            };
            if not_ladder { i += 1; continue; }

            let old_s1 = Segment::new(start, corner);
            let old_s2 = Segment::new(corner, end);
            let new_s1 = Segment::new(start, new_corner);
            let new_s2 = Segment::new(new_corner, end);
            let old_int = count_object_intersects(g, ei, &old_s1) + count_object_intersects(g, ei, &old_s2);
            let new_int = count_object_intersects(g, ei, &new_s1) + count_object_intersects(g, ei, &new_s2);
            if new_int > old_int { i += 1; continue; }
            let (oc1, oo1, oc1c, ot1) = count_edge_intersects(g, ei, &old_s1);
            let (oc2, oo2, oc2c, ot2) = count_edge_intersects(g, ei, &old_s2);
            let (nc1, no1, nc1c, nt1) = count_edge_intersects(g, ei, &new_s1);
            let (nc2, no2, nc2c, nt2) = count_edge_intersects(g, ei, &new_s2);
            let (old_cross, old_over, old_close, old_touch) = (oc1 + oc2, oo1 + oo2, oc1c + oc2c, ot1 + ot2);
            let (new_cross, new_over, new_close, new_touch) = (nc1 + nc2, no1 + no2, nc1c + nc2c, nt1 + nt2);
            if new_cross > old_cross || new_over > old_over || new_close > old_close || new_touch > old_touch {
                i += 1; continue;
            }
            // commit
            let mut new_route = Vec::with_capacity(g.edges[ei].route.len() - 1);
            new_route.extend_from_slice(&g.edges[ei].route[..i]);
            new_route.push(new_corner);
            new_route.extend_from_slice(&g.edges[ei].route[i + 3..]);
            g.edges[ei].route = new_route;
            break;
        }
    }
}

fn count_object_intersects(g: &Graph, ei: usize, s: &Segment) -> i64 {
    let src = g.edges[ei].src;
    let dst = g.edges[ei].dst;
    let mut count = 0i64;
    for (i, o) in g.objects.iter().enumerate() {
        if i == src || i == dst { continue; }
        if o.box_.intersects_segment(s, EDGE_NODE_SPACING as f64 - 1.0) {
            count += 1;
        }
    }
    count
}

fn count_edge_intersects(g: &Graph, ei: usize, s: &Segment) -> (i64, i64, i64, i64) {
    let is_horizontal = s.start.y.ceil() == s.end.y.ceil();
    let mut crossings = 0i64;
    let mut overlaps = 0i64;
    let mut close_overlaps = 0i64;
    let mut touching = 0i64;
    for (oi, e) in g.edges.iter().enumerate() {
        if oi == ei { continue; }
        for w in e.route.windows(2) {
            let other = Segment::new(w[0], w[1]);
            let other_is_horizontal = other.start.y.ceil() == other.end.y.ceil();
            if is_horizontal == other_is_horizontal {
                if s.overlaps(&other, !is_horizontal, 0.0) {
                    if is_horizontal {
                        let d = (s.start.y - other.start.y).abs();
                        if d < EDGE_NODE_SPACING as f64 / 2.0 {
                            overlaps += 1;
                            if d < EDGE_NODE_SPACING as f64 / 4.0 {
                                close_overlaps += 1;
                                if d < 1.0 { touching += 1; }
                            }
                        }
                    } else {
                        let d = (s.start.x - other.start.x).abs();
                        if d < EDGE_NODE_SPACING as f64 / 2.0 {
                            overlaps += 1;
                            if d < EDGE_NODE_SPACING as f64 / 4.0 {
                                close_overlaps += 1;
                                if d < 1.0 { touching += 1; }
                            }
                        }
                    }
                }
            } else if s.intersects(&other) {
                crossings += 1;
            }
        }
    }
    (crossings, overlaps, close_overlaps, touching)
}

// ---------------------------------------------------------------------------
// Padding (layout.go:966-1108).
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Copy)]
struct ShapePadding {
    top: i64,
    left: i64,
    bottom: i64,
    right: i64,
}

impl ShapePadding {
    fn to_string(&self) -> String {
        format!("[top={},left={},bottom={},right={}]", self.top, self.left, self.bottom, self.right)
    }
}

fn parse_padding(in_: &str) -> ShapePadding {
    fn extract(haystack: &str, key: &str) -> i64 {
        let pat = format!("{}=", key);
        if let Some(idx) = haystack.find(&pat) {
            let rest = &haystack[idx + pat.len()..];
            let num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(v) = num.parse::<i64>() { return v; }
        }
        0
    }
    ShapePadding {
        top: extract(in_, "top"),
        left: extract(in_, "left"),
        bottom: extract(in_, "bottom"),
        right: extract(in_, "right"),
    }
}

/// d2 `adjustPadding` (layout.go:1018-1108).
fn adjust_padding(g: &Graph, obj_id: ObjId, width: f64, height: f64, padding: ShapePadding) -> ShapePadding {
    let obj = &g.objects[obj_id];
    if !obj.is_container() { return padding; }
    let mut extra_top = 0i64;
    let mut extra_bottom = 0i64;
    let mut extra_left = 0i64;
    let mut extra_right = 0i64;
    if obj.has_label() && obj.label_position.is_some() {
        let label_height = obj.label_dimensions.height as i64 + 2 * label::PADDING as i64;
        let label_width = obj.label_dimensions.width as i64 + 2 * label::PADDING as i64;
        match Position::from_string(obj.label_position.as_deref().unwrap_or("")) {
            Position::InsideTopLeft | Position::InsideTopCenter | Position::InsideTopRight => extra_top = label_height,
            Position::InsideBottomLeft | Position::InsideBottomCenter | Position::InsideBottomRight => extra_bottom = label_height,
            Position::InsideMiddleLeft => extra_left = label_width,
            Position::InsideMiddleRight => extra_right = label_width,
            _ => {}
        }
    }
    let max_icon_size = crate::target::MAX_ICON_SIZE as i64 + 2 * label::PADDING as i64;
    if obj.icon.is_some() && obj.icon_position.is_some() {
        match Position::from_string(obj.icon_position.as_deref().unwrap_or("")) {
            Position::InsideTopLeft | Position::InsideTopCenter | Position::InsideTopRight => extra_top = extra_top.max(max_icon_size),
            Position::InsideBottomLeft | Position::InsideBottomCenter | Position::InsideBottomRight => extra_bottom = extra_bottom.max(max_icon_size),
            Position::InsideMiddleLeft => extra_left = extra_left.max(max_icon_size),
            Position::InsideMiddleRight => extra_right = extra_right.max(max_icon_size),
            _ => {}
        }
    }
    let mut max_child_w = f64::NEG_INFINITY;
    let mut max_child_h = f64::NEG_INFINITY;
    for &c in &obj.children_array {
        if g.objects[c].width > max_child_w { max_child_w = g.objects[c].width; }
        if g.objects[c].height > max_child_h { max_child_h = g.objects[c].height; }
    }
    let w = width + max_child_w + (extra_left + extra_right) as f64;
    let h = height + max_child_h + (extra_top + extra_bottom) as f64;
    let content_box = crate::geo::Box2D::new(Point::new(0.0, 0.0), w, h);
    let shape_type = crate::target::dsl_shape_to_shape_type(&obj.shape.value);
    let s = crate::shape::Shape::new(shape_type, content_box);
    let inner_box = s.get_inner_box();

    let inner_top = inner_box.top_left.y.ceil() as i64;
    let inner_bottom = (h - (inner_box.top_left.y + inner_box.height)).ceil() as i64;
    let inner_left = inner_box.top_left.x.ceil() as i64;
    let inner_right = (w - (inner_box.top_left.x + inner_box.width)).ceil() as i64;

    ShapePadding {
        top: padding.top.max(inner_top + extra_top),
        bottom: padding.bottom.max(inner_bottom + extra_bottom),
        left: padding.left.max(inner_left + extra_left),
        right: padding.right.max(inner_right + extra_right),
    }
}

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
        let mut g = compile_graph_src("a\nb\nc\n\n* -> *\n");
        let req = build_layout_request(&mut g);
        assert!(!req.has_sequence);
        assert!(!req.has_grid);
        assert!(!req.has_near);
        assert!(!req.multi_board);
        assert_eq!(req.elk_graph.children.len(), 3);
        assert_eq!(req.elk_graph.edges.len(), 6);
        // `* -> *` (no label) → edges carry no ELK label.
        for e in &req.elk_graph.edges {
            assert!(e.labels.is_empty());
        }
        let opts = req.elk_graph.layout_options.as_ref().unwrap();
        assert_eq!(opts.cycle_breaking_strategy.as_deref(), Some("GREEDY_MODEL_ORDER"));
        assert_eq!(opts.consider_model_order.as_deref(), Some("NODES_AND_EDGES"));
        assert_eq!(opts.fixed_alignment.as_deref(), Some("BALANCED"));
        assert_eq!(opts.direction, "DOWN");
        assert_eq!(opts.node_spacing, Some(70));
    }

    #[test]
    fn build_request_flags_sequence_grid() {
        let mut g = compile_graph_src("shape: sequence_diagram\na -> b\n");
        assert!(build_layout_request(&mut g).has_sequence);

        let mut g = compile_graph_src("grid-rows: 2\n\na\nb\nc\nd\n");
        assert!(build_layout_request(&mut g).has_grid);
    }

    #[test]
    fn issue34_request_has_6_edges_direction_down() {
        let mut g = compile_graph_src("Spiderman 1\nSpiderman 2\nSpiderman 3\n\n* -> *: x\n");
        let req = build_layout_request(&mut g);
        assert_eq!(req.elk_graph.children.len(), 3);
        assert_eq!(req.elk_graph.edges.len(), 6);
        assert_eq!(req.elk_graph.layout_options.as_ref().unwrap().direction, "DOWN");
        // Labeled edges carry an inline edge label (d2 InlineEdgeLabels).
        for e in &req.elk_graph.edges {
            assert_eq!(e.labels.len(), 1);
            assert_eq!(e.labels[0].layout_options.as_ref().unwrap().inline_edge_labels, Some(true));
        }
    }
}
