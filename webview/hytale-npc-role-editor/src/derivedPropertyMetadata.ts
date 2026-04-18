import type { NpcDescriptorDocument } from "@shared/npc-role-editor/descriptorTypes";
import { applyNpcPropertySectionDerivedState } from "./buildPropertyState";
import { buildParameterUsageIndex, type ParameterUsageIndex } from "./compute/parameterUsageIndex";
import type { NpcRoleJson } from "./parsing/documentTypes";
import { serializeNpcDocument } from "./parsing/serializeNpcDocument";
import type { NpcPropertySection } from "./propertyTypes";
import { discoverNpcMainStates } from "./states/discoverStates";

export function applyNpcDerivedPropertyMetadata({
  sections,
  document,
  topLevelKeyOrder,
  descriptors,
}: {
  sections: NpcPropertySection[];
  document: NpcRoleJson;
  topLevelKeyOrder: string[];
  descriptors: NpcDescriptorDocument;
}): {
  parameterUsageIndex: ParameterUsageIndex;
  discoveredStates: string[];
} {
  const serializedDocument = serializeNpcDocument(document, topLevelKeyOrder);
  const parameterUsageIndex = buildParameterUsageIndex(serializedDocument);
  const discoveredStates = discoverNpcMainStates(serializedDocument);

  applyNpcPropertySectionDerivedState(
    sections,
    parameterUsageIndex,
    discoveredStates,
    descriptors,
  );

  return {
    parameterUsageIndex,
    discoveredStates,
  };
}
