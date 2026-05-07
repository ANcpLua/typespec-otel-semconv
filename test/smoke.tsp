// Consumer-shaped smoke test exercising every surface the library emits:
//
//   OTel.Keys.<Domain>.<Name>      — attribute key string
//   OTel.Enums.<Domain>.<Name>     — enum-typed attribute value
//   OTel.Spans.<Domain>.<Name>     — span identifier string
//   OTel.Metrics.<Domain>.<Name>   — metric name + unit + instrument strings
//   OTel.Events.<Domain>.<Name>    — event name string
//   OTel.Entities.<Domain>.<Name>  — entity identifier string
//   OTel.Schemas.Current           — pinned schema URL
//
// `npx tsp compile test/smoke.tsp --warn-as-error --no-emit` is the green-light
// gate. Compiler-only (no @typespec/http dep) so the smoke test stays
// self-contained.

import "@ancplua/typespec-otel-semconv";

namespace Smoke;

/** Request envelope wired to OTel HTTP semconv. */
model HttpRequestInfo {
  @encodedName("application/json", OTel.Keys.Http.RequestMethod)
  method: OTel.Enums.Http.HttpRequestMethod;

  @encodedName("application/json", OTel.Keys.Server.Address)
  serverAddress: string;

  @encodedName("application/json", OTel.Keys.Url.Full)
  url: string;
}

/** Span identity (e.g., the consumer's tracer creates spans with this name). */
model SpanContext {
  @encodedName("application/json", "span_name")
  name: string = OTel.Spans.Http.ClientSpan;
}

/** Metric identity bundle — name, unit, and instrument all reach the consumer. */
model HttpServerRequestDurationMetric {
  @encodedName("application/json", "metric_name")
  name: string = OTel.Metrics.Http.ServerRequestDurationName;

  @encodedName("application/json", "metric_unit")
  unit: string = OTel.Metrics.Http.ServerRequestDurationUnit;

  @encodedName("application/json", "metric_instrument")
  instrument: string = OTel.Metrics.Http.ServerRequestDurationInstrument;
}

/** Event identity. */
model ExceptionEvent {
  @encodedName("application/json", "event_name")
  name: string = OTel.Events.Exception.ExceptionEvent;
}

/** Entity identity + schema URL. */
model ServiceContext {
  @encodedName("application/json", "entity_name")
  entityName: string = OTel.Entities.Service.ServiceEntity;

  @encodedName("application/json", "schema_url")
  schemaUrl: string = OTel.Schemas.Current;
}
