//! wasm-bindgen wrapper around `mermaid-little`.
//!
//! Consumers import this crate's generated JS module (via wasm-pack
//! `--target bundler`) and call [`convert`] to turn a Mermaid source
//! string into an SVG string.
//!
//! mermaid-little ships its own pure-Rust dagre layout, so no external
//! JS bridge is required — unlike the plantuml-little wasm wrapper,
//! which has to be wired up to a Graphviz engine.
//!
//! `version()` returns the crate version embedded at compile time so
//! hosts can assert the wasm bytes match what they bundled.

use wasm_bindgen::prelude::*;

/// Convert a Mermaid source string to an SVG string.
///
/// Errors from the underlying `mermaid-little` converter are surfaced
/// as a JavaScript `Error` with the Rust `Display` message.
#[wasm_bindgen]
pub fn convert(mmd: &str) -> Result<String, JsValue> {
    mermaid_little::convert(mmd).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Convert with an explicit diagram id, mirroring upstream Mermaid's
/// `mermaid.render(id, source)` signature. Useful when the caller
/// wants stable element ids in the resulting SVG (e.g. for hash-based
/// caching or DOM-targeted re-renders).
#[wasm_bindgen]
pub fn convert_with_id(mmd: &str, id: &str) -> Result<String, JsValue> {
    mermaid_little::convert_with_id(mmd, id).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Convert with an explicit diagram id and non-byte-exact readability
/// tweaks, mirroring [`mermaid_little::convert_with_options`].
///
/// `edge_label_decluster` toggles the opt-in edge-label collision-avoidance
/// pass (#93). With it off, the output matches [`convert_with_id`] for the
/// same `id` — pass `"mermaid-1"` to match the default [`convert`] path.
#[wasm_bindgen]
pub fn convert_with_options(
    mmd: &str,
    id: &str,
    edge_label_decluster: bool,
) -> Result<String, JsValue> {
    let opts =
        mermaid_little::RenderOptions::default().with_edge_label_decluster(edge_label_decluster);
    mermaid_little::convert_with_options(mmd, id, &opts)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Version of the compiled `mermaid-little-web` wasm.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
