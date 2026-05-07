#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Regenerate lib/*.tsp from the upstream OpenTelemetry semantic-conventions YAML
// pinned at .tools/semconv-upstream (submodule). Source-of-truth chain:
//
//   upstream YAML (authoritative)  →  this script  →  lib/*.tsp  →  consumer .tsp
//
// One direction. The .tsp output is a downstream convenience layer for TypeSpec
// API authors who want OTel attribute names by symbol instead of by string. It is
// not normative, not used to validate any SDK output, and not part of any OTel
// codegen path. See README.md.
//
// Per OpenTelemetry semantic-conventions repo conventions:
// - Discovers groups by their `type:` field (attribute_group, span, metric, event,
//   entity), not by directory name.
// - Walks **/*.yaml AND **/*.yml — `gcp/common.yml` and `graphql/spans.yml` use
//   the .yml extension and would be missed by a yaml-only glob.
// - Includes nested deprecated/ subtrees so the generated library still surfaces
//   deprecated attributes (with `#deprecated` markers) for migration tooling.
// - `deprecated:` is a separate property, NOT a stability state. The five formal
//   stability values are development, alpha, beta, release_candidate, stable.
//   `mixed` is not a stability value and is not emitted.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, basename } from "node:path";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const UPSTREAM_MODEL = resolve(REPO_ROOT, ".tools/semconv-upstream/model");
const LIB_DIR = resolve(REPO_ROOT, "lib");

// Pinned upstream release. Bumping this requires checking out the matching tag in
// the submodule, regenerating, and updating package.json#metadata.semconvVersion.
const PINNED_VERSION = "v1.41.0";
const SCHEMA_URL = "https://opentelemetry.io/schemas/1.41.0";

// ---------- file discovery ----------

function walkYamlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkYamlFiles(full));
    } else if (stat.isFile() && (entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
      out.push(full);
    }
  }
  return out;
}

// ---------- YAML → attribute records ----------

const VALID_STABILITY = new Set(["development", "alpha", "beta", "release_candidate", "stable"]);

function readGroups() {
  if (!existsSync(UPSTREAM_MODEL)) {
    throw new Error(
      `upstream model dir missing: ${UPSTREAM_MODEL}\n` +
        `Run: git submodule update --init .tools/semconv-upstream`,
    );
  }
  const files = walkYamlFiles(UPSTREAM_MODEL).sort();
  const groups = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    let doc;
    try {
      doc = parseYaml(text);
    } catch (e) {
      throw new Error(`YAML parse failed in ${relative(REPO_ROOT, file)}: ${e.message}`);
    }
    if (!doc || !Array.isArray(doc.groups)) continue;
    for (const g of doc.groups) {
      groups.push({ ...g, _sourceFile: relative(REPO_ROOT, file) });
    }
  }
  return groups;
}

// Attribute definitions live in groups that declare them inline (no `ref:`).
// `ref:`-only entries reuse a previously-defined attribute with possibly different
// requirement_level — those are *usages*, not definitions, and contribute nothing
// the consumer can't already get from the original.
function indexAttributes(groups) {
  const byId = new Map();
  for (const group of groups) {
    if (!Array.isArray(group.attributes)) continue;
    for (const attr of group.attributes) {
      if (typeof attr.ref === "string") continue;
      if (typeof attr.id !== "string") continue;
      if (byId.has(attr.id)) continue; // first declaration wins; keeps regen deterministic
      byId.set(attr.id, { ...attr, _sourceFile: group._sourceFile });
    }
  }
  return byId;
}

// ---------- non-attribute-group symbol indexing ----------
//
// Per-group-type harvest. Each group type contributes a different identity
// dimension to the output:
//
//   span    → span name string (often the group `id` minus the "span." prefix,
//             OR an `extends` chain if the spec authors leave it implicit).
//             `span_kind` is a stability-relevant property; we surface it alongside.
//   metric  → metric name string (`metric_name:` field), instrument kind
//             (counter / histogram / gauge / updowncounter / observable*), unit.
//             These are the three identifying dimensions of an OTel metric.
//   event   → event name string (`name:` field on the group, NOT the id).
//             Per OTel events spec the name is what instrumentations record.
//   entity  → entity name (`name:` field) + the subset of attribute refs that
//             carry `role: identifying`, which is the unique entity identity.

function partitionGroupsByType(groups) {
  const out = { spans: [], metrics: [], events: [], entities: [] };
  for (const g of groups) {
    if (g.type === "span") out.spans.push(g);
    else if (g.type === "metric") out.metrics.push(g);
    else if (g.type === "event") out.events.push(g);
    else if (g.type === "entity") out.entities.push(g);
  }
  for (const list of Object.values(out)) list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return out;
}

// Strip the conventional prefix from a group id. Upstream uses `span.http.server`,
// `metric.http.server.request.duration`, `entity.service`, etc. The leading
// segment is redundant once we're already inside `OTel.Spans.<Domain>` etc.
function stripGroupPrefix(id, prefixes) {
  for (const p of prefixes) {
    if (id.startsWith(`${p}.`)) return id.slice(p.length + 1);
  }
  return id;
}

function domainOfGroupId(id, prefixes) {
  const tail = stripGroupPrefix(id, prefixes);
  const i = tail.indexOf(".");
  return i === -1 ? tail : tail.slice(0, i);
}

// ---------- domain bucketing ----------

function domainOf(attributeId) {
  // First path segment is the domain. e.g. http.request.method → http,
  // gen_ai.system → gen_ai, k8s.pod.name → k8s. Domain names use snake_case
  // upstream; consumers see them PascalCased on the namespace.
  const i = attributeId.indexOf(".");
  return i === -1 ? attributeId : attributeId.slice(0, i);
}

function pascalCase(s) {
  return s.split(/[._-]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
}

function constNameOf(attributeId, domain) {
  // Strip the leading "<domain>." and PascalCase the rest. Members like
  // `http.request.method` → `RequestMethod`, `db.collection.name` → `CollectionName`.
  const tail = attributeId.startsWith(`${domain}.`) ? attributeId.slice(domain.length + 1) : attributeId;
  return pascalCase(tail);
}

function bucketByDomain(byId) {
  const buckets = new Map();
  for (const [id, attr] of byId) {
    const domain = domainOf(id);
    if (!buckets.has(domain)) buckets.set(domain, []);
    buckets.get(domain).push(attr);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return buckets;
}

// ---------- emission ----------

function escapeDoc(s) {
  // Single-line @doc strings: collapse whitespace, escape backslashes/asterisks/double-quotes.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\*\//g, "*\\/")
    .replace(/\s+/g, " ")
    .trim();
}

function jsdocTopLevel(brief, ...trailers) {
  const lines = [escapeDoc(brief), ...trailers.filter(Boolean).map((t) => `@${t}`)];
  if (lines.length === 1) return `/** ${lines[0]} */`;
  return `/**\n${lines.map((l) => ` * ${l}`).join("\n")}\n */`;
}

function attributeIsTemplate(attr) {
  return typeof attr.type === "string" && attr.type.startsWith("template[");
}

function attributeMembers(attr) {
  if (attr.type && typeof attr.type === "object" && Array.isArray(attr.type.members)) {
    return attr.type.members;
  }
  return null;
}

function emitDomainKeys(domain, attrs) {
  const ns = pascalCase(domain);
  const out = [];
  out.push(`// <auto-generated/>`);
  out.push(`// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`);
  out.push(`// Schema: ${SCHEMA_URL}`);
  out.push(`// Regenerate via: npm run generate`);
  out.push(``);
  out.push(`/** OpenTelemetry "${domain}" attribute keys (string constants matching the upstream YAML). */`);
  out.push(`namespace OTel.Keys.${ns};`);
  out.push(``);
  // Dedupe: a few attributes have id collisions after PascalCase tail extraction
  // (e.g. `feature_flag.provider.name` and `feature_flag.provider_name` both yield
  // `ProviderName`). First-wins keeps regen deterministic; the original id is in the
  // alias value, so consumers can always reach the deduped variant via that.
  const seenAliases = new Set();
  for (const attr of attrs) {
    const aliasName = constNameOf(attr.id, domain);
    if (seenAliases.has(aliasName)) continue;
    seenAliases.add(aliasName);
    out.push(emitKeyAlias(attr, domain, aliasName));
    out.push(``);
  }
  return out.join("\n");
}

function emitDomainEnums(domain, attrs) {
  const ns = pascalCase(domain);
  const enums = attrs.filter((a) => attributeMembers(a));
  if (enums.length === 0) return null;
  const out = [];
  out.push(`// <auto-generated/>`);
  out.push(`// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`);
  out.push(`// Schema: ${SCHEMA_URL}`);
  out.push(`// Regenerate via: npm run generate`);
  out.push(``);
  out.push(`/** OpenTelemetry "${domain}" enum-typed attribute values. */`);
  out.push(`namespace OTel.Enums.${ns};`);
  out.push(``);
  // Dedupe enum names: deprecated underscore aliases (`foo_bar`) and current
  // dot-style ids (`foo.bar`) both pascal-case to the same enum name. First-wins.
  const seenEnums = new Set();
  for (const attr of enums) {
    const enumName = enumNameOf(attr, domain);
    if (seenEnums.has(enumName)) continue;
    seenEnums.add(enumName);
    out.push(emitEnum(attr, domain));
    out.push(``);
  }
  return out.join("\n");
}

function deprecationMessage(deprecated) {
  if (!deprecated) return null;
  if (typeof deprecated === "string") return deprecated;
  // Upstream shape: { reason: renamed|obsoleted|uncategorized, renamed_to?: id, note?: text }.
  // Make the message actionable so the IDE hover tooltip / compiler warning tells the
  // consumer where to migrate to.
  const reason = deprecated.reason ?? "deprecated";
  if (deprecated.renamed_to) return `${reason} → ${deprecated.renamed_to}`;
  if (deprecated.note) return `${reason}: ${deprecated.note.replace(/\s+/g, " ").trim()}`;
  return reason;
}

function emitKeyAlias(attr, domain, aliasName) {
  // Alias to a string literal — works as `valueof string` in @encodedName(...) calls.
  // Property-position deprecation (TypeSpec compiler #deprecated directive) doesn't fire
  // on string-literal aliases used as decorator values in TypeSpec 1.12.0-dev.6, but the
  // JSDoc `@deprecated` tag is rendered as a tooltip / strikethrough by the language
  // server, and the directive is preserved for future TypeSpec releases that may extend
  // value-position deprecation checking.
  const stability = VALID_STABILITY.has(attr.stability) ? attr.stability : null;
  const docLines = [];
  if (attr.brief) docLines.push(escapeDoc(attr.brief));
  if (stability) docLines.push(`@stability ${stability}`);
  if (attributeIsTemplate(attr)) {
    // Template attributes are not full keys — the value is a prefix that the
    // instrumentation completes with a runtime suffix (e.g. an HTTP header name).
    docLines.push("@remarks template attribute (prefix; append <key> at runtime)");
  }
  const depMsg = deprecationMessage(attr.deprecated);
  if (depMsg) docLines.push(`@deprecated ${escapeDoc(depMsg)}`);

  const lines = [];
  if (docLines.length === 1) {
    lines.push(`/** ${docLines[0]} */`);
  } else if (docLines.length > 1) {
    lines.push(`/**`);
    for (const l of docLines) lines.push(` * ${l}`);
    lines.push(` */`);
  }
  if (depMsg) lines.push(`#deprecated "${escapeDoc(depMsg)}"`);
  lines.push(`alias ${aliasName} = "${attr.id}";`);
  return lines.join("\n");
}

function enumNameOf(attr, domain) {
  // `http.request.method` → `HttpRequestMethod`. We re-include the domain in the
  // enum name because OTel.Enums.<Domain> namespaces typically host multiple
  // enums whose naked tail names collide (e.g. `Result` appears in many domains).
  const ns = pascalCase(domain);
  return `${ns}${constNameOf(attr.id, domain)}`;
}

function emitEnum(attr, domain) {
  const enumName = enumNameOf(attr, domain);
  const lines = [];
  const docLines = [];
  if (attr.brief) docLines.push(escapeDoc(attr.brief));
  const depMsg = deprecationMessage(attr.deprecated);
  if (depMsg) docLines.push(`@deprecated ${escapeDoc(depMsg)}`);
  if (docLines.length === 1) lines.push(`/** ${docLines[0]} */`);
  else if (docLines.length > 1) {
    lines.push(`/**`);
    for (const l of docLines) lines.push(` * ${l}`);
    lines.push(` */`);
  }
  if (depMsg) lines.push(`#deprecated "${escapeDoc(depMsg)}"`);
  lines.push(`enum ${enumName} {`);
  const members = attributeMembers(attr) ?? [];
  // Dedupe member names: when the same enum carries both a `foo.bar` (current)
  // and a `foo_bar` (deprecated alias) member, both yield `FooBar` after
  // PascalCase. First-wins, since upstream lists current variants first.
  const seenMembers = new Set();
  for (const m of members) {
    const memberName = pascalCase(String(m.id));
    if (seenMembers.has(memberName)) continue;
    seenMembers.add(memberName);
    const memberDoc = [];
    if (m.brief) memberDoc.push(escapeDoc(m.brief));
    const memberDep = deprecationMessage(m.deprecated);
    if (memberDep) memberDoc.push(`@deprecated ${escapeDoc(memberDep)}`);
    if (memberDoc.length === 1) lines.push(`  /** ${memberDoc[0]} */`);
    else if (memberDoc.length > 1) {
      lines.push(`  /**`);
      for (const l of memberDoc) lines.push(`   * ${l}`);
      lines.push(`   */`);
    }
    if (memberDep) lines.push(`  #deprecated "${escapeDoc(memberDep)}"`);
    const value = String(m.value ?? m.id);
    lines.push(`  ${memberName}: "${value.replace(/"/g, '\\"')}",`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

// ---------- main.tsp + _schema.tsp ----------

function emitMain(domains, sets) {
  const lines = [];
  lines.push(`// <auto-generated/>`);
  lines.push(`// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`);
  lines.push(`// Regenerate via: npm run generate`);
  lines.push(``);
  lines.push(`import "./_schema.tsp";`);
  for (const d of [...domains].sort()) {
    if (sets.domainsWithKeys.has(d)) lines.push(`import "./${d}.tsp";`);
    if (sets.domainsWithEnums.has(d)) lines.push(`import "./${d}.enums.tsp";`);
    if (sets.domainsWithSpans.has(d)) lines.push(`import "./${d}.spans.tsp";`);
    if (sets.domainsWithMetrics.has(d)) lines.push(`import "./${d}.metrics.tsp";`);
    if (sets.domainsWithEvents.has(d)) lines.push(`import "./${d}.events.tsp";`);
    if (sets.domainsWithEntities.has(d)) lines.push(`import "./${d}.entities.tsp";`);
  }
  lines.push(``);
  return lines.join("\n");
}

function emitSchema() {
  return [
    `// <auto-generated/>`,
    `// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`,
    ``,
    `/** OpenTelemetry schema URL aliases for the pinned upstream release. */`,
    `namespace OTel.Schemas;`,
    ``,
    `/** Schema URL for the upstream release this library was generated against. */`,
    `alias Current = "${SCHEMA_URL}";`,
    ``,
    `/** Schema URL for ${PINNED_VERSION}. */`,
    `alias ${pascalCase("v" + PINNED_VERSION.replace(/^v/, ""))} = "${SCHEMA_URL}";`,
    ``,
  ].join("\n");
}

// ---------- entry ----------

// ---------- span / metric / event / entity emission ----------

function bucketGroupsByDomain(groups, prefixes) {
  const buckets = new Map();
  for (const g of groups) {
    if (typeof g.id !== "string") continue;
    const domain = domainOfGroupId(g.id, prefixes);
    if (!buckets.has(domain)) buckets.set(domain, []);
    buckets.get(domain).push(g);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return buckets;
}

function emitGroupCommonHeader(kind, domain) {
  const ns = pascalCase(domain);
  return [
    `// <auto-generated/>`,
    `// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`,
    `// Schema: ${SCHEMA_URL}`,
    `// Regenerate via: npm run generate`,
    ``,
    `/** OpenTelemetry "${domain}" ${kind}. */`,
    `namespace OTel.${pascalCase(kind)}.${ns};`,
    ``,
  ].join("\n");
}

function jsdocBlock(briefAndTrailers) {
  const filtered = briefAndTrailers.filter(Boolean);
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return `/** ${filtered[0]} */\n`;
  return `/**\n${filtered.map((l) => ` * ${l}`).join("\n")}\n */\n`;
}

function emitDomainSpans(domain, spans) {
  if (spans.length === 0) return null;
  const out = [emitGroupCommonHeader("Spans", domain)];
  const seen = new Set();
  for (const s of spans) {
    const tail = stripGroupPrefix(s.id, ["span"]);
    const tailWithoutDomain = tail.startsWith(`${domain}.`) ? tail.slice(domain.length + 1) : tail;
    const name = pascalCase(tailWithoutDomain || tail);
    if (seen.has(name)) continue;
    seen.add(name);
    const stability = VALID_STABILITY.has(s.stability) ? s.stability : null;
    const briefLine = s.brief ? escapeDoc(s.brief) : null;
    const trailers = [
      stability ? `@stability ${stability}` : null,
      s.span_kind ? `@spanKind ${s.span_kind}` : null,
    ];
    out.push(jsdocBlock([briefLine, ...trailers]) + `alias ${name}Span = "${tail}";`);
    out.push(``);
  }
  return out.join("\n");
}

function emitDomainMetrics(domain, metrics) {
  if (metrics.length === 0) return null;
  const out = [emitGroupCommonHeader("Metrics", domain)];
  const seen = new Set();
  for (const m of metrics) {
    if (typeof m.metric_name !== "string") continue;
    const tail = m.metric_name.startsWith(`${domain}.`)
      ? m.metric_name.slice(domain.length + 1)
      : m.metric_name;
    const baseName = pascalCase(tail);
    if (seen.has(baseName)) continue;
    seen.add(baseName);
    const stability = VALID_STABILITY.has(m.stability) ? m.stability : null;
    const briefLine = m.brief ? escapeDoc(m.brief) : null;
    const trailers = [
      stability ? `@stability ${stability}` : null,
      m.instrument ? `@instrument ${m.instrument}` : null,
      m.unit ? `@unit ${m.unit}` : null,
    ];
    out.push(jsdocBlock([briefLine, ...trailers]) + `alias ${baseName}Name = "${m.metric_name}";`);
    if (m.unit) out.push(`alias ${baseName}Unit = "${m.unit.replace(/"/g, '\\"')}";`);
    if (m.instrument) out.push(`alias ${baseName}Instrument = "${m.instrument}";`);
    out.push(``);
  }
  return out.join("\n");
}

function emitDomainEvents(domain, events) {
  if (events.length === 0) return null;
  const out = [emitGroupCommonHeader("Events", domain)];
  const seen = new Set();
  for (const e of events) {
    const eventName = typeof e.name === "string" && e.name.length > 0 ? e.name : stripGroupPrefix(e.id, ["event"]);
    const tail = eventName.startsWith(`${domain}.`) ? eventName.slice(domain.length + 1) : eventName;
    const symbolName = pascalCase(tail) || pascalCase(eventName);
    if (seen.has(symbolName)) continue;
    seen.add(symbolName);
    const stability = VALID_STABILITY.has(e.stability) ? e.stability : null;
    const briefLine = e.brief ? escapeDoc(e.brief) : null;
    const trailers = [stability ? `@stability ${stability}` : null];
    out.push(jsdocBlock([briefLine, ...trailers]) + `alias ${symbolName}Event = "${eventName}";`);
    out.push(``);
  }
  return out.join("\n");
}

function emitDomainEntities(domain, entities) {
  if (entities.length === 0) return null;
  const out = [emitGroupCommonHeader("Entities", domain)];
  const seen = new Set();
  for (const e of entities) {
    const entityName = typeof e.name === "string" && e.name.length > 0 ? e.name : stripGroupPrefix(e.id, ["entity"]);
    const symbolName = pascalCase(entityName);
    if (seen.has(symbolName)) continue;
    seen.add(symbolName);
    const stability = VALID_STABILITY.has(e.stability) ? e.stability : null;
    const briefLine = e.brief ? escapeDoc(e.brief) : null;
    const identifyingRefs = (e.attributes ?? [])
      .filter((a) => a.role === "identifying" && typeof a.ref === "string")
      .map((a) => a.ref);
    const trailers = [
      stability ? `@stability ${stability}` : null,
      identifyingRefs.length > 0 ? `@identifying ${identifyingRefs.join(", ")}` : null,
    ];
    out.push(jsdocBlock([briefLine, ...trailers]) + `alias ${symbolName}Entity = "${entityName}";`);
    out.push(``);
  }
  return out.join("\n");
}

// ---------- entry ----------

function emitDeprecationLookup(byId) {
  // Sidecar JS module the linter rule consumes at runtime to map an OTel
  // attribute id (e.g. "http.client_ip") to its replacement id (e.g.
  // "client.address") or null if upstream has no documented renamed_to.
  // Generated alongside the .tsp library so the lookup is byte-stable per
  // semconv release; the rule itself stays free of file I/O.
  const SRC_DIR = resolve(REPO_ROOT, "src/generated");
  const entries = [];
  for (const [id, attr] of [...byId.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!attr.deprecated) continue;
    let replacement = null;
    if (typeof attr.deprecated === "object") {
      if (typeof attr.deprecated.renamed_to === "string") replacement = attr.deprecated.renamed_to;
    }
    const reason =
      typeof attr.deprecated === "string"
        ? attr.deprecated
        : (attr.deprecated.reason ?? "deprecated");
    entries.push({ id, replacement, reason });
  }
  const lines = [
    `// <auto-generated/>`,
    `// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`,
    `// Regenerate via: npm run generate`,
    ``,
    `/** Deprecation entry for an OTel attribute id at the pinned upstream release. */`,
    `export interface DeprecationEntry {`,
    `  /** The deprecated attribute id (e.g. "http.client_ip"). */`,
    `  readonly id: string;`,
    `  /** Replacement attribute id when upstream documents a rename, otherwise null. */`,
    `  readonly replacement: string | null;`,
    `  /** Upstream-declared reason: "renamed", "obsoleted", or "uncategorized" / free text. */`,
    `  readonly reason: string;`,
    `}`,
    ``,
    `/**`,
    ` * Lookup table from OTel attribute id → its deprecation entry. Keyed by the literal`,
    ` * id strings so a linter rule can query directly with the resolved decorator value.`,
    ` */`,
    `export const DEPRECATED_KEYS: ReadonlyMap<string, DeprecationEntry> = new Map([`,
    ...entries.map((e) =>
      `  [${JSON.stringify(e.id)}, { id: ${JSON.stringify(e.id)}, replacement: ${JSON.stringify(e.replacement)}, reason: ${JSON.stringify(e.reason)} }],`
    ),
    `]);`,
    ``,
  ];
  writeFileSync(resolve(SRC_DIR, "deprecated-keys.ts"), lines.join("\n"), "utf8");
  return entries.length;
}

function main() {
  const groups = readGroups();
  const byId = indexAttributes(groups);
  const buckets = bucketByDomain(byId);
  const partitioned = partitionGroupsByType(groups);

  const spansByDomain = bucketGroupsByDomain(partitioned.spans, ["span"]);
  const metricsByDomain = bucketGroupsByDomain(partitioned.metrics, ["metric"]);
  const eventsByDomain = bucketGroupsByDomain(partitioned.events, ["event"]);
  const entitiesByDomain = bucketGroupsByDomain(partitioned.entities, ["entity"]);

  let keysWritten = 0;
  let enumsWritten = 0;
  const domainsWithEnums = new Set();
  const domainsWithSpans = new Set();
  const domainsWithMetrics = new Set();
  const domainsWithEvents = new Set();
  const domainsWithEntities = new Set();

  // Union of every domain that contributed at least one symbol — drives main.tsp imports.
  const allDomains = new Set([
    ...buckets.keys(),
    ...spansByDomain.keys(),
    ...metricsByDomain.keys(),
    ...eventsByDomain.keys(),
    ...entitiesByDomain.keys(),
  ]);

  for (const domain of [...allDomains].sort()) {
    const attrs = buckets.get(domain) ?? [];
    if (attrs.length > 0) {
      writeFileSync(resolve(LIB_DIR, `${domain}.tsp`), emitDomainKeys(domain, attrs), "utf8");
      keysWritten++;
      const enumsContent = emitDomainEnums(domain, attrs);
      if (enumsContent) {
        writeFileSync(resolve(LIB_DIR, `${domain}.enums.tsp`), enumsContent, "utf8");
        enumsWritten++;
        domainsWithEnums.add(domain);
      }
    }
    const spansContent = emitDomainSpans(domain, spansByDomain.get(domain) ?? []);
    if (spansContent) {
      writeFileSync(resolve(LIB_DIR, `${domain}.spans.tsp`), spansContent, "utf8");
      domainsWithSpans.add(domain);
    }
    const metricsContent = emitDomainMetrics(domain, metricsByDomain.get(domain) ?? []);
    if (metricsContent) {
      writeFileSync(resolve(LIB_DIR, `${domain}.metrics.tsp`), metricsContent, "utf8");
      domainsWithMetrics.add(domain);
    }
    const eventsContent = emitDomainEvents(domain, eventsByDomain.get(domain) ?? []);
    if (eventsContent) {
      writeFileSync(resolve(LIB_DIR, `${domain}.events.tsp`), eventsContent, "utf8");
      domainsWithEvents.add(domain);
    }
    const entitiesContent = emitDomainEntities(domain, entitiesByDomain.get(domain) ?? []);
    if (entitiesContent) {
      writeFileSync(resolve(LIB_DIR, `${domain}.entities.tsp`), entitiesContent, "utf8");
      domainsWithEntities.add(domain);
    }
  }

  const deprecatedCount = emitDeprecationLookup(byId);

  writeFileSync(resolve(LIB_DIR, "_schema.tsp"), emitSchema(), "utf8");
  writeFileSync(
    resolve(LIB_DIR, "main.tsp"),
    emitMain([...allDomains], { domainsWithEnums, domainsWithSpans, domainsWithMetrics, domainsWithEvents, domainsWithEntities, domainsWithKeys: new Set(buckets.keys()) }),
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      `${PINNED_VERSION}: ${groups.length} groups, ${byId.size} attributes,`,
      `${partitioned.spans.length} spans, ${partitioned.metrics.length} metrics,`,
      `${partitioned.events.length} events, ${partitioned.entities.length} entities`,
    ].join(" ") +
      ` →` +
      [
        ` keys=${keysWritten}`,
        ` enums=${enumsWritten}`,
        ` spans=${domainsWithSpans.size}`,
        ` metrics=${domainsWithMetrics.size}`,
        ` events=${domainsWithEvents.size}`,
        ` entities=${domainsWithEntities.size}`,
        ` deprecated-keys=${deprecatedCount}`,
      ].join(""),
  );
}

main();
