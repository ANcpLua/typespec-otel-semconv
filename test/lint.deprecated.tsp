// Negative test for the `no-deprecated-otel-key` rule. Two call sites, two
// shapes of deprecation:
//
//   1. Raw string literal "http.client_ip" — upstream renamed_to: client.address.
//      Should fire `no-deprecated-otel-key` AND `prefer-otel-key` (both rules
//      detect a problem; rules are orthogonal).
//
//   2. Typed alias `OTel.Keys.Http.Flavor` — upstream obsoleted, no rename.
//      Should fire `no-deprecated-otel-key` only (alias references don't trip
//      the prefer-otel-key rule).

import "@ancplua/typespec-otel-semconv";

namespace LintDeprecated;

model RawDeprecated {
  @encodedName("application/json", "http.client_ip")
  ip: string;
}

model AliasDeprecated {
  @encodedName("application/json", OTel.Keys.Http.Flavor)
  protocolVersion: string;
}
