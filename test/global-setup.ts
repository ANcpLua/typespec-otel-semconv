// Vitest globalSetup: walks the upstream YAML model once at suite start and
// publishes the union of every domain id present, sorted, via `provide()`.
// Tests retrieve it with `inject("otelDomains")`. Used by the
// KNOWN_DOMAINS-drift test in test/lint.test.ts to keep the linter rule's
// hand-literal in lockstep with whatever the .tsp library is generated from.

// @ts-expect-error — generate.mjs is JS without bundled .d.ts; runtime shape is stable.
import { readGroups, indexAttributes } from "../scripts/generate.mjs";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    otelDomains: readonly string[];
  }
}

export default function setup({ provide }: TestProject) {
  const groups = readGroups();
  const byId = indexAttributes(groups);
  const domains = new Set<string>();
  for (const id of byId.keys()) {
    const dot = id.indexOf(".");
    domains.add(dot === -1 ? id : id.slice(0, dot));
  }
  provide("otelDomains", [...domains].sort());
}
