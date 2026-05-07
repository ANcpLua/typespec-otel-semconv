import {
  createRule,
  type Model,
} from "@typespec/compiler";
import { METRIC_TRIPLETS } from "../generated/metric-triplets.js";
import { getEncodedNameStringArg, getStringDefaultValue } from "./_shared.js";

function collectStringValuesOnModel(model: Model): Set<string> {
  const found = new Set<string>();
  for (const [, prop] of model.properties) {
    for (const app of prop.decorators) {
      const v = getEncodedNameStringArg(app);
      if (v) found.add(v.value);
    }
    const dv = getStringDefaultValue(prop);
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
          if (values.has(triplet.unit) && values.has(triplet.instrument)) continue;
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
