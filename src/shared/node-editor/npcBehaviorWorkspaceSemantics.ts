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

export type NpcBehaviorSupportedDescriptorCategory =
  (typeof NPC_BEHAVIOR_SUPPORTED_DESCRIPTOR_CATEGORIES)[number];

export const NPC_BEHAVIOR_CONNECTION_DEFINITIONS = {
  Action: {
    authoringSide: "output",
    color: "DeepSkyBlue",
    label: "Action",
  },
  BodyMotion: {
    authoringSide: "output",
    color: "DarkOrange",
    label: "BodyMotion",
  },
  HeadMotion: {
    authoringSide: "output",
    color: "MediumPurple",
    label: "HeadMotion",
  },
  IEntityFilter: {
    authoringSide: "input",
    color: "YellowGreen",
    label: "Filter",
  },
  ISensorEntityCollector: {
    authoringSide: "output",
    color: "DarkCyan",
    label: "Collector",
  },
  ISensorEntityPrioritiser: {
    authoringSide: "input",
    color: "HotPink",
    label: "Prioritiser",
  },
  Instruction: {
    authoringSide: "output",
    color: "Gold",
    label: "Instruction",
  },
  Path: {
    authoringSide: "input",
    color: "CornflowerBlue",
    label: "Path",
  },
  RelativeWaypointDefinition: {
    authoringSide: "input",
    color: "SteelBlue",
    label: "Waypoint",
  },
  Sensor: {
    authoringSide: "input",
    color: "LimeGreen",
    label: "Sensor",
  },
  WrappedSensor: {
    authoringSide: "output",
    color: "SeaGreen",
    label: "Wrapped Sensor",
  },
  ValueToParameterMapping: {
    authoringSide: "input",
    color: "Tan",
    label: "Mapping",
  },
  WeightedAction: {
    authoringSide: "input",
    color: "DodgerBlue",
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
  ActionList: { childId: "ActionVariants", connectionType: "Action" },
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

export function getNpcBehaviorDescriptorSelfConnectionType(
  category: NpcBehaviorSupportedDescriptorCategory,
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
    case "Sensor":
    case "ValueToParameterMapping":
    case "WeightedAction":
      return category;
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
    (descriptorName === "AdjustPosition" ||
      descriptorName === "BlockType" ||
      descriptorName === "ValueProviderWrapper") &&
    attributeName === "Sensor"
  ) {
    return "WrappedSensor";
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
