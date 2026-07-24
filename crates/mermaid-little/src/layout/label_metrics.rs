//! Shared CJK-aware label width estimation.
//!
//! The byte-exact jsdom shim (`measure_html_markup_label` /
//! `font_metrics::text_width`) measures ASCII width accurately but
//! **under-measures CJK glyphs to ~40%** of their real render width — it has
//! no CJK fallback-font metrics. "账户同步" measures ~28px via the shim but
//! renders ~72px in a real browser. Any consumer that needs the label's
//! *visual* width — reserving layout space, or detecting collisions — must
//! floor the shim measurement with a per-glyph character estimate, or it will
//! under-reserve / fail to see overlaps.
//!
//! Never loosen the shim itself: it drives foreignObject sizing, which must
//! stay byte-exact with upstream `mermaid@11.14.0`. The floor is applied only
//! by opt-in consumers on top of the shim result.

/// One em at the rendered edge-label font size (`HTML_LABEL_FONT_SIZE = 16`),
/// i.e. what the browser actually paints. Layout reservation uses this so dagre
/// reserves the real on-screen width rather than the shim's under-estimate.
const EM: f64 = 16.0;

/// Best estimate of `text`'s rendered width, never below the shim `measured`
/// value. Latin glyphs estimate to ~0.56em (close to the shim, so pure-Latin
/// labels are effectively unchanged); CJK and fullwidth glyphs estimate to
/// ~1em, correcting the shim's under-measurement.
pub fn cjk_aware_label_width(text: &str, measured: f64) -> f64 {
    let per_glyph: f64 = text
        .chars()
        .map(|c| if is_cjk(c) { EM } else { EM * 0.56 })
        .sum();
    measured.max(per_glyph)
}

/// Whether a glyph renders ~1em wide (CJK / fullwidth) and is thus
/// under-measured by the shim. Used both inside [`cjk_aware_label_width`] and
/// to cheaply gate the floor on "label contains at least one CJK glyph", so
/// pure-Latin diagrams are not perturbed.
pub fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3000..=0x303F | 0x3040..=0x309F | 0x30A0..=0x30FF |
        0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0xFF00..=0xFFEF
    )
}
