#!/usr/bin/env python3
"""Compare the d2-little elk bridge output to every elk fixture.

Iterates all `tests/e2e_testdata/<cat>/<name>/elk/sketch.exp.svg` whose script
is known (from tests/e2e_dagre_svg_cases.json), runs the dump_elk example
(prepare -> node elk_runner.js -> render), and reports byte-exact pass/fail.

Usage: python3 scripts/elk_parity_check.py [binary]
  binary defaults to target/debug/examples/dump_elk
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "../../target/debug/examples/dump_elk")
RUNNER = os.path.join(ROOT, "tests/elk_runner.js")


def load_scripts():
    cases = json.load(open(os.path.join(ROOT, "tests/e2e_dagre_svg_cases.json")))
    m = {}
    for c in cases:
        m[(c["family"], c["fixture_name"])] = c["script"]
    return m


def main():
    scripts = load_scripts()
    elk_dirs = []
    for root, dirs, _ in os.walk(os.path.join(ROOT, "tests/e2e_testdata")):
        if "elk" in dirs and os.path.exists(os.path.join(root, "elk", "sketch.exp.svg")):
            rel = os.path.relpath(root, os.path.join(ROOT, "tests/e2e_testdata"))
            parts = rel.split(os.sep)
            if len(parts) == 2:
                elk_dirs.append((parts[0], parts[1]))

    passed = 0
    failed = 0
    skipped = 0
    failures = []
    for cat, name in elk_dirs:
        script = scripts.get((cat, name))
        exp = os.path.join(ROOT, "tests/e2e_testdata", cat, name, "elk", "sketch.exp.svg")
        if script is None:
            skipped += 1
            continue
        try:
            out = subprocess.run(
                [BIN, script], cwd=ROOT, capture_output=True, text=True, timeout=60,
                env={**os.environ, "PATH": os.environ["PATH"]},
            )
        except subprocess.TimeoutExpired:
            failed += 1
            failures.append((cat, name, "timeout"))
            continue
        if out.returncode != 0:
            failed += 1
            failures.append((cat, name, "err: " + out.stderr.strip()[:120]))
            continue
        ours = out.stdout
        exp_text = open(exp).read()
        if ours == exp_text:
            passed += 1
        else:
            failed += 1
            # find first diff
            pos = next((i for i, (a, b) in enumerate(zip(ours, exp_text)) if a != b), min(len(ours), len(exp_text)))
            failures.append((cat, name, f"diff@{pos} ours{len(ours)} exp{len(exp_text)}: {ours[pos:pos+50]!r} vs {exp_text[pos:pos+50]!r}"))

    print(f"\n=== elk parity: {passed} passed, {failed} failed, {skipped} skipped (no script) ===")
    for cat, name, msg in failures[:40]:
        print(f"  FAIL {cat}/{name}: {msg}")
    if len(failures) > 40:
        print(f"  ... and {len(failures)-40} more failures")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
