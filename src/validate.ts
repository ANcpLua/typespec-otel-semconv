// $onValidate — always-on hard-error checks. The TypeSpec linter runs
// opt-in (consumer must extend a ruleset in tspconfig); $onValidate runs
// every compile. Reserve it for invariants where a violation cannot be a
// stylistic divergence.

import {
  navigateProgram,
  type Namespace,
  type Program,
  type Model,
  type StringValue,
} from "@typespec/compiler";
import { $lib, reportDiagnostic } from "./lib.js";
import { listOtelEntities } from "./decorators.js";
import { ENTITY_IDENTIFYING } from "./generated/entity-identifying.js";

const SCHEMA_URL_RE = /^https:\/\/opentelemetry\.io\/schemas\/[\d.]+$/;

interface SchemaSighting {
  url: string;
  ns: Namespace;
}

function getStringDefault(node: { defaultValue?: unknown }): string | null {
  const d = (node as { defaultValue?: unknown }).defaultValue;
  if (!d || typeof d !== "object") return null;
  if ((d as StringValue).valueKind !== "StringValue") return null;
  return (d as StringValue).value;
}

function topServiceNamespace(ns: Namespace | undefined): Namespace | undefined {
  // Walk up to the root user-namespace; the "service" boundary in TypeSpec is
  // the namespace marked @service, but we don't have a clean way to find it
  // from here without re-scanning, so we use the top-level user namespace as a
  // pragmatic stand-in. The compiler's TypeSpec namespace is filtered out by
  // navigateProgram's default scope, so this never bubbles past the user tree.
  let cursor: Namespace | undefined = ns;
  while (cursor && cursor.namespace && cursor.namespace.name !== "" && cursor.namespace.name !== undefined) {
    cursor = cursor.namespace;
  }
  return cursor;
}

function checkSchemaUrlCoherence(program: Program): void {
  const byNamespace = new Map<Namespace, SchemaSighting[]>();
  navigateProgram(program, {
    modelProperty: (prop) => {
      const v = getStringDefault(prop);
      if (!v || !SCHEMA_URL_RE.test(v)) return;
      const owning = (prop.model as Model | undefined)?.namespace;
      const top = topServiceNamespace(owning);
      if (!top) return;
      const list = byNamespace.get(top) ?? [];
      list.push({ url: v, ns: top });
      byNamespace.set(top, list);
    },
  });
  for (const [ns, sightings] of byNamespace) {
    const distinct = [...new Set(sightings.map((s) => s.url))];
    if (distinct.length <= 1) continue;
    // One diagnostic per offending namespace, naming the first two distinct
    // URLs in conflict — keeps the message focused without enumerating every
    // pair when more than two are in flight.
    reportDiagnostic(program, {
      code: "schema-url-coherence",
      format: { a: distinct[0]!, b: distinct[1]! },
      target: ns,
    });
  }
}

function checkEntityIdentifyingRequired(program: Program): void {
  for (const [model, entityName] of listOtelEntities(program)) {
    const required = ENTITY_IDENTIFYING.get(entityName);
    if (!required || required.length === 0) continue;
    const seen = new Set<string>();
    for (const [, prop] of model.properties) {
      for (const app of prop.decorators) {
        if (app.decorator.name !== "@encodedName" && app.definition?.name !== "@encodedName") continue;
        const arg = app.args[1];
        if (!arg) continue;
        const v = arg.value;
        if (typeof v !== "object" || v === null) continue;
        if ((v as StringValue).valueKind !== "StringValue") continue;
        seen.add((v as StringValue).value);
      }
    }
    const missing = required.filter((id) => !seen.has(id));
    if (missing.length === 0) continue;
    reportDiagnostic(program, {
      code: "entity-identifying-required",
      format: {
        name: entityName,
        missing: missing.join(", "),
        required: required.join(", "),
      },
      target: model,
    });
  }
}

export function $onValidate(program: Program): void {
  checkSchemaUrlCoherence(program);
  checkEntityIdentifyingRequired(program);
}
