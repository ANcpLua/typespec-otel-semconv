// Regen byte-identity test. The `npm run verify-clean` script runs the
// generator and asserts `git diff --exit-code -- lib/` plus an untracked-file
// check — this test wraps the byte-identity contract in a Vitest assertion so
// it shows up in the regular suite, fails with a per-file diff in PR review,
// and runs in the same process as the rest. Running the generator twice in a
// row must produce zero changes.

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(REPO_ROOT, "lib", "otel-keys.gen.tsp");

describe("generator determinism", () => {
  it("produces byte-identical output on a second run", () => {
    execSync("bash scripts/run-weaver.sh", { cwd: REPO_ROOT, stdio: "ignore" });
    const first = readFileSync(OUTPUT);

    execSync("bash scripts/run-weaver.sh", { cwd: REPO_ROOT, stdio: "ignore" });
    const second = readFileSync(OUTPUT);

    expect(second.equals(first)).toBe(true);
  }, 120_000);

  it("produces no drift on a clean checkout (lib/)", () => {
    execSync("bash scripts/run-weaver.sh", { cwd: REPO_ROOT, stdio: "ignore" });
    // git diff --quiet exits non-zero when there are changes; we let it throw
    // and surface the offending paths via --stat. Also check for untracked
    // files (PR #4362 bug: a brand-new file passes git diff but is still drift).
    let drift = "";
    try {
      execSync("git diff --quiet -- lib", { cwd: REPO_ROOT });
    } catch {
      drift = execSync("git diff --stat -- lib", { cwd: REPO_ROOT })
        .toString()
        .trim();
    }
    const untracked = execSync("git status --porcelain -- lib", { cwd: REPO_ROOT })
      .toString()
      .trim();
    expect(drift, `Generator drift detected:\n${drift}`).toBe("");
    expect(untracked, `Untracked generator output detected:\n${untracked}`).toBe("");
  }, 120_000);
});
