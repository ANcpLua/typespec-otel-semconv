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
import { $otelEntity } from "./decorators.js";
import { preferOtelKeyRule } from "./rules/prefer-otel-key.rule.js";
import { noDeprecatedOtelKeyRule } from "./rules/no-deprecated-otel-key.rule.js";
import { metricTripletBoundRule } from "./rules/metric-triplet-bound.rule.js";
import { enumTypedValueRule } from "./rules/enum-typed-value.rule.js";

export { $lib, $otelEntity };
export { $onValidate } from "./validate.js";
export {
  preferOtelKeyRule,
  noDeprecatedOtelKeyRule,
  metricTripletBoundRule,
  enumTypedValueRule,
};

// Wire `extern dec otelEntity(...)` in lib/_decorators.tsp to its JS impl.
// The compiler reads this export, finds OTel.otelEntity in user code, and
// dispatches to $otelEntity at decorator-call time.
export const $decorators = {
  "OTel": {
    otelEntity: $otelEntity,
  },
};

const allRules = [
  preferOtelKeyRule,
  noDeprecatedOtelKeyRule,
  metricTripletBoundRule,
  enumTypedValueRule,
];

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
