// Multi-emitter proof: an HTTP API that imports the library, references OTel
// keys/enums/spans/metrics/events/entities by symbol, and emits OpenAPI 3.1.
//
// Run:
//   npx tsp compile test/openapi3.tsp --output-dir /tmp/openapi3-out --emit @typespec/openapi3
//
// The generated openapi.yaml shows the OTel string values flowing through the
// emitter into the schema — same library would produce the equivalent shapes
// through @typespec/http-client-csharp, @typespec/http-client-java,
// @typespec/http-client-js, @typespec/http-client-python, or any other emitter
// the user chooses. The library itself is emitter-agnostic; it only contributes
// .tsp source.

import "@typespec/http";
import "@ancplua/typespec-otel-semconv";

using TypeSpec.Http;

@service(#{ title: "OTel-aware sample API" })
namespace SampleApi;

/** Inbound HTTP request envelope. */
model HttpRequestRecord {
  @encodedName("application/json", OTel.Keys.Http.RequestMethod)
  method: OTel.Enums.Http.HttpRequestMethod;

  @encodedName("application/json", OTel.Keys.Url.Full)
  url: string;

  @encodedName("application/json", OTel.Keys.Server.Address)
  serverAddress: string;
}

/** Service-context envelope (mirrors what an OTel exporter would attach). */
model ServiceContext {
  @encodedName("application/json", "entity_name")
  entityName: string = OTel.Entities.Service.ServiceEntity;

  @encodedName("application/json", OTel.Keys.Service.Name)
  serviceName: string;

  @encodedName("application/json", "schema_url")
  schemaUrl: string = OTel.Schemas.Current;
}

@route("/requests")
@post
op recordRequest(@body request: HttpRequestRecord): HttpRequestRecord;

@route("/service")
@get
op service(): ServiceContext;
