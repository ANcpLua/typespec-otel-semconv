// entity-identifying-required ($onValidate, error severity): the @otelEntity
// decorator marks a model as implementing an upstream OTel entity. The
// validator checks that every identifying attribute upstream lists for that
// entity is bound somewhere on the model via @encodedName.
//
// "service" entity identifies on `service.name`. The first model lacks it;
// the second binds it.

import "@ancplua/typespec-otel-semconv";

namespace EntityCheck;

@OTel.otelEntity("service")
model MissingIdentifying {
  @encodedName("application/json", "service.version")
  version: string;
}

@OTel.otelEntity("service")
model HasIdentifying {
  @encodedName("application/json", OTel.Keys.Service.Name)
  name: string;

  @encodedName("application/json", OTel.Keys.Service.Version)
  version: string;
}

// Multi-entity coverage — `app` identifies on app.build_id (one of the
// 30 entities upstream tags with role: identifying explicitly). Distinct from
// service so the validator's per-entity dispatch is exercised.
@OTel.otelEntity("app")
model AppMissing {
  @encodedName("application/json", OTel.Keys.App.InstallationId)
  installationId: string;
}

@OTel.otelEntity("app")
model AppHasBuildId {
  @encodedName("application/json", OTel.Keys.App.BuildId)
  buildId: string;
}
