#!/usr/bin/env bash
#
# Build supramark-markdown-native for Windows (MSVC).
#
# This crate is pure Rust — no external C dependencies like Graphviz.
# We cross-compile the cdylib target to produce supramark_markdown_native.dll,
# then stage the DLL + import lib + C header into output/windows-x86_64/.
#
# Requires:
#   - Rust target installed (x86_64 default, aarch64 for --arch arm64):
#       rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc
#   - MSVC build tools (Visual Studio 2019+ or Build Tools)
#   - Run on Windows (Git Bash / MSYS2) or via CI windows-latest runner.
#
# Usage:
#   ./scripts/build-windows.sh [--arch x86_64|arm64]
#
# Environment variables:
#   BUILD_DIR   - Build directory (default: build/windows-<arch>)
#   INSTALL_DIR - Install prefix (default: output/windows-<arch>)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CRATE_DIR="${PROJECT_ROOT}/packages/native"

ARCH="x86_64"

while [[ $# -gt 0 ]]; do
    case $1 in
        --arch) ARCH="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

case "$ARCH" in
    x86_64|amd64) ARCH="x86_64"; RUST_ARCH="x86_64" ;;
    arm64|aarch64) ARCH="arm64"; RUST_ARCH="aarch64" ;;
    *) echo "Unsupported architecture: ${ARCH}. Must be x86_64 or arm64."; exit 1 ;;
esac

# rustc has no arm64-pc-windows-msvc triple — the Windows-on-ARM target is
# aarch64-pc-windows-msvc (same mapping as graphviz-anywhere build_helpers.rs).
# Staged output dirs keep the windows-${ARCH} naming.
RUST_TARGET="${RUST_ARCH}-pc-windows-msvc"
BUILD_DIR="${BUILD_DIR:-${PROJECT_ROOT}/build/windows-${ARCH}}"
INSTALL_DIR="${INSTALL_DIR:-${PROJECT_ROOT}/output/windows-${ARCH}}"

echo "[1/4] Checking Rust target ${RUST_TARGET}..."
if ! rustup target list --installed | grep -q "${RUST_TARGET}"; then
    echo "  Installing ${RUST_TARGET}..."
    rustup target add "${RUST_TARGET}"
fi

echo "[2/4] Building supramark-markdown-native for ${RUST_TARGET}..."
cd "${CRATE_DIR}"
export CARGO_TARGET_DIR="${CRATE_DIR}/target"
cargo build --release --target "${RUST_TARGET}"

# The cdylib output
case "$ARCH" in
    x86_64) DLL_NAME="supramark_markdown_native.dll" ;;
    arm64)  DLL_NAME="supramark_markdown_native.dll" ;;
esac

DLL_SRC="${CRATE_DIR}/target/${RUST_TARGET}/release/${DLL_NAME}"

if [[ ! -f "${DLL_SRC}" ]]; then
    echo "ERROR: Build output not found: ${DLL_SRC}"
    exit 1
fi

echo "[3/4] Staging artifacts to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}/bin" "${INSTALL_DIR}/lib" "${INSTALL_DIR}/include"

# Copy the runtime DLL
cp "${DLL_SRC}" "${INSTALL_DIR}/bin/"

# Copy the C ABI header
HEADER_SRC="${CRATE_DIR}/include/supramark_markdown.h"
if [[ -f "${HEADER_SRC}" ]]; then
    cp "${HEADER_SRC}" "${INSTALL_DIR}/include/"
else
    echo "WARNING: C header not found at ${HEADER_SRC}"
fi

# Stage an import library (.lib) so consumers can link against the DLL at
# build time. rustc already emits one next to the cdylib
# (<name>.dll.lib, exactly matching the real exports) — prefer copying it.
# The old flow instead ran lib.exe /DEF: against a .def path that was never
# written (with the error swallowed) before falling back to a hand-maintained
# minimal .def, which can rot when the export list changes.
RUST_IMPLIB_SRC="${DLL_SRC}.lib"
LIB_OUT="${INSTALL_DIR}/lib/supramark_markdown_native.lib"
if [[ -f "${RUST_IMPLIB_SRC}" ]]; then
    cp "${RUST_IMPLIB_SRC}" "${LIB_OUT}"
    echo "[4/4] Staged rustc import library ${LIB_OUT}"
else
    echo "[4/4] rustc import library not found (${RUST_IMPLIB_SRC}); falling back to lib.exe."
    LIBEXE=""
    VSWHERE="C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    if [[ -f "${VSWHERE}" ]]; then
        VS_INSTALL="$("${VSWHERE}" -latest -products '*' -property installationPath 2>/dev/null | tr -d '\r')"
        if [[ -n "${VS_INSTALL}" ]]; then
            VC_VER_FILE="${VS_INSTALL}/VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt"
            if [[ -f "${VC_VER_FILE}" ]]; then
                VC_VER="$(cat "${VC_VER_FILE}" | tr -d '[:space:]')"
                case "$ARCH" in
                    x86_64) HOST_TOOL_DIRS=("Hostx64/x64" "Hostarm64/x64" "Hostx86/x64") ;;
                    arm64)  HOST_TOOL_DIRS=("Hostarm64/arm64" "Hostx64/arm64" "Hostx86/arm64") ;;
                esac
                for host_dir in "${HOST_TOOL_DIRS[@]}"; do
                    CANDIDATE="${VS_INSTALL}/VC/Tools/MSVC/${VC_VER}/bin/${host_dir}/lib.exe"
                    if [[ -f "${CANDIDATE}" ]]; then
                        LIBEXE="${CANDIDATE}"
                        break
                    fi
                done
            fi
        fi
    fi
    # Fallback: rely on PATH (works when vcvarsall.bat has been sourced)
    if [[ -z "${LIBEXE}" ]]; then
        LIBEXE="$(command -v lib.exe 2>/dev/null || command -v lib 2>/dev/null || true)"
    fi

    if [[ -n "${LIBEXE}" ]]; then
        echo "  Generating import library from a minimal export list..."
        case "$ARCH" in
            x86_64) LIB_MACHINE="X64" ;;
            arm64)  LIB_MACHINE="ARM64" ;;
        esac
        DEF_FILE="${BUILD_DIR}/supramark_markdown_native.def"
        mkdir -p "${BUILD_DIR}"
        cat > "${DEF_FILE}" << 'DEF_EOF'
LIBRARY supramark_markdown_native
EXPORTS
    supramark_markdown_parse_json
    supramark_markdown_free
    supramark_markdown_version
DEF_EOF
        LIB_OUT_WIN="$(cygpath -w "${LIB_OUT}" 2>/dev/null || echo "${LIB_OUT}")"
        DEF_WIN="$(cygpath -w "${DEF_FILE}" 2>/dev/null || echo "${DEF_FILE}")"
        MSYS2_ARG_CONV_EXCL='*' "${LIBEXE}" /NOLOGO \
            "/MACHINE:${LIB_MACHINE}" \
            "/DEF:${DEF_WIN}" \
            "/OUT:${LIB_OUT_WIN}" || echo "WARNING: import lib generation failed; DLL-only linking will be used"
    else
        echo "  WARNING: lib.exe not found; skipping import library generation."
        echo "       Consumers will need to link directly against the DLL."
    fi
fi

echo ""
echo "Windows ${ARCH} build complete: ${INSTALL_DIR}"
echo "  DLL:   ${INSTALL_DIR}/bin/${DLL_NAME}"
echo "  Header: ${INSTALL_DIR}/include/supramark_markdown.h"
if [[ -f "${INSTALL_DIR}/lib/supramark_markdown_native.lib" ]]; then
    echo "  Lib:   ${INSTALL_DIR}/lib/supramark_markdown_native.lib"
fi
