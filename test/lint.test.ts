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

const PREFER_RULE = "@ancplua/typespec-otel-semconv/prefer-otel-key";
const DEPRECATED_RULE = "@ancplua/typespec-otel-semconv/no-deprecated-otel-key";

function countRuleWarnings(stdout: string, stderr: string, rule: string): number {
  const haystack = `${stdout}\n${stderr}`;
  // Escape regex meta-chars in the rule FQN so '/' and '@' don't confuse the matcher.
  const re = new RegExp(`warning\\s+${rule.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "g");
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
    expect(countRuleWarnings(stdout, stderr, PREFER_RULE)).toBe(0);
  }, 120_000);

  it("fires once per raw OTel-shaped attribute key in the bad spec", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/lint.bad.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    // Linter warnings don't fail compilation by default; only --warn-as-error escalates.
    expect(exitCode).toBe(0);
    expect(countRuleWarnings(stdout, stderr, PREFER_RULE)).toBe(3);
  }, 120_000);
});

describe("no-deprecated-otel-key linter rule", () => {
  it("does not fire on the canonical smoke test (no deprecated keys referenced)", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/smoke.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    expect(countRuleWarnings(stdout, stderr, DEPRECATED_RULE)).toBe(0);
  }, 120_000);

  it("fires on both raw-string and alias references to deprecated keys", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/lint.deprecated.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    // 2 deprecated-key sites: one raw ("http.client_ip"), one alias (OTel.Keys.Http.Flavor).
    // Both fire `no-deprecated-otel-key`. The raw one ALSO fires prefer-otel-key.
    expect(countRuleWarnings(stdout, stderr, DEPRECATED_RULE)).toBe(2);
    expect(countRuleWarnings(stdout, stderr, PREFER_RULE)).toBe(1);
  }, 120_000);
});
