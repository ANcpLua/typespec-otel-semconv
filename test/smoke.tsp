// Smoke test: compile the generated otel-keys.gen.tsp via `tsp compile --no-emit`
// to confirm the file is syntactically and semantically valid TypeSpec. Pure
// compile gate; no @typespec/http dep so this stays self-contained.

import "../lib/otel-keys.gen.tsp";

// Touch a handful of generated symbols across different domains to force the
// compiler to bind them. If any of these references go red, the generator
// has produced a name the smoke gate does not expect.
using ANcpLua.OtelConventions.OTel.Keys;

namespace SmokeTest;

/** Smoke model — exercises Http and Db key namespaces. */
model Smoke {
  @encodedName("application/json", Http.RequestMethod)
  method: string;

  @encodedName("application/json", Db.SystemName)
  databaseSystem: string;
}
