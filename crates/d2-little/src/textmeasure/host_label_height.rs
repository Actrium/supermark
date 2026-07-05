//! Single-line label height helper used by the wasm host-canvas metrics
//! path.
//!
//! Extracted as a pure free function (rather than living inside
//! [`super::d2_host_metrics`]) so that it — and its unit tests — compile
//! and execute under a normal `cargo test -p d2-little` run.
//! `d2_host_metrics` is `#![cfg(target_arch = "wasm32")]`, so any
//! `#[cfg(test)]` code defined there is cfg'd out of every native test
//! build and never runs. Keeping the helper target-agnostic closes that
//! gap and gives the height formula real regression coverage.

/// Single-line label height used by the wasm host-canvas
/// `measure_precise` path.
///
/// The renderer places the label baseline at `label_tl.y + font_size`
/// (`svg_render/mod.rs` — shape labels `:2447` / `:2474`, connection
/// labels `:1353`, arrowhead labels `:1449`), which assumes
/// `ascent ≈ font_size`. Under host-canvas metrics, `m.ascent` is the
/// tight glyph bounding-box ascent (often < `font_size` for lowercase /
/// x-height-only labels), so using `ascent + descent` made
/// `label_height` too small and the label overlapped the container's
/// top border (issue #27).
///
/// Using `font_size + descent` **approximates** the native
/// `D2GoEmulationMetrics` ascent convention rather than matching it
/// byte-for-byte. Native single-line height is
/// `face_ascent + face_descent`, where the face metrics are constant
/// per size and text-independent (`d2_go_emulation.rs:375-387`,
/// `:210-219`); here `font_size` stands in for `face_ascent` (within
/// ~0.4px for Source Sans Pro) and the host's tight, text-dependent
/// `descent` stands in for the constant `face_descent`. This corrects
/// the dominant ascent-side under-measurement that caused the top-border
/// overlap. It is *not* equal to native: for descender-less labels the
/// host descent is near zero, so the result stays a few pixels shorter
/// than native's `face_ascent + face_descent` — accepted in exchange
/// for not having to hard-code face metrics the host canvas does not
/// expose.
pub fn single_line_height(font_size: f64, descent: f64) -> f64 {
    font_size + descent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_font_size_not_tight_ascent() {
        // issue #27: a 28px label with a tight glyph ascent of 22
        // (x-height only) and descent 6. The buggy `ascent + descent`
        // would give 28; the fix gives `font_size + descent` = 34,
        // restoring the breathing gap above the box.
        assert_eq!(single_line_height(28.0, 6.0), 34.0);
    }

    #[test]
    fn approximates_native_ascent_convention() {
        // Native D2GoEmulationMetrics single-line height is
        // `face_ascent + face_descent` (face metrics constant per size,
        // text-independent). For 28px Source Sans Pro, `face_descent =
        // 7.65625` and `face_ascent ≈ 27.56`, so native ≈ 35.22. The
        // host formula `font_size + descent` lands at 35.65625 when the
        // host's tight descent happens to equal the face descent —
        // within ~0.4px on the ascent side. This asserts the
        // approximation stays close to the native path's value, NOT
        // byte-equality with it (and the third argument in production
        // is the host's text-dependent descent, which varies).
        assert_eq!(single_line_height(28.0, 7.65625), 35.65625);
    }
}
