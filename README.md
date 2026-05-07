# @ancplua/typespec-otel-semconv

TypeSpec library mirroring the [OpenTelemetry Semantic Conventions](https://github.com/open-telemetry/semantic-conventions) YAML model. Pinned to **v1.41.0**.

**Personal sandbox.** Not affiliated with OpenTelemetry. Not a normative source. The upstream YAML model is the only source of truth — this library is a downstream consumer that regenerates from that model.

## Why

So that a `.tsp` author writing an HTTP API spec can write

```typespec
import "@ancplua/typespec-otel-semconv";

namespace MyApi;

model RouteInfo {
  @encodedName("application/json", OTel.Keys.Http.RequestMethod)
  method: OTel.Enums.Http.HttpRequestMethod;

  @encodedName("application/json", OTel.Keys.Server.Address)
  serverAddress: string;
}
```

instead of stringly-typed `"http.request.method"`. Names, enum values, deprecation flags, and stability levels stay in lockstep with upstream because every release is a clean regen.

## What you get

### Full coverage of the upstream YAML model

All five OTel group types reach the consumer as typed symbols:

| Group type (upstream) | Library surface | Example |
|---|---|---|
| `attribute_group` | `OTel.Keys.<Domain>.<Name>` (alias to attribute key string) | `OTel.Keys.Http.RequestMethod` → `"http.request.method"` |
| Member-style attribute | `OTel.Enums.<Domain>.<Name>` (typed enum) | `OTel.Enums.Http.HttpRequestMethod.Get` → `"GET"` |
| `span` | `OTel.Spans.<Domain>.<Name>Span` | `OTel.Spans.Http.ClientSpan` → `"http.client"` |
| `metric` | `OTel.Metrics.<Domain>.<Name>{Name,Unit,Instrument}` (three aliases per metric) | `…ServerRequestDurationName` / `…Unit` (`"s"`) / `…Instrument` (`"histogram"`) |
| `event` | `OTel.Events.<Domain>.<Name>Event` | `OTel.Events.Exception.ExceptionEvent` → `"exception"` |
| `entity` | `OTel.Entities.<Domain>.<Name>Entity` | `OTel.Entities.Service.ServiceEntity` → `"service"` |

Plus `OTel.Schemas.Current` (`"https://opentelemetry.io/schemas/1.41.0"`) and the version-specific alias `OTel.Schemas.V1410`.

### Editor + compiler experience

- **IDE autocomplete** — every symbol resolves through its namespace tree. Any TypeSpec-aware editor (VS Code with the TypeSpec extension, JetBrains via the LSP, Vim with the language server) sees the full structure.
- **Hover tooltips** — every alias and enum carries a JSDoc comment with the upstream `brief`, the formal stability level (`development`, `alpha`, `beta`, `release_candidate`, `stable`), the `@instrument` / `@unit` / `@spanKind` / `@identifying` tags where applicable, and — for deprecated entries — an actionable `@deprecated` tag like `renamed → client.address` extracted from the upstream `deprecated.renamed_to` field.
- **Compiler-level deprecation warnings on enum and enum-member references** — TypeSpec's `#deprecated` directive fires for enum-position references, so `OTel.Enums.Http.HttpRequestMethod` (the whole enum) and individual deprecated members produce a build-time warning when used.
- **Compiler-level deprecation warnings on attribute keys** — _not yet_. Keys are emitted as `alias Name = "foo.bar"` so they satisfy `@encodedName(format, value: valueof string)`. TypeSpec 1.12.0-dev.6 does not fire `#deprecated` for value-position references to string-literal aliases. The directive and the JSDoc `@deprecated` tag are both emitted, so the IDE strikethrough still works today, and the build-time warning starts firing automatically once TypeSpec extends value-position deprecation checking — no library change needed at that point.

### Emitter-agnostic by construction

The library only contributes `.tsp` source. Every TypeSpec emitter that honours `@encodedName` consumes it transparently — no language-specific code lives here.

Verified against `@typespec/openapi3` (`test/openapi3.tsp`): the consumer's
`@encodedName("application/json", OTel.Keys.Http.RequestMethod)` lands in the
generated `openapi.yaml` as the property name `http.request.method`, and the
default-valued `schema_url` gets `default: https://opentelemetry.io/schemas/1.41.0`.
The same library passes through `@typespec/http-client-{csharp,java,js,python}`,
`@typespec/http-server-{csharp,js}`, `@typespec/json-schema`, and any other
`@typespec/*` emitter the consumer chooses.

## Source-of-truth chain

```
upstream YAML model (authoritative — open-telemetry/semantic-conventions @ v1.41.0)
        ↓
  scripts/generate.mjs
        ↓
   lib/**/*.tsp (this library)
```

One direction. The `.tsp` does not feed back into anything upstream. It is not a normative representation. It is not used to validate Weaver-generated language outputs. It is purely a *consumer-side convenience* for TypeSpec API authors who want OTel attribute names by symbol instead of string.

## Regen

```bash
git submodule update --init .tools/semconv-upstream
npm install
npm run generate
npm run lint    # tsp compile --warn-as-error --no-emit
```

`npm run verify-clean` runs the generator and asserts `git diff --exit-code -- lib/` — byte-identity regeneration on a clean checkout is the contract.

## Pinning a different release

This library tracks one upstream release at a time. To bump:

1. `cd .tools/semconv-upstream && git fetch --tags && git checkout v1.42.0`
2. `cd ../.. && npm run generate`
3. `npm run lint`
4. Update `package.json#metadata.semconvVersion`.
5. Commit `package.json`, the submodule pointer, and the regenerated `lib/`.

## Scope

| In scope | Out of scope |
|---|---|
| `attribute_group`, `span`, `metric`, `event`, `entity` group types | Hand-edited overrides on top of generated output |
| All `model/**/*.yaml` AND `model/**/*.yml` | Custom semconv registries (no federation) |
| Recursive nested directories incl. `deprecated/` subtrees | OTel SDK runtime constants (use upstream Weaver `csharp_*` templates) |
| Enum-like `members`, deprecation reasons + `renamed_to` migration targets, stability | Validating SDK output |
| Span kind, metric instrument + unit, event name, entity identifying refs | Conditional `requirement_level` enforcement |
| Schema URL constants | OpenTelemetry contribution (this is personal) |

## Stats — v1.41.0

```
935 groups   925 attributes   70 spans   529 metrics   31 events   63 entities
       ↓
90 key files + 53 enum files + 15 spans + 29 metrics + 14 events + 24 entities + main + schema
```

## License

MIT.
