// metric-triplet-bound: ServerRequestDurationName referenced without Unit + Instrument
// fires once on the model declaration. Below it, a model that binds all three
// passes silently.

import "@ancplua/typespec-otel-semconv";

namespace LintMetric;

// Triggers metric-triplet-bound: only the Name is bound on the model.
model NameOnly {
  @encodedName("application/json", "metric_name")
  name: string = OTel.Metrics.Http.ServerRequestDurationName;
}

// Passes: full triplet bound.
model FullTriplet {
  @encodedName("application/json", "metric_name")
  name: string = OTel.Metrics.Http.ServerRequestDurationName;

  @encodedName("application/json", "metric_unit")
  unit: string = OTel.Metrics.Http.ServerRequestDurationUnit;

  @encodedName("application/json", "metric_instrument")
  instrument: string = OTel.Metrics.Http.ServerRequestDurationInstrument;
}
