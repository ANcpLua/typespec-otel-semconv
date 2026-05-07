// Negative test: this spec uses RAW OTel attribute keys as `@encodedName`
// strings instead of the typed library aliases. The linter rule
// `@ancplua/typespec-otel-semconv/prefer-otel-key` should fire on every
// `@encodedName(_, "<otel-shaped>")` call below.
//
// The test/lint.test.ts harness asserts:
//   - exactly N warnings emitted (one per raw key below);
//   - each diagnostic's code is `prefer-otel-key`;
//   - the message names the offending value AND the suggested symbol.

import "@ancplua/typespec-otel-semconv";

namespace LintBad;

model NotUsingTheLibrary {
  @encodedName("application/json", "http.request.method")
  method: string;

  @encodedName("application/json", "server.address")
  serverAddress: string;

  @encodedName("application/json", "url.full")
  url: string;
}
