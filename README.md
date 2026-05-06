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

- **IDE autocomplete** — every attribute key resolves through the `OTel.Keys.<Domain>` namespace, every enum-typed attribute through `OTel.Enums.<Domain>`. Any TypeSpec-aware editor (VS Code with the TypeSpec extension, JetBrains via the LSP, Vim with the language server) sees the full namespace tree.
- **Hover tooltips** — every alias and enum carries a JSDoc comment with the upstream `brief`, the formal stability level (`development`, `alpha`, `beta`, `release_candidate`, `stable`), and — for deprecated entries — an actionable `@deprecated` tag like `renamed → client.address` extracted from the upstream `deprecated.renamed_to` field. The language server renders this on hover.
- **Compiler-level deprecation warnings on enum and enum-member references** — TypeSpec's `#deprecated` directive fires for enum-position references, so `OTel.Enums.Http.HttpRequestMethod` (the whole enum) and individual deprecated members produce a build-time warning when used.
- **Compiler-level deprecation warnings on attribute keys** — _not yet_. The keys are emitted as `alias Name = "foo.bar"` (a string-literal alias) so they satisfy `@encodedName(format, value: valueof string)`. TypeSpec 1.12.0-dev.6 does not fire `#deprecated` for value-position references to string-literal aliases. The directive and the JSDoc `@deprecated` tag are both emitted, so:
  - the IDE strikethrough still works today,
  - the build-time warning will start firing automatically once TypeSpec extends value-position deprecation checking — no library change needed.

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
| Enum-like `members`, requirement levels, deprecation, stability | Validating SDK output |
| Schema URLs | OpenTelemetry contribution (this is personal) |

## License

MIT.
