// Verify-style snapshot tests. Vitest's `toMatchFileSnapshot` is the JS
// equivalent of Verify in .NET: writes a file on first run, diffs on
// subsequent runs, --update accepts the new shape. Diff lands in PR review.
//
// Two snapshots:
//
//   1. lib/structure.snap.json — high-level shape of the generated library
//      (file count per surface, total domains, total symbols). Catches
//      accidental drift even when individual file diffs are too noisy to read.
//
//   2. test/__snapshots__/openapi3.yaml.snap — the openapi3 emitter output
//      for the smoke spec. Catches downstream behavior changes (e.g. a
//      TypeSpec compiler upgrade silently changes how @encodedName flows
//      into the schema). The committed snapshot IS the contract.

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tspCompile, freshOutputDir, readNormalized } from "./setup";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LIB_DIR = resolve(REPO_ROOT, "lib");

describe("library structure", () => {
  it("matches the recorded shape per surface", async () => {
    const files = readdirSync(LIB_DIR).sort();
    // Files like `http.tsp` (the attribute-key file) vs `http.enums.tsp` /
    // `http.metrics.tsp` etc. Naming is unambiguous: a SINGLE dot means the
    // key file, multiple dots mean a sub-surface (enums/spans/metrics/events/entities).
    const isKeyFile = (f: string) =>
      /^[a-z_]+\.tsp$/.test(f) && f !== "main.tsp" && !f.startsWith("_");

    const shape = {
      total: files.length,
      keys: files.filter(isKeyFile).length,
      enums: files.filter((f) => f.endsWith(".enums.tsp")).length,
      spans: files.filter((f) => f.endsWith(".spans.tsp")).length,
      metrics: files.filter((f) => f.endsWith(".metrics.tsp")).length,
      events: files.filter((f) => f.endsWith(".events.tsp")).length,
      entities: files.filter((f) => f.endsWith(".entities.tsp")).length,
      bareDomains: files.filter(isKeyFile).map((f) => f.replace(/\.tsp$/, "")).sort(),
    };
    await expect(JSON.stringify(shape, null, 2)).toMatchFileSnapshot(
      "./__snapshots__/library-structure.json",
    );
  });
});

describe("openapi3 emitter passthrough", () => {
  it("emits the OTel string values verbatim into the schema", async () => {
    const outDir = freshOutputDir();
    const { exitCode, stderr } = await tspCompile(
      "test/openapi3.tsp",
      ["--output-dir", outDir, "--emit", "@typespec/openapi3"],
      REPO_ROOT,
    );
    expect({ exitCode, stderr }).toMatchObject({ exitCode: 0 });

    const yaml = readNormalized(join(outDir, "@typespec", "openapi3", "openapi.yaml"));
    await expect(yaml).toMatchFileSnapshot(
      "./__snapshots__/openapi3-smoke.yaml",
    );
  }, 180_000);
});
