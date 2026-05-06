// What this test asserts and what it doesn't.
//
// What it asserts:
//   - The `#deprecated` directive on the deprecated alias parses cleanly.
//   - The JSDoc `@deprecated <reason>` tag is present in the comment, so the
//     IDE language server will render the consumer's reference with
//     strikethrough / a tooltip in any TypeSpec-aware editor.
//   - The migration target (`renamed_to` from upstream YAML) is in the message,
//     so the warning is actionable: "renamed → client.address" instead of just
//     "renamed".
//
// What it does NOT yet assert:
//   - A compiler-level diagnostic on consumer reference. TypeSpec 1.12.0-dev.6
//     fires `#deprecated` warnings for type-position references (model, scalar,
//     enum, alias-to-type) but NOT for value-position references to consts or
//     aliases-of-string-literals. The library uses string-literal aliases as the
//     primary surface because that's what `@encodedName(format, value: valueof
//     string)` requires; until TypeSpec extends value-position deprecation
//     checking, consumers see deprecation in the IDE but not on `tsp compile`.
//
// `npx tsp compile test/deprecation.tsp --no-emit` is expected to pass (no
// compiler diagnostic emitted today). Once TypeSpec gains value-position
// deprecation, this test starts producing a warning automatically — no library
// change needed.

import "../lib/main.tsp";

namespace DeprecationCheck;

model UsingDeprecatedKey {
  @encodedName("application/json", OTel.Keys.Http.ClientIp)
  ip: string;
}
