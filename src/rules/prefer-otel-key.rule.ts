// SPDX-License-Identifier: MIT
//
// Linter rule: warns when `@encodedName("application/json", "<otel-shaped-string>")`
// is called with a literal string that matches the OTel namespace shape but the
// library would have given the consumer a typed alias instead.
//
// Why a rule and not just docs:
// - TypeSpec's #deprecated directive doesn't fire on string literals in value
//   position (verified against compiler 1.12.0-dev.6). Without this rule, a
//   consumer who pastes "http.client_ip" gets zero feedback that they're using
//   a deprecated key. The rule closes that loop by recognising the shape and
//   pointing at OTel.Keys.Http.ClientIp where #deprecated does live in the
//   JSDoc and (when TypeSpec extends value-position deprecation) on the symbol.
//
// What "OTel-shaped" means for the trigger:
// - Two or more dot-separated segments (single-segment strings like "service"
//   are too noisy to flag);
// - First segment matches one of the upstream domain identifiers known at
//   build time (see KNOWN_DOMAINS in this file). The list is generated from
//   the same YAML walk the .tsp library is — kept in sync via npm run generate.

import {
  createRule,
  defineCodeFix,
  getSourceLocation,
  type ModelProperty,
} from "@typespec/compiler";
import { KNOWN_DOMAINS } from "../generated/known-domains.js";
import { getEncodedNameStringArg, symbolForId } from "./_shared.js";

function looksLikeOtelKey(value: string): boolean {
  // Two-or-more dot-separated segments, first segment is a known OTel domain.
  // Underscored variants (e.g. "feature_flag.enabled") count as one segment for
  // the first-segment check; subsequent dots define the rest of the key.
  const dotIdx = value.indexOf(".");
  if (dotIdx <= 0 || dotIdx === value.length - 1) return false;
  return KNOWN_DOMAINS.has(value.slice(0, dotIdx));
}

export const preferOtelKeyRule = createRule({
  name: "prefer-otel-key",
  severity: "warning",
  description: "Prefer typed OTel.Keys.<Domain>.<Name> aliases over raw OTel attribute key strings.",
  messages: {
    default:
      "Raw OTel attribute key — prefer the typed symbol from this library so the value stays in lockstep with upstream YAML and the IDE gets autocomplete + deprecation tooltips.",
  },
  create(context) {
    const visit = (prop: ModelProperty) => {
      for (const app of prop.decorators) {
        const arg = getEncodedNameStringArg(app, { rawStringLiteralOnly: true });
        if (!arg) continue;
        if (!looksLikeOtelKey(arg.value)) continue;
        const suggestion = symbolForId(arg.value);
        context.reportDiagnostic({
          target: arg.target,
          format: { value: arg.value, suggestion },
          codefixes: [
            defineCodeFix({
              id: "replace-with-typed-symbol",
              label: `Replace "${arg.value}" with ${suggestion}`,
              fix: (ctx) => {
                const loc = getSourceLocation(arg.target);
                if (!loc) return undefined;
                // The StringLiteralNode's range covers the string token including
                // both quote characters, so replacing with the bare symbol path
                // produces a syntactically-valid expression.
                return ctx.replaceText(loc, suggestion);
              },
            }),
          ],
        });
      }
    };
    return {
      modelProperty: visit,
      operation: (op) => {
        for (const [, p] of op.parameters.properties) visit(p);
      },
    };
  },
});
