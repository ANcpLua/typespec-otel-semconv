// Linter contract tests. Two assertions:
//
//   1. The good spec (test/smoke.tsp) emits ZERO `prefer-otel-key` warnings —
//      proves the rule isn't a false-positive factory on consumers who DO use
//      the typed surface.
//   2. The bad spec (test/lint.bad.tsp) emits one warning per raw key — proves
//      the rule actually catches the regression case it's named for.
//
// `tsp compile` returns warnings on stderr formatted as `<file>:<line>:<col> -
// warning <rule>: <msg>`. Parsing-by-grep is fine here; the rule name is stable
// and we own both ends.

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tspCompile } from "./setup";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const RULE_FQN = "@ancplua/typespec-otel-semconv/prefer-otel-key";

function countRuleWarnings(stdout: string, stderr: string, rule: string): number {
  const haystack = `${stdout}\n${stderr}`;
  const re = new RegExp(`warning\\s+${rule.replace(/[.*+?^${}()|[\]\\\\]/g, "\\\\$&")}`, "g");
  return (haystack.match(re) ?? []).length;
}

describe("prefer-otel-key linter rule", () => {
  it("does not fire on the canonical smoke test (consumer uses typed symbols)", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/smoke.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    expect(countRuleWarnings(stdout, stderr, RULE_FQN)).toBe(0);
  }, 120_000);

  it("fires once per raw OTel-shaped attribute key in the bad spec", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/lint.bad.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    // Linter warnings don't fail compilation by default; only --warn-as-error escalates.
    expect(exitCode).toBe(0);
    expect(countRuleWarnings(stdout, stderr, RULE_FQN)).toBe(3);
  }, 120_000);
});
