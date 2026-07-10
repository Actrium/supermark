//! Drive the elkjs bridge end-to-end on a D2 source (native, no wasm):
//! prepare → node elk_runner.mjs (elkjs@0.8.2) → render → SVG.
//!
//! Usage:
//!   cargo run --example dump_elk -- "<d2 source>" > out.svg
//!   cargo run --example dump_elk -- "$(cat case.d2)" /tmp/official.svg
//!
//! When a second arg (path to an official d2 elk SVG) is given, prints a
//! byte-diff summary so you can iterate toward byte-exact parity.

use std::io::Write;
use std::process::{Command, Stdio};

fn run_elk(elk_graph_json: &str) -> Result<String, String> {
    // Locate the runner relative to the crate root (CARGO_MANIFEST_DIR is
    // set at compile time), so the example works from any cwd.
    let runner = format!("{}/tests/elk_runner.mjs", env!("CARGO_MANIFEST_DIR"));
    let mut child = Command::new("node")
        .arg(&runner)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn node: {e}"))?;
    {
        let mut stdin = child.stdin.take().ok_or("no stdin")?;
        stdin
            .write_all(elk_graph_json.as_bytes())
            .map_err(|e| format!("write stdin: {e}"))?;
    }
    let out = child.wait_with_output().map_err(|e| format!("wait: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn main() {
    let script = std::env::args().nth(1).expect("script arg");
    let opts = d2_little::CompileOptions {
        pad: Some(0),
        ..d2_little::CompileOptions::default()
    };
    let (prepared, request) =
        d2_little::prepare_for_external_layout(&script, &opts).expect("prepare");

    if request.multi_board || request.has_sequence || request.has_grid || request.has_near {
        eprintln!("WARN: request flags multi/seq/grid/near — elk bridge may not match");
    }

    let elk_graph_json = serde_json::to_string(&request.elk_graph).unwrap();
    let laid = run_elk(&elk_graph_json).expect("elk.layout");
    let elk_graph: d2_little::layout_bridge::ElkGraph =
        serde_json::from_str(&laid).expect("deserialize laid-out graph");
    let result = d2_little::layout_bridge::LayoutResult { elk_graph };

    let svg = d2_little::render_with_external_layout(prepared, &result).expect("render");
    let svg_str = String::from_utf8_lossy(&svg).to_string();
    print!("{}", svg_str);

    if let Some(exp_path) = std::env::args().nth(2) {
        let exp = std::fs::read_to_string(&exp_path).expect("read official svg");
        let pos = svg_str
            .chars()
            .zip(exp.chars())
            .position(|(a, b)| a != b)
            .unwrap_or(svg_str.len().min(exp.len()));
        eprintln!("--- diff vs {} ---", exp_path);
        eprintln!("ours len={}, exp len={}, first diff at {}", svg_str.len(), exp.len(), pos);
        let s = pos.saturating_sub(60);
        eprintln!("OURS: {:?}", &svg_str[s..(pos + 80).min(svg_str.len())]);
        eprintln!("EXP : {:?}", &exp[s..(pos + 80).min(exp.len())]);
    }
}
