// schema-url-coherence ($onValidate, error severity): two property defaults
// in the same top-level namespace point at different OTel schema URLs. Should
// emit one error per namespace.

import "@ancplua/typespec-otel-semconv";

namespace SchemaConflict;

model A {
  @encodedName("application/json", "schema_url")
  schemaUrl: string = "https://opentelemetry.io/schemas/1.41.0";
}

model B {
  @encodedName("application/json", "schema_url")
  schemaUrl: string = "https://opentelemetry.io/schemas/1.40.0";
}
