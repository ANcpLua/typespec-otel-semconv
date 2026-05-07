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

export { $lib };
export { preferOtelKeyRule };

export const $linter = defineLinter({
  rules: [preferOtelKeyRule],
  ruleSets: {
    recommended: {
      enable: { [`${$lib.name}/${preferOtelKeyRule.name}`]: true },
    },
    all: {
      enable: { [`${$lib.name}/${preferOtelKeyRule.name}`]: true },
    },
  },
});
