#!/usr/bin/env bash
#
# One-click native build for the graphviz-backed Rust crates (plantuml-little).
#
# From a fresh clone this:
#   1. initialises the upstream Graphviz submodule (referenced, not vendored);
#   2. builds the native libgraphviz_api once from that source, so the build is
#      self-contained and needs no prebuilt download;
#   3. compiles plantuml-little with a native metrics impl (metrics-ttf-parser).
#
# Extra arguments are forwarded to the final `cargo build`, e.g.
#   scripts/build-native.sh --release
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GV="crates/graphviz-anywhere"

echo "==> [1/3] Initialising Graphviz submodule (upstream, referenced not vendored)"
git submodule update --init "$GV/graphviz"

case "$(uname -s)" in
  Linux)  gv_script="build-linux.sh"; gv_lib="$GV/output/linux-x86_64/lib/libgraphviz_api.a" ;;
  Darwin) gv_script="build-macos.sh"; gv_lib="$GV/output/macos-universal/lib/libgraphviz_api.a" ;;
  *)
    echo "!! Unsupported host OS '$(uname -s)'."
    echo "   Build libgraphviz_api via $GV/scripts/ manually, then run:"
    echo "     cargo build -p plantuml-little --features metrics-ttf-parser"
    exit 1
    ;;
esac

echo "==> [2/3] Building libgraphviz_api (once; cached under $GV/output/)"
if [ -f "$gv_lib" ]; then
  echo "    already present: $gv_lib"
else
  missing=""
  for tool in cmake bison flex pkg-config cc; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  if [ -n "$missing" ]; then
    echo "!! Missing build tools:$missing"
    echo "   Debian/Ubuntu:    sudo apt-get install -y cmake bison flex pkg-config build-essential"
    echo "   macOS (Homebrew): brew install cmake bison flex pkg-config"
    exit 1
  fi
  bash "$GV/scripts/$gv_script"
fi

echo "==> [3/3] Compiling plantuml-little (native metrics: metrics-ttf-parser)"
cargo build -p plantuml-little --features metrics-ttf-parser "$@"

echo "==> Done."
echo "    libgraphviz_api: $gv_lib"
echo "    Byte-exact reference goldens can now be (re)generated with:"
echo "      UPDATE_REF=1 cargo test -p plantuml-little --features metrics-ttf-parser --test reference_tests"
