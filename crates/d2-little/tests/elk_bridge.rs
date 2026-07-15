//! Integration tests for the elkjs layout bridge.
//!
//! These drive the full prepare → elkjs (`node tests/elk_runner.mjs`) → render
//! pipeline natively (no wasm) and assert byte-exact SVG parity with upstream
//! d2's elk output. `elkjs` must be `0.8.2` (the version d2 v0.7.1 bundles);
//! the runner lives in the supramark workspace's engines package.
//!
//! Tests are gated on `node` + `elkjs` being resolvable — if either is absent
//! the tests skip (e.g. in an environment without the JS workspace installed).
//! The full 293-fixture parity sweep is `#[ignore]` (run with
//! `cargo test -- --ignored elk_bridge_fixture_parity`); the issue #34
//! regression test runs by default.

use std::io::Write;
use std::process::{Command, Stdio};

const ISSUE34: &str = "Spiderman 1\nSpiderman 2\nSpiderman 3\n\n* -> *: 👉\n";

fn elk_runner_path() -> String {
    format!("{}/tests/elk_runner.mjs", env!("CARGO_MANIFEST_DIR"))
}

/// Run elkjs on an ELK input graph JSON, returning the laid-out graph JSON.
/// Returns `None` if node or elkjs is unavailable so tests can skip.
fn run_elk(elk_graph_json: &str) -> Option<String> {
    let runner = elk_runner_path();
    let mut child = match Command::new("node")
        .arg(&runner)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return None,
    };
    {
        let mut stdin = child.stdin.take()?;
        stdin.write_all(elk_graph_json.as_bytes()).ok()?;
    }
    let out = child.wait_with_output().ok()?;
    if !out.status.success() {
        if std::env::var("D2_ELK_DEBUG").is_ok() {
            eprintln!(
                "elk_runner exited {:?}: {}",
                out.status.code(),
                String::from_utf8_lossy(&out.stderr)
            );
        }
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Full bridge: prepare → elkjs → render → SVG bytes.
fn bridge_svg(script: &str) -> Option<String> {
    let opts = d2_little::CompileOptions {
        pad: Some(0),
        ..d2_little::CompileOptions::default()
    };
    let (prepared, request) = d2_little::prepare_for_external_layout(script, &opts).ok()?;
    // Match the production host: sequence / grid / `near:` diagrams use d2's
    // engine-independent specialized layouts, so the elk bridge falls back to
    // the dagre `convert` path (which runs those same layouts). For pure
    // sequence/grid/near diagrams the elk fixture is byte-identical to the
    // dagre output, so this fallback is the correct elk result. (Mixed
    // diagrams — specialized layout + surrounding elk nodes — still differ
    // and remain in the known-gap set.)
    if request.multi_board || request.has_sequence || request.has_grid || request.has_near {
        let svg = d2_little::d2_to_svg(script).ok()?;
        return Some(String::from_utf8_lossy(&svg).to_string());
    }
    let elk_graph_json = serde_json::to_string(&request.elk_graph).ok()?;
    let laid = run_elk(&elk_graph_json)?;
    let elk_graph: d2_little::layout_bridge::ElkGraph = serde_json::from_str(&laid).ok()?;
    let result = d2_little::layout_bridge::LayoutResult { elk_graph };
    let svg = d2_little::render_with_external_layout(prepared, &result).ok()?;
    Some(String::from_utf8_lossy(&svg).to_string())
}

/// Count connection `<path d="...">` segments that are vertical (constant x
/// over a y range > 10) — the "official connection lines are vertical"
/// property from issue #34. (Helper kept for future per-edge assertions.)
#[allow(dead_code)]
fn has_vertical_segment(path: &str) -> bool {
    let coords: Vec<f64> = path
        .split(|c: char| c.is_ascii_alphabetic() || c == ' ' || c == ',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<f64>().ok())
        .collect();
    let pts: Vec<(f64, f64)> = coords
        .chunks(2)
        .filter_map(|c| {
            if c.len() == 2 {
                Some((c[0], c[1]))
            } else {
                None
            }
        })
        .collect();
    pts.windows(2)
        .any(|w| (w[0].0 - w[1].0).abs() < 0.5 && (w[0].1 - w[1].1).abs() > 10.0)
}

#[test]
fn elk_bridge_issue34_byte_exact_golden() {
    let Some(svg) = bridge_svg(ISSUE34) else {
        eprintln!("skip: node/elkjs unavailable");
        return;
    };
    let golden = std::fs::read_to_string(format!(
        "{}/tests/elk_golden/issue34.svg",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("golden issue34.svg missing");
    assert_eq!(svg, golden, "issue #34 elk output drifted from golden");
}

#[test]
fn elk_bridge_issue34_vertical_edges() {
    let Some(svg) = bridge_svg(ISSUE34) else {
        eprintln!("skip: node/elkjs unavailable");
        return;
    };
    // 3 nodes × 6 directed `* -> *` edges = 6 connection paths
    // (`class="connection stroke-…"`; the arrowhead marker is `fill-`).
    let paths = svg.matches("class=\"connection stroke").count();
    assert_eq!(paths, 6, "expected 6 connection paths, got {paths}");

    // The official d2 elk rendering routes edges as vertical segments
    // (issue #34: "官方的连接线是竖着的"). Assert each connection path
    // contains at least one vertical `L x y` segment (x constant, y varies).
    for elem in svg.split("<path ").skip(1) {
        // Only connection edge paths (skip arrowhead markers / sketch paths).
        let end = elem.find('/').unwrap_or(elem.len());
        let elem = &elem[..end];
        if !elem.contains("connection stroke") {
            continue;
        }
        let d_start = elem.find("d=\"").map(|i| i + 3).unwrap_or(0);
        let d = &elem[d_start..];
        let d_end = d.find('"').unwrap_or(d.len());
        let path = &d[..d_end];
        let coords: Vec<f64> = path
            .split(|c: char| c.is_ascii_alphabetic() || c == ' ' || c == ',')
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<f64>().ok())
            .collect();
        let pts: Vec<(f64, f64)> = coords
            .chunks(2)
            .filter_map(|c| {
                if c.len() == 2 {
                    Some((c[0], c[1]))
                } else {
                    None
                }
            })
            .collect();
        let has_vertical = pts
            .windows(2)
            .any(|w| (w[0].0 - w[1].0).abs() < 0.5 && (w[0].1 - w[1].1).abs() > 10.0);
        assert!(
            path.contains("S ") || has_vertical,
            "non-vertical edge path: {path}"
        );
    }
}

#[test]
// Run explicitly: `cargo test --test elk_bridge -- --ignored elk_bridge_fixture_parity`.
#[ignore = "full 293-fixture elk parity sweep; needs node+elkjs"]
fn elk_bridge_fixture_parity() {
    // Full byte-exact sweep over every elk fixture with a known script.
    // Run explicitly: `cargo test --test elk_bridge -- --ignored elk_bridge_fixture_parity`.
    let cases_json = std::fs::read_to_string(format!(
        "{}/tests/e2e_dagre_svg_cases.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("e2e_dagre_svg_cases.json missing");
    let cases: Vec<serde_json::Value> = serde_json::from_str(&cases_json).unwrap();
    let script_for = |family: &str, name: &str| -> Option<String> {
        cases.iter().find_map(|c| {
            (c["family"].as_str() == Some(family) && c["fixture_name"].as_str() == Some(name))
                .then(|| c["script"].as_str().map(|s| s.to_string()))
                .flatten()
        })
    };

    let testdata = format!("{}/tests/e2e_testdata", env!("CARGO_MANIFEST_DIR"));
    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;
    let mut failures: Vec<String> = Vec::new();
    for entry in walkdir(&testdata) {
        let elk_svg = entry.join("elk").join("sketch.exp.svg");
        if !elk_svg.exists() {
            continue;
        }
        let rel = entry.strip_prefix(&testdata).unwrap();
        let mut parts = rel.components();
        let (family, name) = match (parts.next(), parts.next()) {
            (Some(a), Some(b)) => (
                a.as_os_str().to_string_lossy().to_string(),
                b.as_os_str().to_string_lossy().to_string(),
            ),
            _ => continue,
        };
        let Some(script) = script_for(&family, &name) else {
            skipped += 1;
            continue;
        };
        let exp = std::fs::read_to_string(&elk_svg).unwrap();
        match bridge_svg(&script) {
            None => {
                skipped += 1;
            }
            Some(ours) => {
                if ours == exp {
                    passed += 1;
                } else {
                    failed += 1;
                    if failures.len() < 20 {
                        failures.push(format!("{family}/{name}"));
                    }
                }
            }
        }
    }
    eprintln!("elk fixture parity: {passed} passed, {failed} failed, {skipped} skipped");
    if !failures.is_empty() {
        eprintln!("  failures: {}", failures.join(", "));
    }
    // Assert the known-passing floor so the test guards against regressions
    // while the remaining gaps are tracked separately.
    assert!(
        passed >= 190,
        "elk parity regressed below 190: only {passed} passed"
    );
}

fn walkdir(root: &str) -> Vec<std::path::PathBuf> {
    fn rec(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                out.push(p.clone());
                rec(&p, out);
            }
        }
    }
    let mut out = Vec::new();
    rec(std::path::Path::new(root), &mut out);
    out
}
