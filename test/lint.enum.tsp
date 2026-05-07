// enum-typed-value: property carries an OTel attribute that has a typed enum
// counterpart, but the property's type is bare string. Should fire once. The
// adjacent property typed with the matching enum passes silently.

import "@ancplua/typespec-otel-semconv";

namespace LintEnum;

model PlainString {
  // http.request.method has OTel.Enums.Http.HttpRequestMethod — should warn.
  @encodedName("application/json", OTel.Keys.Http.RequestMethod)
  method: string;
}

model EnumTyped {
  @encodedName("application/json", OTel.Keys.Http.RequestMethod)
  method: OTel.Enums.Http.HttpRequestMethod;
}
