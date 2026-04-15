import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "../src/shared/npc-role-editor/descriptorTypes";
import {
  NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE,
  type NpcBehaviorConnectionType,
  type NpcBehaviorSupportedDescriptorCategory,
  getNpcBehaviorChildDomain,
  getNpcBehaviorChildConnectionType,
  getNpcBehaviorChildDomainDefinition,
  getNpcBehaviorChildPinSide,
  getNpcBehaviorConnectionAuthoringSide,
  getNpcBehaviorConnectionColor,
  getNpcBehaviorConnectionLabel,
  getNpcBehaviorDescriptorSelfConnectionType,
  isNpcBehaviorSupportedDescriptorCategory,
} from "../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import type {
  NodeContentDefinition,
  NodeEditorWorkspaceDefinition,
  NodePinDefinition,
  NodeTemplateDefinition,
} from "../src/node-editor/workspaceDefinitionTypes";

const WORKSPACE_NAME = "NPC Behavior";
const WORKSPACE_DIRECTORY = "NPCBehavior";

const rootDir = process.cwd();
const descriptorsPath = path.join(rootDir, "default-data", "export-data", "npc_descriptors.json");
const outputRootPath = path.join(
  rootDir,
  "default-data",
  "node-editor-workspace-definitions",
  WORKSPACE_DIRECTORY,
);

const VARIANT_BACKED_DESCRIPTOR_CATEGORIES = [
  "Action",
  "BodyMotion",
  "HeadMotion",
  "IEntityFilter",
  "ISensorEntityCollector",
  "ISensorEntityPrioritiser",
  "Sensor",
] as const;
type VariantBackedDescriptorCategory = Extract<
  NpcBehaviorSupportedDescriptorCategory,
  (typeof VARIANT_BACKED_DESCRIPTOR_CATEGORIES)[number]
>;

const DIRECT_TEMPLATE_DESCRIPTOR_CATEGORIES = [
  "Path",
  "RelativeWaypointDefinition",
  "ValueToParameterMapping",
  "WeightedAction",
] as const;
type DirectTemplateDescriptorCategory = Extract<
  NpcBehaviorSupportedDescriptorCategory,
  (typeof DIRECT_TEMPLATE_DESCRIPTOR_CATEGORIES)[number]
>;

type SupportedDescriptorCategory =
  | VariantBackedDescriptorCategory
  | DirectTemplateDescriptorCategory;

const CATEGORY_COLORS: Record<SupportedDescriptorCategory | "Structural", string> = {
  Action: getNpcBehaviorConnectionColor("Action"),
  BodyMotion: getNpcBehaviorConnectionColor("BodyMotion"),
  HeadMotion: getNpcBehaviorConnectionColor("HeadMotion"),
  IEntityFilter: getNpcBehaviorConnectionColor("IEntityFilter"),
  ISensorEntityCollector: getNpcBehaviorConnectionColor("ISensorEntityCollector"),
  ISensorEntityPrioritiser: getNpcBehaviorConnectionColor("ISensorEntityPrioritiser"),
  Path: getNpcBehaviorConnectionColor("Path"),
  RelativeWaypointDefinition: getNpcBehaviorConnectionColor("RelativeWaypointDefinition"),
  Sensor: getNpcBehaviorConnectionColor("Sensor"),
  Structural: "Gold",
  ValueToParameterMapping: getNpcBehaviorConnectionColor("ValueToParameterMapping"),
  WeightedAction: getNpcBehaviorConnectionColor("WeightedAction"),
};

const CATEGORY_DIRECTORY_NAMES: Record<SupportedDescriptorCategory | "Structural", string> = {
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

const NODE_CATEGORY_NAMES: Record<SupportedDescriptorCategory | "Structural", string> = {
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

const INSTRUCTION_VARIANT_VALUES = ["Random", "Reference"];

type ChildSpec = {
  childId: string;
  connectionType: NpcBehaviorConnectionType;
  multiplicity: "single" | "multiple";
  pinSide?: "input" | "output";
};

type OutputAuthoredParentConnectionTypesByChildId = ReadonlyMap<
  string,
  ReadonlySet<NpcBehaviorConnectionType>
>;

type TemplateOutput = {
  directoryName: string;
  fileName: string;
  template: NodeTemplateDefinition;
};

function parseDescriptors(): NpcDescriptorDocument {
  return JSON.parse(readFileSync(descriptorsPath, "utf8")) as NpcDescriptorDocument;
}

function main(): void {
  const descriptors = parseDescriptors();
  const supportedDescriptors = descriptors.filter(
    (descriptor): descriptor is NpcDescriptor & { Category: SupportedDescriptorCategory } =>
      isNpcBehaviorSupportedDescriptorCategory(descriptor.Category),
  );
  const instructionDescriptors = [
    findDescriptorOrThrow(descriptors, "Instruction", "Instruction"),
    findDescriptorOrThrow(descriptors, "Instruction", "Random"),
    findDescriptorOrThrow(descriptors, "Instruction", "Reference"),
  ];
  const outputAuthoredParentConnectionTypesByChildId =
    collectOutputAuthoredParentConnectionTypesByChildId(
      supportedDescriptors,
      instructionDescriptors,
    );

  const templateOutputs = [
    ...supportedDescriptors.map(descriptor =>
      buildDescriptorTemplate(descriptor, outputAuthoredParentConnectionTypesByChildId),
    ),
    buildInstructionNodeTemplate(
      instructionDescriptors,
      outputAuthoredParentConnectionTypesByChildId,
    ),
    buildInstructionListRootTemplate(),
  ].sort(
    (left, right) =>
      left.directoryName.localeCompare(right.directoryName) ||
      left.template.Id.localeCompare(right.template.Id),
  );

  const workspaceDefinition = buildWorkspaceDefinition(templateOutputs);

  rmSync(outputRootPath, { recursive: true, force: true });
  mkdirSync(outputRootPath, { recursive: true });
  writeJsonFile(path.join(outputRootPath, "_Workspace.json"), workspaceDefinition);

  for (const output of templateOutputs) {
    const directoryPath = path.join(outputRootPath, output.directoryName);
    mkdirSync(directoryPath, { recursive: true });
    writeJsonFile(path.join(directoryPath, output.fileName), output.template);
  }

  console.log(
    `Generated ${templateOutputs.length} NPC node templates in ${path.relative(rootDir, outputRootPath)}.`,
  );
}

function isVariantBackedCategory(
  category: SupportedDescriptorCategory,
): category is VariantBackedDescriptorCategory {
  return VARIANT_BACKED_DESCRIPTOR_CATEGORIES.includes(category as VariantBackedDescriptorCategory);
}

function findDescriptorOrThrow(
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

function buildWorkspaceDefinition(
  templateOutputs: TemplateOutput[],
): NodeEditorWorkspaceDefinition {
  const templatesByNodeCategory = new Map<string, string[]>();
  for (const output of templateOutputs) {
    const categorySegment =
      output.template.Id.startsWith("Structural.")
        ? "Structural"
        : output.template.Id.split(".")[0];
    const categoryName = NODE_CATEGORY_NAMES[
      categorySegment as SupportedDescriptorCategory | "Structural"
    ];
    const templateIds = templatesByNodeCategory.get(categoryName) ?? [];
    templateIds.push(output.template.Id);
    templatesByNodeCategory.set(categoryName, templateIds);
  }

  return {
    WorkspaceName: WORKSPACE_NAME,
    ConnectionTypes: NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE,
    Roots: {
      Instructions: {
        RootNodeType: "Structural.InstructionListRoot",
        MenuName: "Instructions",
      },
      Instruction: {
        RootNodeType: "Structural.InstructionNode",
        MenuName: "Instruction",
      },
      Sensor: {
        RootNodeType: "SensorVariants",
        MenuName: "Sensor",
      },
    },
    NodeCategories: Object.fromEntries(
      Array.from(templatesByNodeCategory.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([categoryName, templateIds]) => [
          categoryName,
          templateIds.sort((left, right) => left.localeCompare(right)),
        ]),
    ),
    Variants: {
      SensorVariants: buildVariantKindDefinition("Sensor", templateOutputs),
      ActionVariants: buildVariantKindDefinition("Action", templateOutputs),
      BodyMotionVariants: buildVariantKindDefinition("BodyMotion", templateOutputs),
      HeadMotionVariants: buildVariantKindDefinition("HeadMotion", templateOutputs),
      FilterVariants: buildVariantKindDefinition("IEntityFilter", templateOutputs),
      CollectorVariants: buildVariantKindDefinition("ISensorEntityCollector", templateOutputs),
      PrioritiserVariants: buildVariantKindDefinition(
        "ISensorEntityPrioritiser",
        templateOutputs,
      ),
    },
  };
}

function buildVariantKindDefinition(
  category: VariantBackedDescriptorCategory,
  templateOutputs: TemplateOutput[],
) {
  const prefix = `${category}.`;
  const variants = Object.fromEntries(
    templateOutputs
      .filter(output => output.template.Id.startsWith(prefix))
      .map(output => [output.template.Id.slice(prefix.length), output.template.Id])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    VariantFieldName: "Type",
    Variants: variants,
  };
}

function buildDescriptorTemplate(
  descriptor: NpcDescriptor & { Category: SupportedDescriptorCategory },
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput {
  const inputs: NodePinDefinition[] = createParentCompatibilityInputs(
    getDescriptorTemplateParentTargetIds(descriptor),
    outputAuthoredParentConnectionTypesByChildId,
  );
  const outputs: NodePinDefinition[] = [];
  const schema: NonNullable<NodeTemplateDefinition["Schema"]> = {};
  const content: NodeContentDefinition[] = [];

  const selfConnectionType = getNpcBehaviorDescriptorSelfConnectionType(
    descriptor.Category,
    descriptor.Name,
  );
  if (shouldEmitSelfOutputPin(descriptor.Category, descriptor.Name) && selfConnectionType) {
    outputs.push(createSelfOutputPin(selfConnectionType));
  }

  for (const attribute of descriptor.Attributes ?? []) {
    const childSpec = resolveChildSpec(descriptor, attribute);
    if (childSpec) {
      const pinId = `${attribute.Name}Pin`;
      const pin: NodePinDefinition = {
        Id: pinId,
        Type: childSpec.connectionType,
        Color: getNpcBehaviorConnectionColor(childSpec.connectionType),
        Label: attribute.Name,
        Description: normalizeDescription(attribute.ShortDescription),
        Multiple: childSpec.multiplicity === "multiple" || undefined,
      };
      (childSpec.pinSide === "input" ? inputs : outputs).push(pin);
      schema[attribute.Name] = {
        Pin: pinId,
        Node: childSpec.childId,
      };
      continue;
    }

    const field = buildContentField(attribute);
    if (!field) {
      continue;
    }

    content.push(field);
    schema[attribute.Name] = attribute.Name;
  }

  if (isVariantBackedCategory(descriptor.Category)) {
    schema.Type = descriptor.Name;
  }

  return {
    directoryName: CATEGORY_DIRECTORY_NAMES[descriptor.Category],
    fileName: `${descriptor.Category}.${descriptor.Name}.json`,
    template: {
      Id: `${descriptor.Category}.${descriptor.Name}`,
      Title: descriptor.Name,
      Color: CATEGORY_COLORS[descriptor.Category],
      Description: normalizeDescription(descriptor.ShortDescription),
      Inputs: inputs,
      Outputs: outputs.length > 0 ? outputs : undefined,
      Content: content.length > 0 ? content : undefined,
      Schema: Object.keys(schema).length > 0 ? schema : undefined,
    },
  };
}

function buildInstructionNodeTemplate(
  instructionDescriptors: NpcDescriptor[],
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput {
  const inputs: NodePinDefinition[] = createParentCompatibilityInputs(
    [getInstructionTemplateParentTargetId()],
    outputAuthoredParentConnectionTypesByChildId,
  );
  const outputs: NodePinDefinition[] = [];
  const schema: NonNullable<NodeTemplateDefinition["Schema"]> = {
    Type: "Type",
  };
  const content: NodeContentDefinition[] = [buildInstructionTypeField()];

  for (const attribute of mergeAttributes(instructionDescriptors)) {
    const childSpec = resolveInstructionChildSpec(attribute);
    if (childSpec) {
      const pinId = `${attribute.Name}Pin`;
      const pin: NodePinDefinition = {
        Id: pinId,
        Type: childSpec.connectionType,
        Color: getNpcBehaviorConnectionColor(childSpec.connectionType),
        Label: attribute.Name,
        Description: normalizeDescription(attribute.ShortDescription),
        Multiple: childSpec.multiplicity === "multiple" || undefined,
      };
      (childSpec.pinSide === "input" ? inputs : outputs).push(pin);
      schema[attribute.Name] = {
        Pin: pinId,
        Node: childSpec.childId,
      };
      continue;
    }

    const field = buildContentField(attribute);
    if (!field) {
      continue;
    }

    content.push(field);
    schema[attribute.Name] = attribute.Name;
  }

  return {
    directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
    fileName: "InstructionNode.json",
    template: {
      Id: "Structural.InstructionNode",
      Title: "Instruction",
      Color: CATEGORY_COLORS.Structural,
      Description: normalizeDescription(instructionDescriptors[0]?.ShortDescription),
      Inputs: inputs,
      Outputs: outputs,
      Content: content,
      Schema: schema,
    },
  };
}

function buildInstructionListRootTemplate(): TemplateOutput {
  return {
    directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
    fileName: "InstructionListRoot.json",
    template: {
      Id: "Structural.InstructionListRoot",
      Title: "Instructions",
      Color: CATEGORY_COLORS.Structural,
      Description: "Root wrapper for a list of NPC instructions.",
      Outputs: [
        {
          Id: "InstructionsPin",
          Type: "Instruction",
          Color: CATEGORY_COLORS.Structural,
          Label: "Instructions",
          Multiple: true,
        },
      ],
      Schema: {
        Instructions: {
          Pin: "InstructionsPin",
          Node: "Structural.InstructionNode",
          SerializationType: "root",
        },
      },
    },
  };
}

function buildInstructionTypeField(): NodeContentDefinition {
  return {
    Id: "Type",
    Type: "Enum",
    Description: "Instruction subtype. Leave unset for the default instruction shape.",
    Options: {
      Label: "Type",
      Values: INSTRUCTION_VARIANT_VALUES,
      Width: 220,
    },
  };
}

function mergeAttributes(descriptors: NpcDescriptor[]): NpcDescriptorAttribute[] {
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

function createParentCompatibilityInputs(
  childTargetIds: readonly string[],
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): NodePinDefinition[] {
  const connectionTypes = new Set<NpcBehaviorConnectionType>();
  for (const childTargetId of childTargetIds) {
    for (const connectionType of outputAuthoredParentConnectionTypesByChildId.get(childTargetId) ??
      []) {
      connectionTypes.add(connectionType);
    }
  }

  if (connectionTypes.size === 0) {
    return [];
  }

  return Array.from(connectionTypes)
    .sort((left, right) => left.localeCompare(right))
    .map((connectionType, index) =>
      createParentCompatibilityInputPin(connectionType, index),
    );
}

function createParentCompatibilityInputPin(
  connectionType: NpcBehaviorConnectionType,
  index: number,
): NodePinDefinition {
  return {
    Id: index === 0 ? "Input" : `Input${index}`,
    Type: connectionType,
    Color: getNpcBehaviorConnectionColor(connectionType),
    Label: getNpcBehaviorConnectionLabel(connectionType),
  };
}

function createSelfOutputPin(connectionType: NpcBehaviorConnectionType): NodePinDefinition {
  return {
    Id: "Output",
    Type: connectionType,
    Color: getNpcBehaviorConnectionColor(connectionType),
    Label: getNpcBehaviorConnectionLabel(connectionType),
  };
}

function shouldEmitSelfOutputPin(
  category: SupportedDescriptorCategory,
  descriptorName: string,
): boolean {
  const selfConnectionType = getNpcBehaviorDescriptorSelfConnectionType(category, descriptorName);
  return getNpcBehaviorConnectionAuthoringSide(selfConnectionType) === "input";
}

function collectOutputAuthoredParentConnectionTypesByChildId(
  supportedDescriptors: Array<NpcDescriptor & { Category: SupportedDescriptorCategory }>,
  instructionDescriptors: NpcDescriptor[],
): Map<string, Set<NpcBehaviorConnectionType>> {
  const connectionTypesByChildId = new Map<string, Set<NpcBehaviorConnectionType>>();

  const addChildSpec = (childSpec: ChildSpec | null): void => {
    if (!childSpec || childSpec.pinSide === "input") {
      return;
    }

    let connectionTypes = connectionTypesByChildId.get(childSpec.childId);
    if (!connectionTypes) {
      connectionTypes = new Set<NpcBehaviorConnectionType>();
      connectionTypesByChildId.set(childSpec.childId, connectionTypes);
    }
    connectionTypes.add(childSpec.connectionType);
  };

  for (const descriptor of supportedDescriptors) {
    for (const attribute of descriptor.Attributes ?? []) {
      addChildSpec(resolveChildSpec(descriptor, attribute));
    }
  }

  for (const attribute of mergeAttributes(instructionDescriptors)) {
    addChildSpec(resolveInstructionChildSpec(attribute));
  }

  return connectionTypesByChildId;
}

function resolveInstructionChildSpec(attribute: NpcDescriptorAttribute): ChildSpec | null {
  return resolveChildSpec({ Category: "Structural", Name: "Instruction" }, attribute);
}

function resolveChildSpec(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: NpcDescriptorAttribute,
): ChildSpec | null {
  const domain = getNpcBehaviorChildDomain(
    attribute.Type,
    typeof attribute.Domain === "string" ? attribute.Domain : undefined,
  );
  if (!domain) {
    return null;
  }

  const resolved = getNpcBehaviorChildDomainDefinition(domain);
  if (!resolved) {
    return null;
  }

  const connectionType = getNpcBehaviorChildConnectionType(
    descriptor.Category,
    descriptor.Name,
    attribute.Name,
    domain,
  );
  if (!connectionType) {
    return null;
  }

  return {
    childId: resolved.childId,
    connectionType,
    multiplicity:
      attribute.Type === "Array" || domain === "ActionList" ? "multiple" : "single",
    pinSide: getNpcBehaviorChildPinSide(
      descriptor.Category,
      descriptor.Name,
      attribute.Name,
      domain,
    ),
  };
}

function getDescriptorTemplateParentTargetIds(
  descriptor: NpcDescriptor & { Category: SupportedDescriptorCategory },
): string[] {
  const childDefinition = getNpcBehaviorChildDomainDefinition(descriptor.Category);
  return childDefinition ? [childDefinition.childId] : [];
}

function getInstructionTemplateParentTargetId(): string {
  const childDefinition = getNpcBehaviorChildDomainDefinition("Instruction");
  if (!childDefinition) {
    throw new Error("Instruction child domain definition is missing.");
  }

  return childDefinition.childId;
}

function buildContentField(attribute: NpcDescriptorAttribute): NodeContentDefinition | null {
  if (attribute.Type === "Parameters") {
    return null;
  }

  const enumValues = parseEnumValues(attribute.Domain);
  const type = resolveFieldType(attribute, enumValues);
  if (!type) {
    return null;
  }

  const options: NodeContentDefinition["Options"] = {
    Label: attribute.Name,
  };
  const defaultValue = parseDefaultValue(attribute);
  if (defaultValue !== undefined) {
    options.Default = defaultValue;
  }
  const inputWidth = getInputWidth(type);
  if (inputWidth !== undefined) {
    options.Width = inputWidth;
  }
  if (enumValues?.length) {
    options.Values = enumValues;
  }
  if (attribute.Computable === true) {
    options.Computable = true;
  }

  return {
    Id: attribute.Name,
    Type: type,
    Description: normalizeDescription(attribute.ShortDescription),
    Options: options,
  };
}

function resolveFieldType(
  attribute: NpcDescriptorAttribute,
  enumValues: string[] | undefined,
): NodeContentDefinition["Type"] | null {
  if (enumValues?.length) {
    return "Enum";
  }

  switch (attribute.Type) {
    case "Boolean":
      return "Bool";
    case "Flag":
    case "String":
      return "SmallString";
    case "Float":
    case "Double":
      return "Float";
    case "Int":
    case "Integer":
    case "Long":
      return "Int";
    case "Array":
      return canRenderArrayField(attribute) ? "List" : null;
    case "ObjectRef":
      return null;
    default:
      return null;
  }
}

function canRenderArrayField(attribute: NpcDescriptorAttribute): boolean {
  return (
    getNpcBehaviorChildDomain(
      attribute.Type,
      typeof attribute.Domain === "string" ? attribute.Domain : undefined,
    ) === undefined
  );
}

function parseDefaultValue(
  attribute: NpcDescriptorAttribute,
): string | number | boolean | unknown[] | undefined {
  const rawValue = attribute.DefaultValue;
  if (rawValue == null) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return attribute.Type === "String" || attribute.Type === "Flag" ? "" : undefined;
  }

  switch (attribute.Type) {
    case "Boolean":
      if (trimmed === "true") {
        return true;
      }
      if (trimmed === "false") {
        return false;
      }
      return undefined;
    case "Float":
    case "Double":
    case "Int":
    case "Integer":
    case "Long": {
      const numericValue = Number(trimmed);
      return Number.isFinite(numericValue) ? numericValue : undefined;
    }
    case "Array":
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    default:
      return rawValue;
  }
}

function parseEnumValues(domain: unknown): string[] | undefined {
  if (typeof domain !== "string" || !domain.startsWith("[") || !domain.endsWith("]")) {
    return undefined;
  }

  return domain
    .slice(1, -1)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function getInputWidth(type: NodeContentDefinition["Type"]): number | undefined {
  switch (type) {
    case "Bool":
      return 18;
    case "Float":
    case "Int":
      return 88;
    case "List":
      return 240;
    default:
      return 220;
  }
}

function normalizeDescription(value: string | null | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main();
