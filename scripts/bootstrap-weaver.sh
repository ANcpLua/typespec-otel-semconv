#!/usr/bin/env bash
# Prepare the Weaver-based semconv toolchain on macOS/Linux.
#
# Reads the pinned semconv_version from templates/registry/typespec/weaver.yaml,
# uses pinned Weaver v0.23.0, checks the pinned .tools/semconv-upstream submodule,
# and downloads the platform-specific Weaver binary into .tools/weaver/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${REPO_ROOT}/.tools"
WEAVER_DIR="${TOOLS_DIR}/weaver"
UPSTREAM_DIR="${TOOLS_DIR}/semconv-upstream"
WEAVER_YAML="${REPO_ROOT}/templates/registry/typespec/weaver.yaml"

WEAVER_VERSION="v0.23.0"
SEMCONV_VERSION="$(sed -n 's/^[[:space:]]*semconv_version:[[:space:]]*"\(.*\)"/\1/p' "${WEAVER_YAML}")"

if [ -z "${SEMCONV_VERSION}" ]; then
  echo "Could not read semconv_version from ${WEAVER_YAML}" >&2
  exit 1
fi

if [ ! -f "${UPSTREAM_DIR}/model/attributes/registry.yaml" ] && [ ! -d "${UPSTREAM_DIR}/model" ]; then
  echo "semconv-upstream submodule missing at ${UPSTREAM_DIR}" >&2
  echo "Run: git submodule update --init .tools/semconv-upstream" >&2
  exit 1
fi

UNAME_S="$(uname -s)"
UNAME_M="$(uname -m)"
case "${UNAME_S}:${UNAME_M}" in
  Darwin:arm64|Darwin:aarch64) WEAVER_ARCH="aarch64-apple-darwin" ;;
  Darwin:x86_64)               WEAVER_ARCH="x86_64-apple-darwin" ;;
  Linux:x86_64)                WEAVER_ARCH="x86_64-unknown-linux-gnu" ;;
  Linux:arm64|Linux:aarch64)   WEAVER_ARCH="aarch64-unknown-linux-gnu" ;;
  *) echo "Unsupported platform: ${UNAME_S}/${UNAME_M}" >&2; exit 1 ;;
esac

WEAVER_BIN="${WEAVER_DIR}/weaver-${WEAVER_ARCH}/weaver"

mkdir -p "${WEAVER_DIR}"
if [ ! -x "${WEAVER_BIN}" ]; then
  echo "Downloading Weaver ${WEAVER_VERSION} (${WEAVER_ARCH})..."
  curl -sL \
    "https://github.com/open-telemetry/weaver/releases/download/${WEAVER_VERSION}/weaver-${WEAVER_ARCH}.tar.xz" \
    -o "${WEAVER_DIR}/weaver.tar.xz"
  tar -xf "${WEAVER_DIR}/weaver.tar.xz" -C "${WEAVER_DIR}"
  rm "${WEAVER_DIR}/weaver.tar.xz"
fi

echo ""
echo "Weaver:   ${WEAVER_BIN} ($("${WEAVER_BIN}" --version))"
echo "Upstream: ${UPSTREAM_DIR} (semconv v${SEMCONV_VERSION})"
echo ""
echo "Next: ./scripts/run-weaver.sh"
