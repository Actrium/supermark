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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_cjk_detects_cjk_and_fullwidth() {
        // CJK ideographs + kana + fullwidth latin/space all render ~1em.
        assert!(is_cjk('账'));
        assert!(is_cjk('あ')); // hiragana
        assert!(is_cjk('カ')); // katakana
        assert!(is_cjk('Ａ')); // fullwidth latin (FF01-FF5E)
        assert!(is_cjk('　')); // fullwidth space (3000)
        // ASCII / Latin-1 render narrower and must not trigger the floor.
        assert!(!is_cjk('A'));
        assert!(!is_cjk(' '));
        assert!(!is_cjk('-'));
        assert!(!is_cjk('é'));
    }

    #[test]
    fn cjk_floors_to_one_em_per_glyph() {
        // "账户同步" = 4 CJK glyphs → 4 × EM = 64; shim (~28) is below, so floor wins.
        assert_eq!(cjk_aware_label_width("账户同步", 28.0), 64.0);
    }

    #[test]
    fn cjk_keeps_shim_when_already_wider() {
        // If the shim measured wider than the per-glyph estimate, keep the shim.
        assert_eq!(cjk_aware_label_width("账户同步", 80.0), 80.0);
    }

    #[test]
    fn latin_estimates_below_cjk_floor() {
        // Latin glyphs estimate ~0.56em; "ok" → 2 × 16 × 0.56 = 17.92.
        // (Call sites gate on is_cjk, so pure-Latin labels never hit this path;
        // this pins the coefficient for mixed labels.)
        assert!((cjk_aware_label_width("ok", 12.0) - 17.92).abs() < 1e-9);
    }

    #[test]
    fn mixed_takes_max_of_estimate_and_shim() {
        // "A账" → 0.56em + 1em = 24.96; shim 10 → 24.96.
        assert!((cjk_aware_label_width("A账", 10.0) - 24.96).abs() < 1e-9);
        // Same estimate, but shim already larger → keep shim.
        assert_eq!(cjk_aware_label_width("A账", 40.0), 40.0);
    }

    #[test]
    fn empty_returns_shim() {
        assert_eq!(cjk_aware_label_width("", 5.0), 5.0);
    }
}
