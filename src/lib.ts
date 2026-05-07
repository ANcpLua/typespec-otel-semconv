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
  },
});

export const { reportDiagnostic } = $lib;
