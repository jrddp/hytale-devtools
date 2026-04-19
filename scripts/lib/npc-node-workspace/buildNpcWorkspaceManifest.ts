import type { NpcDescriptor, NpcDescriptorDocument } from "../../../src/shared/npc-role-editor/descriptorTypes";
import {
  NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE,
  getNpcBehaviorConnectionAuthoringSide,
  getNpcBehaviorDescriptorSelfConnectionType,
} from "../../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import type {
  NodeContentDefinition,
  NodeEditorWorkspaceDefinition,
  NodePinDefinition,
  NodeTemplateDefinition,
} from "../../../src/node-editor/workspaceDefinitionTypes";
import {
  buildContentField,
  buildInstructionTypeField,
  buildReferenceField,
} from "./buildNpcFieldSchema";
import {
  collectOutputAuthoredParentConnectionTypesByChildId,
  createChildPinDefinition,
  createParentCompatibilityInputs,
  createSelfOutputPin,
  getDescriptorTemplateParentTargetIds,
  getInstructionTemplateParentTargetId,
  resolveChildSpec,
  resolveInstructionChildSpec,
  shouldEmitSelfOutputPin,
} from "./buildNpcChildSchema";
import { getInstructionDescriptors, getSupportedNpcBehaviorDescriptors } from "./loadNpcDescriptors";
import {
  CATEGORY_COLORS,
  CATEGORY_DIRECTORY_NAMES,
  COMPONENT_REFERENCE_TEMPLATE_SPECS,
  NODE_CATEGORY_NAMES,
  WORKSPACE_NAME,
  isVariantBackedCategory,
  mergeAttributes,
  normalizeDescription,
  type ComponentReferenceTemplateSpec,
  type NpcWorkspaceBuildArtifacts,
  type OutputAuthoredParentConnectionTypesByChildId,
  type SupportedDescriptorCategory,
  type TemplateOutput,
  type VariantBackedDescriptorCategory,
} from "./npcNodeWorkspaceModel";

export function buildNpcWorkspaceArtifacts(
  descriptors: NpcDescriptorDocument,
): NpcWorkspaceBuildArtifacts {
  const supportedDescriptors = getSupportedNpcBehaviorDescriptors(descriptors);
  const instructionDescriptors = getInstructionDescriptors(descriptors);
  const outputAuthoredParentConnectionTypesByChildId =
    collectOutputAuthoredParentConnectionTypesByChildId(
      supportedDescriptors,
      instructionDescriptors,
    );

  const templateOutputs = [
    ...supportedDescriptors.map(descriptor =>
      buildDescriptorTemplate(descriptor, outputAuthoredParentConnectionTypesByChildId),
    ),
    ...buildComponentReferenceTemplates(outputAuthoredParentConnectionTypesByChildId),
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

  return {
    workspaceDefinition: buildWorkspaceDefinition(templateOutputs),
    templateOutputs,
  };
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
      const pin = createChildPinDefinition(attribute, childSpec);
      (childSpec.pinSide === "input" ? inputs : outputs).push(pin);
      schema[attribute.Name] = {
        Pin: pin.Id,
        Node: childSpec.childId,
        AllowComponentReferences: childSpec.allowComponentReferences || undefined,
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
  const parentInputs = createParentCompatibilityInputs(
    [getInstructionTemplateParentTargetId()],
    outputAuthoredParentConnectionTypesByChildId,
  );
  const childInputs: NodePinDefinition[] = [];
  const outputs: NodePinDefinition[] = [];
  const schema: NonNullable<NodeTemplateDefinition["Schema"]> = {
    Type: "Type",
  };
  const content: NodeContentDefinition[] = [buildInstructionTypeField()];

  for (const attribute of mergeAttributes(instructionDescriptors)) {
    const childSpec = resolveInstructionChildSpec(attribute);
    if (childSpec) {
      const pin = createChildPinDefinition(attribute, childSpec);
      (childSpec.pinSide === "input" ? childInputs : outputs).push(pin);
      schema[attribute.Name] = {
        Pin: pin.Id,
        Node: childSpec.childId,
        AllowComponentReferences: childSpec.allowComponentReferences || undefined,
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

  const inputs = orderInstructionInputs(childInputs, parentInputs);

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

function buildComponentReferenceTemplates(
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput[] {
  return COMPONENT_REFERENCE_TEMPLATE_SPECS.map(spec =>
    buildComponentReferenceTemplate(spec, outputAuthoredParentConnectionTypesByChildId),
  );
}

function buildComponentReferenceTemplate(
  spec: ComponentReferenceTemplateSpec,
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput {
  const inputs = createParentCompatibilityInputs(
    [spec.parentCompatibilityChildId],
    outputAuthoredParentConnectionTypesByChildId,
    { label: "Parent" },
  );
  const outputs =
    getNpcBehaviorConnectionAuthoringSide(spec.selfConnectionType) === "input"
      ? [createSelfOutputPin(spec.selfConnectionType)]
      : undefined;

  return {
    directoryName: spec.directoryName,
    fileName: spec.fileName,
    template: {
      Id: spec.templateId,
      Title: spec.title,
      Color: spec.color,
      Description: `Reference an external ${spec.componentClass} component.`,
      Inputs: inputs.length > 0 ? inputs : undefined,
      Outputs: outputs,
      Content: [buildReferenceField()],
      Schema: {
        Reference: "Reference",
      },
      IsComponentReference: true,
      ComponentReferenceClass: spec.componentClass,
      SlotOccupancy: spec.slotOccupancy,
    },
  };
}

function orderInstructionInputs(
  childInputs: NodePinDefinition[],
  parentInputs: NodePinDefinition[],
): NodePinDefinition[] {
  const orderedChildInputs = [...childInputs].sort((left, right) => {
    return getInstructionInputPriority(left).priority - getInstructionInputPriority(right).priority;
  });

  const orderedParentInputs = [...parentInputs].sort((left, right) => {
    return getInstructionInputPriority(left).priority - getInstructionInputPriority(right).priority;
  });

  return [...orderedChildInputs, ...orderedParentInputs];
}

function getInstructionInputPriority(pin: NodePinDefinition): { priority: number } {
  if (pin.Label === "Sensor") {
    return { priority: 0 };
  }

  if (pin.Label === "Instruction") {
    return { priority: 1 };
  }

  return { priority: 2 };
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
