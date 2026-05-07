import {
  createRule,
  type DecoratorApplication,
  type DiagnosticTarget,
  type Model,
  type ModelProperty,
  type StringValue,
} from "@typespec/compiler";
import { METRIC_TRIPLETS } from "../generated/metric-triplets.js";

function getEncodedNameValue(app: DecoratorApplication): { value: string; target: DiagnosticTarget } | null {
  if (app.decorator.name !== "@encodedName" && app.definition?.name !== "@encodedName") return null;
  const arg = app.args[1];
  if (!arg) return null;
  const v = arg.value;
  if (typeof v !== "object" || v === null) return null;
  if ((v as StringValue).valueKind !== "StringValue") return null;
  return { value: (v as StringValue).value, target: arg.node as DiagnosticTarget };
}

function getDefaultValue(prop: ModelProperty): string | null {
  const d = prop.defaultValue;
  if (!d || typeof d !== "object") return null;
  if ((d as StringValue).valueKind !== "StringValue") return null;
  return (d as StringValue).value;
}

function collectStringValuesOnModel(model: Model): Set<string> {
  const found = new Set<string>();
  for (const [, prop] of model.properties) {
    for (const app of prop.decorators) {
      const v = getEncodedNameValue(app);
      if (v) found.add(v.value);
    }
    const dv = getDefaultValue(prop);
    if (dv !== null) found.add(dv);
  }
  return found;
}

export const metricTripletBoundRule = createRule({
  name: "metric-triplet-bound",
  severity: "warning",
  description:
    "When a model references an OTel metric Name, also reference the matching Unit and Instrument. The triplet (name, unit, instrument) is upstream's identity for a metric.",
  messages: {
    default:
      "Metric Name referenced without its (Unit, Instrument) siblings — bind all three on the same model so the recorded metric identity stays whole.",
  },
  create(context) {
    return {
      model: (model: Model) => {
        const values = collectStringValuesOnModel(model);
        for (const v of values) {
          const triplet = METRIC_TRIPLETS.get(v);
          if (!triplet) continue;
          const hasUnit = values.has(triplet.unit);
          const hasInstrument = values.has(triplet.instrument);
          if (hasUnit && hasInstrument) continue;
          // Diagnostic target: the model declaration itself, since the rule is
          // a coupling check across multiple properties — pinning to a single
          // call site would be misleading.
          context.reportDiagnostic({
            target: model,
            format: { metric: v, unit: triplet.unit, instrument: triplet.instrument },
          });
        }
      },
    };
  },
});
