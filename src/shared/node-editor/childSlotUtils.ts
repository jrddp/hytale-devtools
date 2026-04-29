import type { NodeChildSchema, NodePin, NodeTemplate } from "./workspaceTypes";

export type ResolvedChildPin = {
  side: "input" | "output";
  pin: NodePin;
};

export type ResolvedChildSlot = {
  childSchema: NodeChildSchema;
  pin: NodePin;
  side: "input" | "output";
};

export function resolveChildPin(
  template: Pick<NodeTemplate, "inputPins" | "outputPins">,
  schemaKey: string,
): ResolvedChildPin | undefined {
  const outputPin = template.outputPins.find(pin => pin.schemaKey === schemaKey);
  if (outputPin) {
    return {
      side: "output",
      pin: outputPin,
    };
  }

  const inputPin = template.inputPins.find(pin => pin.schemaKey === schemaKey);
  if (inputPin) {
    return {
      side: "input",
      pin: inputPin,
    };
  }

  return undefined;
}

export function getResolvedChildSlots(
  template: Pick<NodeTemplate, "childSchemas" | "inputPins" | "outputPins">,
): ResolvedChildSlot[] {
  const resolvedSlots: ResolvedChildSlot[] = [];

  for (const childSchema of Object.values(template.childSchemas)) {
    const resolvedChildPin = resolveChildPin(template, childSchema.schemaKey);
    if (!resolvedChildPin) {
      continue;
    }

    resolvedSlots.push({
      childSchema,
      pin: resolvedChildPin.pin,
      side: resolvedChildPin.side,
    });
  }

  return resolvedSlots;
}
