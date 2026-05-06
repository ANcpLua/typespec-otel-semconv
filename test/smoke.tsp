// Consumer-shaped smoke test. Mirrors the call-site shape an API author would
// use — referencing OTel attribute keys by symbol, OTel enum-typed values by
// type, and the schema URL by const, all in the same .tsp file.
//
// `tsp compile test/smoke.tsp --warn-as-error --no-emit` is the green-light gate.
// Compiler-only (no @typespec/http dep) so the smoke test stays self-contained.

import "../lib/main.tsp";

namespace Smoke;

/** Request envelope using OTel-typed names instead of stringly-typed strings. */
model HttpRequestInfo {
  @encodedName("application/json", OTel.Keys.Http.RequestMethod)
  method: OTel.Enums.Http.HttpRequestMethod;

  @encodedName("application/json", "schema_url")
  schemaUrl: string = OTel.Schemas.Current;
}
