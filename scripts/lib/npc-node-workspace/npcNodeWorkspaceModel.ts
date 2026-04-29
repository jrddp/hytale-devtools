import path from "node:path";
import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "../../../src/shared/npc-role-editor/descriptorTypes";
import {
  type NpcBehaviorConnectionType,
  getNpcBehaviorCategoryColor,
} from "../../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import type { NodeSlotOccupancy } from "../../../src/shared/node-editor/workspaceTypes";
import type { NodeEditorWorkspaceDefinition, NodeTemplateDefinition } from "../../../src/node-editor/workspaceDefinitionTypes";

export const WORKSPACE_NAME = "NPC Behavior";
export const WORKSPACE_DIRECTORY = "NPCBehavior";

export function getNpcNodeWorkspacePaths(rootDir = process.cwd()) {
  return {
    rootDir,
    descriptorsPath: path.join(rootDir, "default-data", "export-data", "npc_descriptors.json"),
    outputRootPath: path.join(
      rootDir,
      "default-data",
      "node-editor-workspace-definitions",
      WORKSPACE_DIRECTORY,
    ),
  };
}

export const VARIANT_BACKED_DESCRIPTOR_CATEGORIES = [
  "Action",
  "BodyMotion",
  "HeadMotion",
  "IEntityFilter",
  "ISensorEntityCollector",
  "ISensorEntityPrioritiser",
  "Sensor",
] as const;
export type VariantBackedDescriptorCategory =
  (typeof VARIANT_BACKED_DESCRIPTOR_CATEGORIES)[number];

export const DIRECT_TEMPLATE_DESCRIPTOR_CATEGORIES = [
  "Path",
  "RelativeWaypointDefinition",
  "ValueToParameterMapping",
  "WeightedAction",
] as const;
export type DirectTemplateDescriptorCategory =
  (typeof DIRECT_TEMPLATE_DESCRIPTOR_CATEGORIES)[number];

export type SupportedDescriptorCategory =
  | VariantBackedDescriptorCategory
  | DirectTemplateDescriptorCategory;

export const CATEGORY_COLORS: Record<SupportedDescriptorCategory | "Structural", string> = {
  Action: getNpcBehaviorCategoryColor("Action"),
  BodyMotion: getNpcBehaviorCategoryColor("BodyMotion"),
  HeadMotion: getNpcBehaviorCategoryColor("HeadMotion"),
  IEntityFilter: getNpcBehaviorCategoryColor("IEntityFilter"),
  ISensorEntityCollector: getNpcBehaviorCategoryColor("ISensorEntityCollector"),
  ISensorEntityPrioritiser: getNpcBehaviorCategoryColor("ISensorEntityPrioritiser"),
  Path: getNpcBehaviorCategoryColor("Path"),
  RelativeWaypointDefinition: getNpcBehaviorCategoryColor("RelativeWaypointDefinition"),
  Sensor: getNpcBehaviorCategoryColor("Sensor"),
  Structural: getNpcBehaviorCategoryColor("Structural"),
  ValueToParameterMapping: getNpcBehaviorCategoryColor("ValueToParameterMapping"),
  WeightedAction: getNpcBehaviorCategoryColor("WeightedAction"),
};

export const CATEGORY_DIRECTORY_NAMES: Record<SupportedDescriptorCategory | "Structural", string> = {
  Action: "Actions",
  BodyMotion: "Motions",
  HeadMotion: "Motions",
  IEntityFilter: "Filters",
  ISensorEntityCollector: "Collectors",
  ISensorEntityPrioritiser: "Prioritisers",
  Path: "Paths",
  RelativeWaypointDefinition: "Paths",
  Sensor: "Sensors",
  Structural: "Structural",
  ValueToParameterMapping: "Mappings",
  WeightedAction: "Actions",
};

export const NODE_CATEGORY_NAMES: Record<SupportedDescriptorCategory | "Structural", string> = {
  Action: "Actions",
  BodyMotion: "Body Motion",
  HeadMotion: "Head Motion",
  IEntityFilter: "Filters",
  ISensorEntityCollector: "Collectors",
  ISensorEntityPrioritiser: "Prioritisers",
  Path: "Paths",
  RelativeWaypointDefinition: "Paths",
  Sensor: "Sensors",
  Structural: "Structural",
  ValueToParameterMapping: "Mappings",
  WeightedAction: "Actions",
};

export const TITLE_PREFIX_BY_CATEGORY: Record<SupportedDescriptorCategory | "Structural", string> = {
  Action: "Action",
  BodyMotion: "Body Motion",
  HeadMotion: "Head Motion",
  IEntityFilter: "Filter",
  ISensorEntityCollector: "Collector",
  ISensorEntityPrioritiser: "Prioritiser",
  Path: "Path",
  RelativeWaypointDefinition: "Waypoint",
  Sensor: "Sensor",
  Structural: "Structural",
  ValueToParameterMapping: "Mapping",
  WeightedAction: "Action",
};

export type ChildSpec = {
  childId: string;
  connectionType: NpcBehaviorConnectionType;
  multiplicity: "single" | "multiple";
  pinSide?: "input" | "output";
  allowComponentReferences?: boolean;
};

export type ComponentReferenceTemplateSpec = {
  componentClass: string;
  templateId: string;
  title: string;
  directoryName: string;
  fileName: string;
  parentCompatibilityChildId: string;
  selfConnectionType: NpcBehaviorConnectionType;
  color: string;
  slotOccupancy?: NodeSlotOccupancy;
};

export const COMPONENT_REFERENCE_TEMPLATE_SPECS: ComponentReferenceTemplateSpec[] = [
  {
    componentClass: "Instruction",
    templateId: "Structural.InstructionReference",
    title: "Instruction Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
    fileName: "InstructionReference.json",
    parentCompatibilityChildId: "InstructionVariants",
    selfConnectionType: "Instruction",
    color: CATEGORY_COLORS.Structural,
  },
  {
    componentClass: "Sensor",
    templateId: "Sensor.Reference",
    title: "Sensor Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.Sensor,
    fileName: "Sensor.Reference.json",
    parentCompatibilityChildId: "SensorVariants",
    selfConnectionType: "Sensor",
    color: CATEGORY_COLORS.Sensor,
  },
  {
    componentClass: "Action",
    templateId: "Action.ActionReference",
    title: "Action Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.Action,
    fileName: "Action.ActionReference.json",
    parentCompatibilityChildId: "ActionVariants",
    selfConnectionType: "Action",
    color: CATEGORY_COLORS.Action,
  },
  {
    componentClass: "ActionList",
    templateId: "Action.ActionListReference",
    title: "Action List Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.Action,
    fileName: "Action.ActionListReference.json",
    parentCompatibilityChildId: "ActionVariants",
    selfConnectionType: "ActionListReference",
    color: CATEGORY_COLORS.Action,
    slotOccupancy: "whole-slot",
  },
  {
    componentClass: "BodyMotion",
    templateId: "BodyMotion.Reference",
    title: "Body Motion Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.BodyMotion,
    fileName: "BodyMotion.Reference.json",
    parentCompatibilityChildId: "BodyMotionVariants",
    selfConnectionType: "BodyMotion",
    color: CATEGORY_COLORS.BodyMotion,
  },
  {
    componentClass: "HeadMotion",
    templateId: "HeadMotion.Reference",
    title: "Head Motion Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.HeadMotion,
    fileName: "HeadMotion.Reference.json",
    parentCompatibilityChildId: "HeadMotionVariants",
    selfConnectionType: "HeadMotion",
    color: CATEGORY_COLORS.HeadMotion,
  },
  {
    componentClass: "Path",
    templateId: "Path.Reference",
    title: "Path Reference",
    directoryName: CATEGORY_DIRECTORY_NAMES.Path,
    fileName: "Path.Reference.json",
    parentCompatibilityChildId: "Path.Path",
    selfConnectionType: "Path",
    color: CATEGORY_COLORS.Path,
  },
];

export type OutputAuthoredParentConnectionTypesByChildId = ReadonlyMap<
  string,
  ReadonlySet<NpcBehaviorConnectionType>
>;

export type TemplateOutput = {
  directoryName: string;
  fileName: string;
  template: NodeTemplateDefinition;
};

export type NpcWorkspaceBuildArtifacts = {
  workspaceDefinition: NodeEditorWorkspaceDefinition;
  templateOutputs: TemplateOutput[];
};

export function isVariantBackedCategory(
  category: SupportedDescriptorCategory,
): category is VariantBackedDescriptorCategory {
  return VARIANT_BACKED_DESCRIPTOR_CATEGORIES.includes(category as VariantBackedDescriptorCategory);
}

export function findDescriptorOrThrow(
  descriptors: NpcDescriptorDocument,
  category: string,
  name: string,
): NpcDescriptor {
  const descriptor = descriptors.find(entry => entry.Category === category && entry.Name === name);
  if (!descriptor) {
    throw new Error(`Descriptor ${category}:${name} was not found.`);
  }
  return descriptor;
}

export function mergeAttributes(descriptors: NpcDescriptor[]): NpcDescriptorAttribute[] {
  const attributesByName = new Map<string, NpcDescriptorAttribute>();
  for (const descriptor of descriptors) {
    for (const attribute of descriptor.Attributes ?? []) {
      if (!attributesByName.has(attribute.Name)) {
        attributesByName.set(attribute.Name, attribute);
      }
    }
  }
  return Array.from(attributesByName.values());
}

export function normalizeDescription(value: string | null | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export function prefixNodeTitle(
  category: SupportedDescriptorCategory | "Structural",
  title: string,
): string {
  return `${TITLE_PREFIX_BY_CATEGORY[category]}: ${title}`;
}

export function normalizeNpcNodeTitle(
  category: SupportedDescriptorCategory,
  descriptorName: string,
): string {
  if (category === "WeightedAction" && descriptorName === "WeightedAction") {
    return prefixNodeTitle(category, "Weighted Action");
  }

  return prefixNodeTitle(category, descriptorName);
}
