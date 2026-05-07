// Shared TypeSpec tester wired with @typespec/http (for @encodedName) and the
// library itself. Per-rule unit tests use this to compile in-process — same
// runner the upstream rules tests use, far faster than spawning `tsp compile`.

import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";

export const Tester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: ["@typespec/http", "@ancplua/typespec-otel-semconv"],
})
  .importLibraries()
  .using("Http");
