# @ancplua/typespec-otel-semconv

Weaver-based TypeSpec projection of OpenTelemetry semantic-convention attribute keys, pinned to **v1.41.0** of [`open-telemetry/semantic-conventions`](https://github.com/open-telemetry/semantic-conventions).

**Personal sandbox.** Not affiliated with OpenTelemetry. Not a normative source. The upstream YAML model is the only source of truth — this library is a downstream consumer that regenerates from that model via the official [OpenTelemetry Weaver](https://github.com/open-telemetry/weaver) CLI.

## Producer / consumer chain

```
open-telemetry/semantic-conventions @ v1.41.0     (authoritative upstream YAML model)
        │
        │  Weaver v0.23.0  +  templates/registry/typespec/{weaver.yaml, otel-keys.gen.tsp.j2}
        ▼
@ancplua/typespec-otel-semconv@1.41.0-N            (this repo — single-file TypeSpec const surface)
        │
        │  pinned exact npm dependency
        ▼
@o-ancpplua/otel-conventions-api                   (downstream API repo, multi-emitter)
        │
        │  generated C#/DuckDB/TS-types/...
        ▼
qyl + other consumers                              (instrumentation runtimes)
```

This repo emits exactly one artifact: `lib/otel-keys.gen.tsp` — a single TypeSpec file with one namespace per OTel root group, each declaring `const <Name>: string = "<dotted.key>"`. Downstream models reference these consts inside `@encodedName(...)` instead of hand-typing dotted attribute keys.

## See also

- [`ANcpLua/semconv-testbed`](https://github.com/ANcpLua/semconv-testbed) — **C# counterpart.** Same pinned semconv `v1.41.0` + Weaver `v0.23.0`, different templates → emits C# attribute classes targeted at [`opentelemetry-dotnet-contrib#4362`](https://github.com/open-telemetry/opentelemetry-dotnet-contrib/pull/4362) (Stable/Incubating split). Runs the byte-identity reproducibility gate plus a multi-target test matrix (net8.0 + net10.0) locally before push. The two repos share an upstream pin but emit independent language surfaces — no dependency between them.

## What you get

```tsp
import "@ancplua/typespec-otel-semconv";

@encodedName("application/json", ANcpLua.OtelConventions.OTel.Keys.GenAi.System)
system?: string;
```

Deprecated upstream attributes are emitted with `#deprecated "..."` so models that reference them produce a TypeSpec compiler warning matching upstream's own deprecation notes.

## One-time setup

```bash
git clone https://github.com/ANcpLua/typespec-otel-semconv.git
cd typespec-otel-semconv
git submodule update --init .tools/semconv-upstream
npm install
```

The submodule pins `open-telemetry/semantic-conventions` at commit `e018fe6f` (tag `v1.41.0`).

## Regenerate

```bash
bash scripts/bootstrap-weaver.sh    # download pinned Weaver v0.23.0 into .tools/weaver/
bash scripts/run-weaver.sh          # emit lib/otel-keys.gen.tsp
npm run lint:smoke                  # tsp compile test/smoke.tsp --warn-as-error --no-emit
npm run verify-clean                # regenerate + assert zero drift (no diff, no untracked)
npm run test                        # vitest: regen byte-identity + drift checks
npm run check                       # all of the above
```

## Nuke targets

Build orchestration is provided by [`ANcpLua.OpenTelemetry.Conventions.Nuke`](https://github.com/O-ANcppLua/ANcpLua.OpenTelemetry.Conventions.Nuke) via the `IUpstreamConventions` component interface. The Nuke build is a thin orchestrator over the same shell scripts.

```bash
./build.sh GenerateOtelKeys                # bootstrap + submodule + run-weaver
./build.sh VerifyOtelKeysReproducible      # default — generate twice, diff bytewise
./build.sh VerifyOtelKeysScriptParity      # exercise both bash + powershell bootstrap
./build.sh VerifyOtelKeysCompile           # npm run lint:smoke
./build.sh RunSmokeTests                   # npm run test
./build.sh VerifyClean                     # npm run verify-clean
./build.sh PackTypeSpecLibrary             # full check chain + npm pack
./build.sh PublishTypeSpecLibrary          # PackTypeSpecLibrary + npm publish --provenance
./build.sh --help                          # list every target
```

The default target (`VerifyOtelKeysReproducible`) chains `RestoreWeaver -> FetchSemconvModel -> GenerateOtelKeys -> diff`.

## Versioning

```
{semconv-version}-{n}
```

`semconv-version` is the upstream OpenTelemetry semantic-conventions release without the leading `v` (e.g. `1.41.0`). `n` is a monotonic generator-revision counter — bump it whenever the generator changes shape (template, Weaver version, scripts) but the upstream pin is unchanged. Examples: `1.41.0-1`, `1.41.0-2`, …

When the upstream pin bumps (e.g. to `1.42.0`), the counter resets: `1.42.0-1`.

## Pinning a different release

```bash
cd .tools/semconv-upstream
git fetch --tags
git checkout v1.42.0                       # for example
cd ../..
# update templates/registry/typespec/weaver.yaml: semconv_version, schema_url, schema_version
npm run generate
npm run check
# bump package.json version → 1.42.0-1
```

## Scope

| In scope                                                          | Out of scope                                                 |
|-------------------------------------------------------------------|--------------------------------------------------------------|
| `attribute_group` keys for the upstream root namespaces           | Hand-edited overrides on top of generated output             |
| Recursive `model/**/*.{yaml,yml}` (incl. `graphql/spans.yml`)     | Custom semconv registries (no federation)                    |
| Deprecation reasons + `renamed_to` migration targets              | `span` / `metric` / `event` / `entity` group surfaces        |
| Byte-reproducible regeneration                                    | Validating downstream SDK output                             |
| Bash↔PowerShell script parity                                    | OpenTelemetry contribution (this is personal)                |

## License

Apache-2.0. Generated content inherits the license of the upstream OpenTelemetry semantic-conventions YAML model.
