export const NPC_BEHAVIOR_SUPPORTED_DESCRIPTOR_CATEGORIES = [
  "Action",
  "BodyMotion",
  "HeadMotion",
  "IEntityFilter",
  "ISensorEntityCollector",
  "ISensorEntityPrioritiser",
  "Path",
  "RelativeWaypointDefinition",
  "Sensor",
  "ValueToParameterMapping",
  "WeightedAction",
] as const;

export const NPC_BEHAVIOR_POSITION_SENSOR_DESCRIPTOR_NAMES = new Set([
  "AdjustPosition",
  "Beacon",
  "Block",
  "BlockChange",
  "BlockType",
  "CanPlaceBlock",
  "Damage",
  "DroppedItem",
  "EntityEvent",
  "Kill",
  "Leash",
  "Mob",
  "Not",
  "Path",
  "Player",
  "ReadPosition",
  "SearchRay",
  "Self",
  "Target",
]);

export type NpcBehaviorSupportedDescriptorCategory =
  (typeof NPC_BEHAVIOR_SUPPORTED_DESCRIPTOR_CATEGORIES)[number];

export const NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE = {
  Action: {
    Extends: ["ActionListItem"],
  },
  ActionListReference: {
    Extends: ["ActionListItem"],
  },
  PositionSensor: {
    Extends: ["Sensor"],
  },
} as const;

export const NPC_BEHAVIOR_REFERENCE_DARK_COLORS = {
  action: "#CC3361",
  bodyMotion: "#00E7B6",
  default: "#2D3746",
  filter: "#60C8B8",
  headMotion: "#B08CE0",
  reference: "#EAB934",
  sensor: "#7091F0",
} as const;

export const NPC_BEHAVIOR_CONNECTION_DEFINITIONS = {
  Action: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    label: "Action",
  },
  ActionListItem: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    label: "Actions",
  },
  ActionListReference: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.reference,
    label: "Action List Reference",
  },
  BodyMotion: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.bodyMotion,
    label: "BodyMotion",
  },
  HeadMotion: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.headMotion,
    label: "HeadMotion",
  },
  IEntityFilter: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.filter,
    label: "Filter",
  },
  ISensorEntityCollector: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    label: "Collector",
  },
  ISensorEntityPrioritiser: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    label: "Prioritiser",
  },
  Instruction: {
    authoringSide: "output",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.default,
    label: "Instruction",
  },
  Path: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    label: "Path",
  },
  RelativeWaypointDefinition: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    label: "Waypoint",
  },
  Sensor: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    label: "Sensor",
  },
  PositionSensor: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    label: "Position Sensor",
  },
  ValueToParameterMapping: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor,
    label: "Mapping",
  },
  WeightedAction: {
    authoringSide: "input",
    color: NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action,
    label: "WeightedAction",
  },
} as const;

export type NpcBehaviorConnectionType = keyof typeof NPC_BEHAVIOR_CONNECTION_DEFINITIONS;

export const NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS: Record<
  string,
  {
    childId: string;
    connectionType: NpcBehaviorConnectionType;
  }
> = {
  Action: { childId: "ActionVariants", connectionType: "Action" },
  ActionList: { childId: "ActionVariants", connectionType: "ActionListItem" },
  BodyMotion: { childId: "BodyMotionVariants", connectionType: "BodyMotion" },
  HeadMotion: { childId: "HeadMotionVariants", connectionType: "HeadMotion" },
  IEntityFilter: { childId: "FilterVariants", connectionType: "IEntityFilter" },
  Instruction: { childId: "Structural.InstructionNode", connectionType: "Instruction" },
  ISensorEntityCollector: {
    childId: "CollectorVariants",
    connectionType: "ISensorEntityCollector",
  },
  ISensorEntityPrioritiser: {
    childId: "PrioritiserVariants",
    connectionType: "ISensorEntityPrioritiser",
  },
  Path: { childId: "Path.Path", connectionType: "Path" },
  RelativeWaypointDefinition: {
    childId: "RelativeWaypointDefinition.RelativeWaypointDefinition",
    connectionType: "RelativeWaypointDefinition",
  },
  Sensor: { childId: "SensorVariants", connectionType: "Sensor" },
  ValueToParameterMapping: {
    childId: "ValueToParameterMapping.ValueToParameterMapping",
    connectionType: "ValueToParameterMapping",
  },
  WeightedAction: {
    childId: "WeightedAction.WeightedAction",
    connectionType: "WeightedAction",
  },
};

export const NPC_BEHAVIOR_PRIMITIVE_LIST_DOMAINS = new Set([
  "Boolean",
  "Double",
  "Float",
  "Int",
  "Integer",
  "Long",
  "String",
  "TemporalAmount",
  "integer",
]);

export function isNpcBehaviorSupportedDescriptorCategory(
  category: string,
): category is NpcBehaviorSupportedDescriptorCategory {
  return NPC_BEHAVIOR_SUPPORTED_DESCRIPTOR_CATEGORIES.includes(
    category as NpcBehaviorSupportedDescriptorCategory,
  );
}

export function getNpcBehaviorConnectionColor(connectionType: NpcBehaviorConnectionType): string {
  return NPC_BEHAVIOR_CONNECTION_DEFINITIONS[connectionType].color;
}

export function getNpcBehaviorConnectionLabel(connectionType: NpcBehaviorConnectionType): string {
  return NPC_BEHAVIOR_CONNECTION_DEFINITIONS[connectionType].label;
}

export function getNpcBehaviorConnectionAuthoringSide(
  connectionType: NpcBehaviorConnectionType,
): "input" | "output" {
  return NPC_BEHAVIOR_CONNECTION_DEFINITIONS[connectionType].authoringSide;
}

export function getNpcBehaviorCategoryColor(
  category: NpcBehaviorSupportedDescriptorCategory | "Structural",
): string {
  switch (category) {
    case "Action":
    case "Path":
    case "RelativeWaypointDefinition":
    case "WeightedAction":
      return NPC_BEHAVIOR_REFERENCE_DARK_COLORS.action;
    case "BodyMotion":
      return NPC_BEHAVIOR_REFERENCE_DARK_COLORS.bodyMotion;
    case "HeadMotion":
      return NPC_BEHAVIOR_REFERENCE_DARK_COLORS.headMotion;
    case "IEntityFilter":
      return NPC_BEHAVIOR_REFERENCE_DARK_COLORS.filter;
    case "ISensorEntityCollector":
    case "ISensorEntityPrioritiser":
    case "Sensor":
    case "ValueToParameterMapping":
      return NPC_BEHAVIOR_REFERENCE_DARK_COLORS.sensor;
    case "Structural":
      return NPC_BEHAVIOR_REFERENCE_DARK_COLORS.default;
  }
}

export function getNpcBehaviorDescriptorSelfConnectionType(
  category: NpcBehaviorSupportedDescriptorCategory,
  descriptorName: string,
): NpcBehaviorConnectionType {
  switch (category) {
    case "Action":
    case "BodyMotion":
    case "HeadMotion":
    case "IEntityFilter":
    case "ISensorEntityCollector":
    case "ISensorEntityPrioritiser":
    case "Path":
    case "RelativeWaypointDefinition":
    case "ValueToParameterMapping":
    case "WeightedAction":
      return category;
    case "Sensor":
      return NPC_BEHAVIOR_POSITION_SENSOR_DESCRIPTOR_NAMES.has(descriptorName)
        ? "PositionSensor"
        : "Sensor";
  }
}

export function getNpcBehaviorTemplateSelfConnectionType(
  templateId: string,
): NpcBehaviorConnectionType | undefined {
  if (templateId === "Structural.InstructionNode") {
    return "Instruction";
  }

  return undefined;
}

export function getNpcBehaviorChildDomainDefinition(
  domain: string,
): { childId: string; connectionType: NpcBehaviorConnectionType } | undefined {
  return NPC_BEHAVIOR_CHILD_DOMAIN_DEFINITIONS[domain];
}

export function getNpcBehaviorChildConnectionType(
  descriptorCategory: string,
  descriptorName: string,
  attributeName: string,
  domain: string,
): NpcBehaviorConnectionType | undefined {
  if (
    domain === "Sensor" &&
    descriptorCategory === "Sensor" &&
    (descriptorName === "AdjustPosition" || descriptorName === "BlockType") &&
    attributeName === "Sensor"
  ) {
    return "PositionSensor";
  }

  return getNpcBehaviorChildDomainDefinition(domain)?.connectionType;
}

export function getNpcBehaviorChildPinSide(
  descriptorCategory: string,
  descriptorName: string,
  attributeName: string,
  domain: string,
): "input" | "output" {
  const connectionType = getNpcBehaviorChildConnectionType(
    descriptorCategory,
    descriptorName,
    attributeName,
    domain,
  );

  return connectionType ? getNpcBehaviorConnectionAuthoringSide(connectionType) : "output";
}

export function getNpcBehaviorChildDomain(
  attributeType: string,
  domain: string | undefined,
): string | undefined {
  if (!domain) {
    return undefined;
  }

  if (attributeType === "ObjectRef") {
    return domain;
  }

  if (
    attributeType === "Array" &&
    !NPC_BEHAVIOR_PRIMITIVE_LIST_DOMAINS.has(domain) &&
    !isEnumDomain(domain)
  ) {
    return domain;
  }

  return undefined;
}

function isEnumDomain(domain: string): boolean {
  return domain.startsWith("[") && domain.endsWith("]");
}
