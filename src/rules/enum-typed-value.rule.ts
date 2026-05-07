import {
  createRule,
  type ModelProperty,
} from "@typespec/compiler";
import { ENUM_KEYED_ATTRS } from "../generated/enum-keyed-attrs.js";
import { getEncodedNameStringArg } from "./_shared.js";

function isPlainStringScalar(prop: ModelProperty): boolean {
  // Property type is a Scalar that bottoms out at string; library-emitted
  // enums are kind="Enum", so they fail this check and pass the rule.
  const t = prop.type;
  if (t.kind !== "Scalar") return false;
  type ScalarLike = { name?: string; baseScalar?: ScalarLike | undefined };
  let cursor: ScalarLike | undefined = t as unknown as ScalarLike;
  while (cursor) {
    if (cursor.name === "string") return true;
    cursor = cursor.baseScalar;
  }
  return false;
}

export const enumTypedValueRule = createRule({
  name: "enum-typed-value",
  severity: "warning",
  description:
    "When a property's @encodedName resolves to an OTel attribute that has a typed enum counterpart, the property type should be the enum, not bare string.",
  messages: {
    default:
      "Property carrying an OTel attribute with a typed enum counterpart is typed plain string — use the enum so the consumer cannot record a value outside the upstream member set.",
  },
  create(context) {
    return {
      modelProperty: (prop) => {
        if (!isPlainStringScalar(prop)) return;
        for (const app of prop.decorators) {
          const v = getEncodedNameStringArg(app);
          if (!v) continue;
          const enumPath = ENUM_KEYED_ATTRS.get(v.value);
          if (!enumPath) continue;
          context.reportDiagnostic({
            target: prop,
            format: { attr: v.value, enum: enumPath },
          });
        }
      },
    };
  },
});
