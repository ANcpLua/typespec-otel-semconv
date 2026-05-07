// SPDX-License-Identifier: MIT
//
// TypeSpec library registration. Exports $lib (diagnostics namespace) and the
// shared `reportDiagnostic` helper. The linter is registered separately in
// index.ts because rules import from this module.

import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@ancplua/typespec-otel-semconv",
  diagnostics: {
    "prefer-otel-key": {
      severity: "warning",
      messages: {
        default: paramMessage`Raw OTel attribute key '${"value"}' — prefer the typed symbol '${"suggestion"}' from this library so the IDE gets autocomplete + (eventual) deprecation warnings, and the value stays in lockstep with upstream YAML.`,
      },
    },
    "no-deprecated-otel-key": {
      severity: "warning",
      messages: {
        default:
          "Deprecated OTel attribute key. Upstream marks it deprecated; replace with the migration target so downstream telemetry stays on the supported wire format.",
        renamed:
          "Deprecated OTel attribute key — upstream renamed it. Replace this reference with the migration target so downstream telemetry stays on the supported wire format.",
        obsoleted:
          "Deprecated OTel attribute key — upstream obsoleted it without a documented replacement. Audit the call site against the upstream YAML before keeping this reference.",
      },
    },
    "metric-triplet-bound": {
      severity: "warning",
      messages: {
        default: paramMessage`Metric '${"metric"}' is referenced without its identifying triplet — also bind '${"unit"}' (Unit) and '${"instrument"}' (Instrument) on this model so the recorded metric identity stays whole.`,
      },
    },
    "enum-typed-value": {
      severity: "warning",
      messages: {
        default: paramMessage`Property carrying OTel attribute '${"attr"}' is typed plain string — upstream defines a typed enum '${"enum"}'. Use the enum so the consumer cannot record a value outside the upstream member set.`,
      },
    },
    "schema-url-coherence": {
      severity: "error",
      messages: {
        default: paramMessage`Service namespace mixes OTel schema URLs '${"a"}' and '${"b"}'. A single service must agree on one schema version; consolidate on OTel.Schemas.Current (or one of the dated aliases) across every property default in the namespace.`,
      },
    },
    "entity-identifying-required": {
      severity: "error",
      messages: {
        default: paramMessage`Model marked @otelEntity("${"name"}") is missing identifying attribute(s) [${"missing"}]. Upstream lists [${"required"}] as identifying; the recorded entity won't be uniquely addressable without them.`,
      },
    },
  },
});

export const { reportDiagnostic } = $lib;
