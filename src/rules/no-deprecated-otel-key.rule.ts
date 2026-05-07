// SPDX-License-Identifier: MIT
//
// Linter rule: warns when an `@encodedName` value (raw string OR typed alias)
// resolves to an attribute id that upstream OTel marks as `deprecated:` at the
// pinned semconv release.
//
// Why this rule exists:
// - TypeSpec's #deprecated directive does not fire on string-literal aliases
//   in value position in compiler 1.12.0-dev.6 (verified). The library's
//   .tsp emits #deprecated on every deprecated alias and an `@deprecated …`
//   JSDoc tag, but neither produces a build-time diagnostic at the consumer.
// - This rule closes that loop. It works on BOTH the raw-string case
//   (`@encodedName(_, "http.client_ip")`) and the alias-reference case
//   (`@encodedName(_, OTel.Keys.Http.ClientIp)`), because both resolve to
//   the same StringValue at decorator-arg time. We don't need to inspect the
//   AST shape — the resolved value is enough.
//
// Codefix: when upstream documents `renamed_to: <new.id>`, the codefix
// rewrites the call site to `OTel.Keys.<DomainPascal>.<TailPascal>` for the
// new id. For obsoleted entries with no replacement, the codefix is omitted
// (the consumer needs to make a real product decision, not a mechanical edit).

import {
  createRule,
  defineCodeFix,
  getSourceLocation,
  type ModelProperty,
} from "@typespec/compiler";
import { DEPRECATED_KEYS } from "../generated/deprecated-keys.js";
import { getEncodedNameStringArg, symbolForId } from "./_shared.js";

export const noDeprecatedOtelKeyRule = createRule({
  name: "no-deprecated-otel-key",
  severity: "warning",
  description:
    "Warn when an @encodedName argument resolves to an OTel attribute id that upstream marks as deprecated. Bridges TypeSpec's value-position #deprecated gap.",
  messages: {
    default:
      "Deprecated OTel attribute key. Upstream marks it deprecated; replace with the migration target so downstream telemetry stays on the supported wire format.",
    renamed:
      "Deprecated OTel attribute key — upstream renamed it. Replace this reference with the migration target so downstream telemetry stays on the supported wire format.",
    obsoleted:
      "Deprecated OTel attribute key — upstream obsoleted it without a documented replacement. Audit the call site against the upstream YAML before keeping this reference.",
  },
  create(context) {
    const visit = (prop: ModelProperty) => {
      for (const app of prop.decorators) {
        const arg = getEncodedNameStringArg(app);
        if (!arg) continue;
        const entry = DEPRECATED_KEYS.get(arg.value);
        if (!entry) continue;

        const messageId =
          entry.reason === "renamed" && entry.replacement
            ? "renamed"
            : entry.replacement
              ? "default"
              : "obsoleted";

        const codefixes =
          entry.replacement !== null
            ? [
                defineCodeFix({
                  id: "migrate-to-renamed-target",
                  label: `Migrate "${entry.id}" → ${symbolForId(entry.replacement)}`,
                  fix: (ctx) => {
                    const loc = getSourceLocation(arg.target);
                    if (!loc) return undefined;
                    return ctx.replaceText(loc, symbolForId(entry.replacement!));
                  },
                }),
              ]
            : undefined;

        context.reportDiagnostic({
          messageId,
          target: arg.target,
          codefixes,
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
