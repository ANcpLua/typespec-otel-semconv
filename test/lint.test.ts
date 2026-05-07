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

import { describe, it, expect, inject } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tspCompile } from "./setup";
import { KNOWN_DOMAINS } from "../src/generated/known-domains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const PREFER_RULE = "@ancplua/typespec-otel-semconv/prefer-otel-key";
const DEPRECATED_RULE = "@ancplua/typespec-otel-semconv/no-deprecated-otel-key";
const TRIPLET_RULE = "@ancplua/typespec-otel-semconv/metric-triplet-bound";
const ENUM_RULE = "@ancplua/typespec-otel-semconv/enum-typed-value";
const SCHEMA_RULE = "@ancplua/typespec-otel-semconv/schema-url-coherence";
const ENTITY_RULE = "@ancplua/typespec-otel-semconv/entity-identifying-required";

function countRuleErrors(stdout: string, stderr: string, rule: string): number {
  const haystack = `${stdout}\n${stderr}`;
  const re = new RegExp(`error\\s+${rule.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "g");
  return (haystack.match(re) ?? []).length;
}

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

describe("KNOWN_DOMAINS data integrity", () => {
  // Drift-kill — closes the gap between the linter rule's hand-maintained
  // KNOWN_DOMAINS literal and the upstream YAML the .tsp library is generated
  // from. globalSetup walks the same model scripts/generate.mjs walks and
  // provides the canonical sorted list; this test asserts equality. A future
  // semconv bump that adds or retires a domain fails here until the rule's
  // list is regenerated, with no separate codegen step to remember.
  it("matches the union of every domain present in the upstream YAML model", () => {
    const yamlDomains = inject("otelDomains");
    const ruleDomains = [...KNOWN_DOMAINS].sort();
    expect(ruleDomains).toEqual([...yamlDomains]);
  });
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

describe("metric-triplet-bound linter rule", () => {
  it("fires once per model that binds Name without Unit + Instrument", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/lint.metric.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    // NameOnly violates; FullTriplet passes.
    expect(countRuleWarnings(stdout, stderr, TRIPLET_RULE)).toBe(1);
  }, 120_000);
});

describe("enum-typed-value linter rule", () => {
  it("fires when a string-typed property carries an attribute with a typed enum counterpart", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/lint.enum.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    // PlainString violates; EnumTyped passes.
    expect(countRuleWarnings(stdout, stderr, ENUM_RULE)).toBe(1);
  }, 120_000);
});

describe("$onValidate hard checks", () => {
  it("schema-url-coherence: errors when one namespace mixes two schema URLs", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/validate.schema-url.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    // Errors fail compilation by default.
    expect(exitCode).not.toBe(0);
    expect(countRuleErrors(stdout, stderr, SCHEMA_RULE)).toBe(1);
  }, 120_000);

  it("schema-url-coherence: silent when every property defaults to the same URL", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/validate.schema-url.valid.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    expect(countRuleErrors(stdout, stderr, SCHEMA_RULE)).toBe(0);
  }, 120_000);

  it("entity-identifying-required: fires once per offending @otelEntity across multiple entity kinds", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/validate.entity.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).not.toBe(0);
    // service.MissingIdentifying + host.HostMissing violate; siblings with the
    // identifying refs pass silently.
    expect(countRuleErrors(stdout, stderr, ENTITY_RULE)).toBe(2);
  }, 120_000);

  it("entity-identifying-required: silent when every @otelEntity model carries its required refs", async () => {
    const { exitCode, stdout, stderr } = await tspCompile(
      "test/validate.entity.valid.tsp",
      ["--no-emit"],
      REPO_ROOT,
    );
    expect(exitCode).toBe(0);
    expect(countRuleErrors(stdout, stderr, ENTITY_RULE)).toBe(0);
  }, 120_000);
});
