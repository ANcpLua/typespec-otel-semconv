#!/usr/bin/env bash
# Regression test for the SEMCONV_STAGING_DIR safety guard in run-weaver.sh.
#
# The guard rejects empty, root, and non-absolute STAGING_DIR values before
# any `rm -rf "${STAGING_DIR}/..."` runs. Without it, a misconfigured CI
# value could delete outside the workspace.
#
# Tests only the negative paths — the positive (valid absolute) path is
# implicitly covered every CI run that invokes run-weaver.sh with the default
# STAGING_DIR. Re-asserting it here would either invoke the full script (which
# fails before bootstrap with "Weaver missing") or eval a sed-extracted slice
# (which is fragile under set -euo pipefail because BASH_SOURCE[0] resolves
# differently inside eval). Both have produced false-positive CI failures.
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${TEST_DIR}/.." && pwd)"
RUN="${REPO_ROOT}/scripts/run-weaver.sh"
failures=0

test_rejected() {
  local name="$1" value="$2" expect="$3" actual_stderr
  # Capture stderr only — `2>&1 >/dev/null` swaps fds so the subshell
  # captures fd 2 while fd 1 is discarded. Avoids a false positive if the
  # error were ever accidentally emitted on stdout.
  if actual_stderr="$(SEMCONV_STAGING_DIR="$value" bash "$RUN" 2>&1 >/dev/null)"; then
    echo "FAIL: $name — expected non-zero exit, script succeeded"
    failures=$((failures + 1))
    return
  fi
  if ! grep -qF "$expect" <<<"$actual_stderr"; then
    echo "FAIL: $name — stderr missing expected substring"
    echo "       expected: $expect"
    echo "       got:"
    sed 's/^/        /' <<<"$actual_stderr"
    failures=$((failures + 1))
    return
  fi
  echo "PASS: $name"
}

test_rejected "empty value"     ""          "must be a non-empty absolute path"
test_rejected "root path"       "/"         "must be a non-empty absolute path"
test_rejected "relative path"   "rel/path"  "must be absolute"

if (( failures > 0 )); then
  echo
  echo "$failures test(s) failed."
  exit 1
fi
echo
echo "All SEMCONV_STAGING_DIR guard tests passed."
