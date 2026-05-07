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
  type DiagnosticTarget,
  type DecoratorApplication,
  type ModelProperty,
  type StringValue,
} from "@typespec/compiler";
import { SyntaxKind } from "@typespec/compiler/ast";

// Sourced from the upstream model directory listing at v1.41.0; see
// scripts/generate.mjs which walks the same tree to produce the lib/*.tsp files.
// Keeping the list literal (not derived from the .tsp at lint time) avoids a
// circular dependency between the rule and the generated library.
const KNOWN_DOMAINS = new Set<string>([
  "android", "app", "artifact", "aspnetcore", "aws", "az", "azure", "browser",
  "cassandra", "cicd", "cli", "client", "cloud", "cloudevents", "cloudfoundry",
  "code", "container", "cpu", "cpython", "db", "deployment", "destination",
  "device", "disk", "dns", "dotnet", "elasticsearch", "enduser", "error",
  "event", "exception", "exceptions", "faas", "feature_flag", "file", "gcp",
  "gen_ai", "geo", "go", "graphql", "hardware", "heroku", "host", "http",
  "ios", "jsonrpc", "jvm", "k8s", "kestrel", "linux", "log", "mainframe", "mcp",
  "messaging", "network", "nfs", "nodejs", "oci", "onc_rpc", "openai",
  "openshift", "opentracing", "oracle_cloud", "oracledb", "os", "otel",
  "peer", "pprof", "process", "profile", "rpc", "security_rule", "server",
  "service", "session", "signalr", "source", "system", "telemetry", "test",
  "thread", "tls", "url", "user", "user_agent", "v8js", "vcs", "webengine", "zos",
]);

function looksLikeOtelKey(value: string): boolean {
  // Two-or-more dot-separated segments, first segment is a known OTel domain.
  // Underscored variants (e.g. "feature_flag.enabled") count as one segment for
  // the first-segment check; subsequent dots define the rest of the key.
  const dotIdx = value.indexOf(".");
  if (dotIdx <= 0 || dotIdx === value.length - 1) return false;
  const head = value.slice(0, dotIdx);
  return KNOWN_DOMAINS.has(head);
}

function pascalCase(s: string): string {
  return s.split(/[._-]/).filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join("");
}

function suggestSymbolFor(value: string): string {
  // Mirror scripts/generate.mjs domainOf + constNameOf without re-deriving from disk.
  const dotIdx = value.indexOf(".");
  const domain = value.slice(0, dotIdx);
  const tail = value.slice(dotIdx + 1);
  return `OTel.Keys.${pascalCase(domain)}.${pascalCase(tail)}`;
}

function getEncodedNameRawStringArg(
  app: DecoratorApplication,
): { value: string; target: DiagnosticTarget } | null {
  // @encodedName(mimeType, name) — args[1] is the one we care about.
  if (app.decorator.name !== "@encodedName" && app.definition?.name !== "@encodedName") {
    return null;
  }
  const arg = app.args[1];
  if (!arg) return null;

  // The whole point of this rule is distinguishing a raw string literal from
  // an alias-to-string-literal reference. TypeSpec's checker collapses both to
  // the same resolved StringValue, so we MUST inspect the syntax node:
  //   raw string:        StringLiteralNode (kind = SyntaxKind.StringLiteral)
  //   alias reference:   TypeReferenceNode / MemberExpressionNode / IdentifierNode
  // Only the raw-string case earns the warning.
  const node = arg.node as { kind?: number } | undefined;
  if (!node || node.kind !== SyntaxKind.StringLiteral) return null;

  const v = arg.value;
  if (typeof v !== "object" || v === null) return null;
  if ((v as StringValue).valueKind !== "StringValue") return null;

  return { value: (v as StringValue).value, target: arg.node as DiagnosticTarget };
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
        const arg = getEncodedNameRawStringArg(app);
        if (!arg) continue;
        if (!looksLikeOtelKey(arg.value)) continue;
        const suggestion = suggestSymbolFor(arg.value);
        const stringLiteralNode = arg.target;
        context.reportDiagnostic({
          target: stringLiteralNode,
          format: { value: arg.value, suggestion },
          codefixes: [
            defineCodeFix({
              id: "replace-with-typed-symbol",
              label: `Replace "${arg.value}" with ${suggestion}`,
              fix: (ctx) => {
                const loc = getSourceLocation(stringLiteralNode);
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
