// Per-rule unit tests via createLinterRuleTester — exercises codefix
// application, which the CLI-based suite cannot reach because `tsp compile`
// never applies fixes. Mirrors the pattern in
// @typespec/best-practices/test/rules/casing.rule.test.ts.

import { createLinterRuleTester, type LinterRuleTester } from "@typespec/compiler/testing";
import { beforeEach, describe, it } from "vitest";
import { preferOtelKeyRule } from "../../src/rules/prefer-otel-key.rule";
import { Tester } from "../tester";

describe("prefer-otel-key (in-process)", () => {
  let tester: LinterRuleTester;

  beforeEach(async () => {
    const runner = await Tester.createInstance();
    tester = createLinterRuleTester(runner, preferOtelKeyRule, "@ancplua/typespec-otel-semconv");
  });

  it("emits a diagnostic for a raw OTel-shaped string", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", "http.request.method")
          method: string;
        }
      `)
      .toEmitDiagnostics({
        code: "@ancplua/typespec-otel-semconv/prefer-otel-key",
      });
  });

  it("is silent on a typed alias reference", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", OTel.Keys.Http.RequestMethod)
          method: string;
        }
      `)
      .toBeValid();
  });

  it("is silent on a non-OTel-shaped string", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", "schema_url")
          url: string;
        }
      `)
      .toBeValid();
  });

  it("codefix replaces the raw string with the typed symbol", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", "http.request.method")
          method: string;
        }
      `)
      .applyCodeFix("replace-with-typed-symbol")
      .toEqual(`
        model R {
          @encodedName("application/json", OTel.Keys.Http.RequestMethod)
          method: string;
        }
      `);
  });
});
