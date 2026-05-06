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

function emitMain(domains, domainsWithEnums) {
  const lines = [];
  lines.push(`// <auto-generated/>`);
  lines.push(`// Source: open-telemetry/semantic-conventions @ ${PINNED_VERSION}`);
  lines.push(`// Regenerate via: npm run generate`);
  lines.push(``);
  lines.push(`import "./_schema.tsp";`);
  for (const d of [...domains].sort()) {
    lines.push(`import "./${d}.tsp";`);
    if (domainsWithEnums.has(d)) lines.push(`import "./${d}.enums.tsp";`);
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

function main() {
  const groups = readGroups();
  const byId = indexAttributes(groups);
  const buckets = bucketByDomain(byId);

  let keysWritten = 0;
  let enumsWritten = 0;
  const domainsWithEnums = new Set();
  for (const [domain, attrs] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(resolve(LIB_DIR, `${domain}.tsp`), emitDomainKeys(domain, attrs), "utf8");
    keysWritten++;
    const enumsContent = emitDomainEnums(domain, attrs);
    if (enumsContent) {
      writeFileSync(resolve(LIB_DIR, `${domain}.enums.tsp`), enumsContent, "utf8");
      enumsWritten++;
      domainsWithEnums.add(domain);
    }
  }

  writeFileSync(resolve(LIB_DIR, "_schema.tsp"), emitSchema(), "utf8");
  writeFileSync(resolve(LIB_DIR, "main.tsp"), emitMain([...buckets.keys()], domainsWithEnums), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `generated ${keysWritten} key file(s) + ${enumsWritten} enum file(s) + main.tsp + _schema.tsp from ${groups.length} groups, ${byId.size} attributes (${PINNED_VERSION}).`,
  );
}

main();
