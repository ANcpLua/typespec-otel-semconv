// Per-rule unit tests for no-deprecated-otel-key. Three message ids with
// distinct codefix behavior — `renamed` ships a migration codefix, `obsoleted`
// ships none. Both paths get explicit coverage here.

import { createLinterRuleTester, type LinterRuleTester } from "@typespec/compiler/testing";
import { beforeEach, describe, it } from "vitest";
import { noDeprecatedOtelKeyRule } from "../../src/rules/no-deprecated-otel-key.rule";
import { Tester } from "../tester";

describe("no-deprecated-otel-key (in-process)", () => {
  let tester: LinterRuleTester;

  beforeEach(async () => {
    const runner = await Tester.createInstance();
    tester = createLinterRuleTester(runner, noDeprecatedOtelKeyRule, "@ancplua/typespec-otel-semconv");
  });

  it("fires `renamed` for upstream renamed_to entries (raw string)", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", "http.client_ip")
          ip: string;
        }
      `)
      .toEmitDiagnostics({
        code: "@ancplua/typespec-otel-semconv/no-deprecated-otel-key",
        message: /renamed/,
      });
  });

  it("fires `obsoleted` for upstream obsoleted entries with no replacement (alias)", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", OTel.Keys.Http.Flavor)
          flavor: string;
        }
      `)
      .toEmitDiagnostics({
        code: "@ancplua/typespec-otel-semconv/no-deprecated-otel-key",
        message: /obsoleted|no documented replacement/,
      });
  });

  it("is silent on a non-deprecated key", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", OTel.Keys.Http.RequestMethod)
          method: string;
        }
      `)
      .toBeValid();
  });

  it("codefix on `renamed` migrates the call site to OTel.Keys.Client.Address", async () => {
    await tester
      .expect(`
        model R {
          @encodedName("application/json", "http.client_ip")
          ip: string;
        }
      `)
      .applyCodeFix("migrate-to-renamed-target")
      .toEqual(`
        model R {
          @encodedName("application/json", OTel.Keys.Client.Address)
          ip: string;
        }
      `);
  });
});
