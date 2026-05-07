// Negative path for schema-url-coherence: a single OTel schema URL repeated
// across models in the namespace. $onValidate must NOT emit a diagnostic.

import "@ancplua/typespec-otel-semconv";

namespace SchemaValid;

model A {
  @encodedName("application/json", "schema_url")
  schemaUrl: string = OTel.Schemas.Current;
}

model B {
  @encodedName("application/json", "schema_url")
  schemaUrl: string = OTel.Schemas.Current;
}
