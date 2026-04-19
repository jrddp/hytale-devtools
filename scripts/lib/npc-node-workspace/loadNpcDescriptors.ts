import { readFileSync } from "node:fs";
import type {
  NpcDescriptor,
  NpcDescriptorDocument,
} from "../../../src/shared/npc-role-editor/descriptorTypes";
import { isNpcBehaviorSupportedDescriptorCategory } from "../../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import {
  findDescriptorOrThrow,
  getNpcNodeWorkspacePaths,
  type SupportedDescriptorCategory,
} from "./npcNodeWorkspaceModel";

export function parseNpcDescriptors(rootDir = process.cwd()): NpcDescriptorDocument {
  const { descriptorsPath } = getNpcNodeWorkspacePaths(rootDir);
  return JSON.parse(readFileSync(descriptorsPath, "utf8")) as NpcDescriptorDocument;
}

export function getSupportedNpcBehaviorDescriptors(
  descriptors: NpcDescriptorDocument,
): Array<NpcDescriptor & { Category: SupportedDescriptorCategory }> {
  return descriptors.filter(
    (descriptor): descriptor is NpcDescriptor & { Category: SupportedDescriptorCategory } =>
      isNpcBehaviorSupportedDescriptorCategory(descriptor.Category),
  );
}

export function getInstructionDescriptors(descriptors: NpcDescriptorDocument): NpcDescriptor[] {
  return [
    findDescriptorOrThrow(descriptors, "Instruction", "Instruction"),
    findDescriptorOrThrow(descriptors, "Instruction", "Random"),
    findDescriptorOrThrow(descriptors, "Instruction", "Reference"),
  ];
}
