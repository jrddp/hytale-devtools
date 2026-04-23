import { getResolvedChildSlots, type ResolvedChildSlot } from "./childSlotUtils";
import type { NodeTemplate } from "./workspaceTypes";

export function getSiblingSerializedChildSlot(
  template: Pick<NodeTemplate, "childSchemas" | "inputPins" | "outputPins" | "templateId">,
): ResolvedChildSlot | undefined {
  const resolvedSlots = getResolvedChildSlots(template);
  const siblingSlots = resolvedSlots.filter(
    slot => slot.childSchema.serializationType === "sibling",
  );
  if (siblingSlots.length === 0) {
    return undefined;
  }

  if (siblingSlots.length > 1) {
    throw new Error(
      `Template ${template.templateId} defines multiple sibling-serialized child slots.`,
    );
  }

  if (resolvedSlots.length > 1) {
    throw new Error(
      `Template ${template.templateId} mixes sibling-serialized child slots with other child slots.`,
    );
  }

  const siblingSlot = siblingSlots[0];
  if (siblingSlot.pin.multiplicity !== "single") {
    throw new Error(
      `Template ${template.templateId} uses sibling serialization on a non-single child slot.`,
    );
  }

  return siblingSlot;
}
