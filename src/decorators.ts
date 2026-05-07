import type { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { $lib } from "./lib.js";

const [getOtelEntityName, setOtelEntityName, getOtelEntityMap] = useStateMap<Model, string>(
  $lib.createStateSymbol("otelEntity"),
);

export function $otelEntity(context: DecoratorContext, target: Model, name: string): void {
  setOtelEntityName(context.program, target, name);
}

export { getOtelEntityName };

export function listOtelEntities(program: Program): Iterable<[Model, string]> {
  return getOtelEntityMap(program);
}
