//! Opt-in render options.
//!
//! `RenderOptions::default()` is byte-exact with upstream `mermaid@11.14.0` —
//! every field defaults to off/false. Fields that improve readability at the
//! cost of byte-exactness are opt-in, so the default `convert` / `convert_with_id`
//! path is unchanged.
//!
//! See `convert_with_options`.

/// Non-byte-exact readability tweaks. All off by default.
///
/// `edge_label_decluster` — flowchart edge labels are normally placed at the
/// dagre spline midpoint with no mutual avoidance, so labels on edges that
/// share a midpoint region overlap (opposite-direction edges between the same
/// node pair, dense fan-ins, etc.). This is upstream behaviour (confirmed via
/// mermaid.live, issue #93), not a Supramark regression. When enabled:
/// (1) the layout-time edge-label width is floored to its real rendered width
/// for CJK labels (the byte-exact shim under-measures CJK), so dagre reserves
/// enough inter-node space for the label to fit instead of overlapping an
/// endpoint node, and the emitted `<foreignObject>` uses that same width so
/// the visible text is centred between its endpoints rather than overflowing
/// a too-narrow box;
/// (2) a render-time pass nudges any still-overlapping label boxes apart.
/// Both are off by default, so the default path stays byte-exact.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RenderOptions {
    pub edge_label_decluster: bool,
}

impl RenderOptions {
    /// All options off — byte-exact with upstream.
    pub const fn byte_exact() -> Self {
        Self {
            edge_label_decluster: false,
        }
    }

    /// Builder: enable edge-label collision avoidance.
    pub const fn with_edge_label_decluster(mut self, on: bool) -> Self {
        self.edge_label_decluster = on;
        self
    }
}
