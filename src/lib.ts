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
  },
});

export const { reportDiagnostic } = $lib;
