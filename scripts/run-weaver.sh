#!/usr/bin/env bash
# Generate the TypeSpec semconv keys file via Weaver.
#
# Assumes bootstrap already installed Weaver into .tools/weaver/ and initialized
# the pinned upstream OpenTelemetry semantic-conventions submodule at
# .tools/semconv-upstream.
#
# Single pass: upstream OTel registry -> TypeSpec consts (lib/otel-keys.gen.tsp).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

UNAME_S="$(uname -s)"
UNAME_M="$(uname -m)"
case "${UNAME_S}:${UNAME_M}" in
  Darwin:arm64|Darwin:aarch64) WEAVER_ARCH="aarch64-apple-darwin" ;;
  Darwin:x86_64)               WEAVER_ARCH="x86_64-apple-darwin" ;;
  Linux:x86_64)                WEAVER_ARCH="x86_64-unknown-linux-gnu" ;;
  Linux:arm64|Linux:aarch64)   WEAVER_ARCH="aarch64-unknown-linux-gnu" ;;
  *) echo "Unsupported platform: ${UNAME_S}/${UNAME_M}" >&2; exit 1 ;;
esac

WEAVER_BIN="${REPO_ROOT}/.tools/weaver/weaver-${WEAVER_ARCH}/weaver"
UPSTREAM_REGISTRY="${REPO_ROOT}/.tools/semconv-upstream/model"
TEMPLATES_ROOT="${REPO_ROOT}/templates/registry"
# Override with SEMCONV_STAGING_DIR for non-default workspace layouts (for example CI).
# Reject values that could make the cleanup below target outside the intended tree.
STAGING_DIR="${SEMCONV_STAGING_DIR-${REPO_ROOT}/.tools/staging}"
case "${STAGING_DIR}" in
  ""|"/")
    echo "ERROR: STAGING_DIR must be a non-empty absolute path other than '/'" >&2
    echo "       Got: '${STAGING_DIR}' (set via SEMCONV_STAGING_DIR=${SEMCONV_STAGING_DIR-<unset>})" >&2
    exit 1 ;;
  /*) ;;
  *)
    echo "ERROR: STAGING_DIR must be absolute (start with '/')" >&2
    echo "       Got: '${STAGING_DIR}' (set via SEMCONV_STAGING_DIR=${SEMCONV_STAGING_DIR-<unset>})" >&2
    exit 1 ;;
esac

TSP_KEYS_DEST="${REPO_ROOT}/lib/otel-keys.gen.tsp"

if [ ! -x "${WEAVER_BIN}" ] || [ ! -d "${UPSTREAM_REGISTRY}" ]; then
  echo "Weaver or upstream registry missing." >&2
  echo "Run: ./scripts/bootstrap-weaver.sh (or .ps1 on Windows)" >&2
  exit 1
fi

STAGING_TSP="${STAGING_DIR}/typespec"
rm -rf "${STAGING_TSP}"
"${WEAVER_BIN}" registry generate \
  --registry "${UPSTREAM_REGISTRY}" \
  --templates "${TEMPLATES_ROOT}" \
  typespec \
  "${STAGING_TSP}"

mkdir -p "$(dirname "${TSP_KEYS_DEST}")"
install -m 0644 "${STAGING_TSP}/otel-keys.gen.tsp" "${TSP_KEYS_DEST}"

echo ""
echo "Wrote (TypeSpec consts pass):"
echo "  ${TSP_KEYS_DEST} ($(wc -l < "${TSP_KEYS_DEST}") lines, $(grep -c '^  const ' "${TSP_KEYS_DEST}") consts)"
