// SPDX-License-Identifier: MIT
//
// TypeSpec library entry. Exports $lib (the diagnostics namespace) and $linter
// (the rule registry). Consumers enable the recommended ruleset in tspconfig:
//
//   linter:
//     extends:
//       - "@ancplua/typespec-otel-semconv/recommended"

import { defineLinter } from "@typespec/compiler";
import { $lib } from "./lib.js";
import { preferOtelKeyRule } from "./rules/prefer-otel-key.rule.js";
import { noDeprecatedOtelKeyRule } from "./rules/no-deprecated-otel-key.rule.js";

export { $lib };
export { preferOtelKeyRule, noDeprecatedOtelKeyRule };

const allRules = [preferOtelKeyRule, noDeprecatedOtelKeyRule];

export const $linter = defineLinter({
  rules: allRules,
  ruleSets: {
    recommended: {
      enable: Object.fromEntries(allRules.map((r) => [`${$lib.name}/${r.name}`, true])),
    },
    all: {
      enable: Object.fromEntries(allRules.map((r) => [`${$lib.name}/${r.name}`, true])),
    },
  },
});
