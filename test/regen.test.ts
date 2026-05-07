// Regen byte-identity test. The `npm run verify-clean` script runs the
// generator and asserts `git diff --exit-code -- lib/` — this test wraps the
// same contract in a Vitest assertion so it shows up in the regular suite,
// fails with a per-file diff in PR review, and runs in the same process as
// the rest. Running the generator twice in a row must produce zero changes.

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("generator determinism", () => {
  it("produces no drift on a clean checkout (lib/ + src/generated/)", () => {
    execSync("node scripts/generate.mjs", { cwd: REPO_ROOT, stdio: "ignore" });
    // git diff --quiet exits non-zero when there are changes; we let it throw
    // and surface the offending paths via --stat.
    let drift = "";
    try {
      execSync("git diff --quiet -- lib src/generated", { cwd: REPO_ROOT });
    } catch {
      drift = execSync("git diff --stat -- lib src/generated", { cwd: REPO_ROOT })
        .toString()
        .trim();
    }
    expect(drift, `Generator drift detected:\n${drift}`).toBe("");
  }, 60_000);
});
