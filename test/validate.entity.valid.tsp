// Negative path for entity-identifying-required: every @otelEntity model
// includes the upstream-required identifying refs. $onValidate must NOT
// emit a diagnostic.

import "@ancplua/typespec-otel-semconv";

namespace EntityValid;

@OTel.otelEntity("service")
model GoodService {
  @encodedName("application/json", OTel.Keys.Service.Name)
  name: string;
}

@OTel.otelEntity("app")
model GoodApp {
  @encodedName("application/json", OTel.Keys.App.BuildId)
  buildId: string;
}
