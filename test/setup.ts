// Shared test helpers — wraps `tsp compile` so each test gets the diagnostics
// + emitter outputs for a given .tsp entry. Equivalent in spirit to upstream
// TypeSpec's Tester harness, but enough for a small library.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CompileResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function tspCompile(
  entry: string,
  args: string[] = [],
  cwd = process.cwd(),
): Promise<CompileResult> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsp", "compile", entry, ...args], { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.stderr.on("data", (b) => (stderr += b.toString()));
    proc.on("close", (exitCode) => resolve({ exitCode: exitCode ?? -1, stdout, stderr }));
  });
}

/** Create a fresh tmp dir that the caller can use as `--output-dir`. */
export function freshOutputDir(): string {
  return mkdtempSync(join(tmpdir(), "tsp-otel-semconv-"));
}

/** Read a file from disk and normalize CRLF→LF so snapshots are platform-stable. */
export function readNormalized(path: string): string {
  if (!existsSync(path)) throw new Error(`expected file missing: ${path}`);
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
