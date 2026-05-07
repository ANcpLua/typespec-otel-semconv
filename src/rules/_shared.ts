// SPDX-License-Identifier: MIT
//
// Shared helpers used by every rule + $onValidate. Pulled out so the
// @encodedName arg-extraction logic and the OTel-id → typed-symbol path
// derivation live in exactly one place.

import {
  type DecoratorApplication,
  type DiagnosticTarget,
  type ModelProperty,
  type StringValue,
} from "@typespec/compiler";
import { SyntaxKind } from "@typespec/compiler/ast";

export interface EncodedNameArg {
  readonly value: string;
  readonly target: DiagnosticTarget;
}

/**
 * Extract the resolved string value of `@encodedName(mimeType, name)`'s second
 * argument. Returns `null` when the decorator isn't `@encodedName` or the
 * second arg isn't a StringValue.
 *
 * When `rawStringLiteralOnly` is true, also returns `null` for alias-reference
 * args (e.g. `OTel.Keys.Http.ClientIp`). The TypeSpec checker collapses raw
 * strings and aliases-to-strings into the same StringValue, so distinguishing
 * them requires inspecting the syntax node kind. Only `prefer-otel-key` needs
 * that distinction; every other consumer wants both forms.
 */
export function getEncodedNameStringArg(
  app: DecoratorApplication,
  options: { rawStringLiteralOnly?: boolean } = {},
): EncodedNameArg | null {
  if (app.decorator.name !== "@encodedName" && app.definition?.name !== "@encodedName") {
    return null;
  }
  const arg = app.args[1];
  if (!arg) return null;

  if (options.rawStringLiteralOnly) {
    const node = arg.node as { kind?: number } | undefined;
    if (!node || node.kind !== SyntaxKind.StringLiteral) return null;
  }

  const v = arg.value;
  if (typeof v !== "object" || v === null) return null;
  if ((v as StringValue).valueKind !== "StringValue") return null;
  return { value: (v as StringValue).value, target: arg.node as DiagnosticTarget };
}

/** Read a property's default value if it's a string literal; otherwise null. */
export function getStringDefaultValue(prop: ModelProperty): string | null {
  const d = prop.defaultValue;
  if (!d || typeof d !== "object") return null;
  if ((d as StringValue).valueKind !== "StringValue") return null;
  return (d as StringValue).value;
}

function pascalCase(s: string): string {
  return s
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");
}

/**
 * Map an OTel attribute id to its typed alias path:
 *   "client.address"  → "OTel.Keys.Client.Address"
 *   "gen_ai.system"   → "OTel.Keys.GenAi.System"
 *
 * Mirrors `domainOf` + `constNameOf` in scripts/generate.mjs so the linter
 * suggestions stay in lockstep with the generator without re-deriving from
 * disk at lint time.
 */
export function symbolForId(id: string): string {
  const dotIdx = id.indexOf(".");
  if (dotIdx <= 0) return id;
  return `OTel.Keys.${pascalCase(id.slice(0, dotIdx))}.${pascalCase(id.slice(dotIdx + 1))}`;
}
