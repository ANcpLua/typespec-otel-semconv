import type { DecoratorContext, Model } from "@typespec/compiler";
import { $lib } from "./lib.js";

const otelEntityKey = $lib.createStateSymbol("otelEntity");

export function $otelEntity(context: DecoratorContext, target: Model, name: string): void {
  context.program.stateMap(otelEntityKey).set(target, name);
}

export function getOtelEntityName(program: { stateMap: (k: symbol) => Map<unknown, unknown> }, target: Model): string | undefined {
  return program.stateMap(otelEntityKey).get(target) as string | undefined;
}

export function listOtelEntities(program: { stateMap: (k: symbol) => Map<unknown, unknown> }): Iterable<[Model, string]> {
  return program.stateMap(otelEntityKey).entries() as Iterable<[Model, string]>;
}
