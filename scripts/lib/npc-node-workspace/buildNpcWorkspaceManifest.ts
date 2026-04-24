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
  buildReferenceField,
  buildReferenceInterfacesField,
  buildReferenceNullableField,
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
  normalizeNpcNodeTitle,
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
    ...buildInstructionTemplates(
      instructionDescriptors,
      outputAuthoredParentConnectionTypesByChildId,
    ),
    buildInstructionListRootTemplate(),
    ...buildStateTransitionTemplates(),
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
    if (output.template.Id === "Structural.StateTransitionListRoot") {
      continue;
    }

    const categorySegment =
      output.template.Id.startsWith("Structural.")
        ? "Structural"
        : output.template.Id.split(".")[0];
    const categoryName = getNodeCategoryName(output.template.Id, categorySegment);
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
        RootNodeType: "InstructionVariants",
        MenuName: "Instruction",
      },
      Sensor: {
        RootNodeType: "SensorVariants",
        MenuName: "Sensor",
      },
      StateTransitions: {
        RootNodeType: "Structural.StateTransitionListRoot",
        MenuName: "State Transitions",
        AllowedCategories: [
          "Actions",
          "State Transitions",
        ],
      },
    },
    NodeCategories: Object.fromEntries(
      Array.from(templatesByNodeCategory.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([categoryName, templateIds]) => [
          categoryName,
          sortTemplateIdsForCategory(categoryName, templateIds),
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
      InstructionVariants: {
        VariantFieldName: "Type",
        DefaultTemplateId: "Structural.InstructionNode",
        Variants: {
          Random: "Structural.RandomInstructionNode",
        },
      },
    },
  };
}

function sortTemplateIdsForCategory(categoryName: string, templateIds: string[]): string[] {
  if (categoryName === "State Transitions") {
    const order = [
      "Structural.StateTransitionNode",
      "Structural.StateTransitionMappingNode",
    ];
    return [...templateIds].sort(
      (left, right) => order.indexOf(left) - order.indexOf(right),
    );
  }

  return [...templateIds].sort((left, right) => left.localeCompare(right));
}

function getNodeCategoryName(templateId: string, categorySegment: string): string {
  if (templateId.startsWith("Structural.StateTransition")) {
    return "State Transitions";
  }

  return NODE_CATEGORY_NAMES[
    categorySegment as SupportedDescriptorCategory | "Structural"
  ];
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

    const field = buildContentField(descriptor, attribute);
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
      Title: normalizeNpcNodeTitle(descriptor.Category, descriptor.Name),
      Color: CATEGORY_COLORS[descriptor.Category],
      Description: normalizeDescription(descriptor.ShortDescription),
      Inputs: inputs,
      Outputs: outputs.length > 0 ? outputs : undefined,
      Content: content.length > 0 ? content : undefined,
      Schema: Object.keys(schema).length > 0 ? schema : undefined,
    },
  };
}

function buildInstructionTemplates(
  instructionDescriptors: NpcDescriptor[],
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput[] {
  const standardDescriptor = instructionDescriptors.find(descriptor => descriptor.Name === "Instruction");
  const randomDescriptor = instructionDescriptors.find(descriptor => descriptor.Name === "Random");
  if (!standardDescriptor || !randomDescriptor) {
    throw new Error("Expected Instruction and Random instruction descriptors.");
  }

  return [
    buildStandardInstructionTemplate(
      standardDescriptor,
      outputAuthoredParentConnectionTypesByChildId,
    ),
    buildRandomInstructionTemplate(
      randomDescriptor,
      outputAuthoredParentConnectionTypesByChildId,
    ),
    buildWeightedInstructionTemplate(),
  ];
}

function buildStandardInstructionTemplate(
  descriptor: NpcDescriptor,
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput {
  const parentInputs = createParentCompatibilityInputs(
    [getInstructionTemplateParentTargetId()],
    outputAuthoredParentConnectionTypesByChildId,
  );
  const childInputs: NodePinDefinition[] = [];
  const outputs: NodePinDefinition[] = [];
  const schema: NonNullable<NodeTemplateDefinition["Schema"]> = {};
  const content: NodeContentDefinition[] = [];

  for (const attribute of descriptor.Attributes ?? []) {
    if (attribute.Name === "Weight") {
      continue;
    }

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

    const field = buildContentField(
      {
        Category: "Structural",
        Name: "Instruction",
      },
      attribute,
    );
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
      Description: normalizeDescription(descriptor.ShortDescription),
      Inputs: inputs,
      Outputs: outputs,
      Content: content,
      Schema: schema,
    },
  };
}

function buildRandomInstructionTemplate(
  descriptor: NpcDescriptor,
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
): TemplateOutput {
  const parentInputs = createParentCompatibilityInputs(
    [getInstructionTemplateParentTargetId()],
    outputAuthoredParentConnectionTypesByChildId,
  );
  const childInputs: NodePinDefinition[] = [];
  const outputs: NodePinDefinition[] = [];
  const schema: NonNullable<NodeTemplateDefinition["Schema"]> = {
    Type: "Random",
  };
  const content: NodeContentDefinition[] = [];

  for (const attribute of descriptor.Attributes ?? []) {
    if (attribute.Name === "Weight") {
      continue;
    }

    if (attribute.Name === "Instructions") {
      const pin = {
        Id: "WeightedInstructionsPin",
        Type: "WeightedInstruction",
        Color: CATEGORY_COLORS.Structural,
        Label: "Instructions",
        Description: normalizeDescription(attribute.ShortDescription),
        Multiple: true,
      } satisfies NodePinDefinition;
      outputs.push(pin);
      schema.Instructions = {
        Pin: pin.Id,
        Node: "Structural.WeightedInstruction",
      };
      continue;
    }

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

    const field = buildContentField(
      {
        Category: "Structural",
        Name: "RandomInstruction",
      },
      attribute,
    );
    if (!field) {
      continue;
    }

    content.push(field);
    schema[attribute.Name] = attribute.Name;
  }

  const inputs = orderInstructionInputs(childInputs, parentInputs);

  return {
    directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
    fileName: "RandomInstructionNode.json",
    template: {
      Id: "Structural.RandomInstructionNode",
      Title: "Random Instruction",
      Color: CATEGORY_COLORS.Structural,
      Description: normalizeDescription(descriptor.ShortDescription),
      Inputs: inputs,
      Outputs: outputs,
      Content: content,
      Schema: schema,
    },
  };
}

function buildWeightedInstructionTemplate(): TemplateOutput {
  return {
    directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
    fileName: "WeightedInstruction.json",
    template: {
      Id: "Structural.WeightedInstruction",
      Title: "Weighted Instruction",
      Color: CATEGORY_COLORS.Structural,
      Description: "A weighted wrapper for a random instruction entry.",
      Inputs: [
        {
          Id: "Input",
          Type: "WeightedInstruction",
          Color: CATEGORY_COLORS.Structural,
          Label: "Weighted Instruction",
        },
      ],
      Outputs: [
        {
          Id: "InstructionPin",
          Type: "Instruction",
          Color: CATEGORY_COLORS.Structural,
          Label: "Instruction",
        },
      ],
      Content: [
        {
          Id: "Weight",
          Type: "Float",
          Description: "Weighted chance of picking this instruction in a random instruction",
          Options: {
            Label: "Weight",
            Default: 1,
            Width: 88,
            Computable: true,
          },
        },
      ],
      Schema: {
        Weight: "Weight",
        Instruction: {
          Pin: "InstructionPin",
          Node: "InstructionVariants",
          SerializationType: "sibling",
          AllowComponentReferences: true,
        },
      },
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
      Content: [
        buildReferenceField(),
        buildReferenceNullableField(),
        buildReferenceInterfacesField(),
      ],
      Schema: {
        Reference: "Reference",
        Nullable: "Nullable",
        Interfaces: "Interfaces",
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
          Node: "InstructionVariants",
          SerializationType: "root",
        },
      },
    },
  };
}

function buildStateTransitionTemplates(): TemplateOutput[] {
  return [
    {
      directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
      fileName: "StateTransitionListRoot.json",
      template: {
        Id: "Structural.StateTransitionListRoot",
        Title: "State Transitions",
        Color: CATEGORY_COLORS.Structural,
        Description: "Root wrapper for a list of state transitions.",
        Outputs: [
          {
            Id: "StateTransitionsPin",
            Type: "StateTransition",
            Color: CATEGORY_COLORS.Structural,
            Label: "State Transitions",
            Multiple: true,
          },
        ],
        Schema: {
          StateTransitions: {
            Pin: "StateTransitionsPin",
            Node: "Structural.StateTransitionNode",
            SerializationType: "root",
          },
        },
      },
    },
    {
      directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
      fileName: "StateTransitionNode.json",
      template: {
        Id: "Structural.StateTransitionNode",
        Title: "State Transition",
        Color: CATEGORY_COLORS.Structural,
        Description: "A state transition with one or more state mappings and a shared action list.",
        Inputs: [
          {
            Id: "Input",
            Type: "StateTransition",
            Color: CATEGORY_COLORS.Structural,
            Label: "State Transition",
          },
          {
            Id: "StatesPin",
            Type: "StateTransitionMapping",
            Color: CATEGORY_COLORS.Structural,
            Label: "States",
            Multiple: true,
          },
        ],
        Outputs: [
          {
            Id: "ActionsPin",
            Type: "ActionListItem",
            Color: CATEGORY_COLORS.Action,
            Label: "Actions",
            Multiple: true,
          },
        ],
        Content: [
          {
            Id: "Enabled",
            Type: "Bool",
            Description: "Whether this transition is enabled.",
            Options: {
              Label: "Enabled",
              Default: true,
              Width: 18,
              Computable: true,
            },
          },
        ],
        Schema: {
          Enabled: "Enabled",
          States: {
            Pin: "StatesPin",
            Node: "Structural.StateTransitionMappingNode",
            SerializationType: "child",
          },
          Actions: {
            Pin: "ActionsPin",
            Node: "ActionVariants",
            SerializationType: "child",
            AllowComponentReferences: true,
          },
        },
      },
    },
    {
      directoryName: CATEGORY_DIRECTORY_NAMES.Structural,
      fileName: "StateTransitionMappingNode.json",
      template: {
        Id: "Structural.StateTransitionMappingNode",
        Title: "State Mapping",
        Color: CATEGORY_COLORS.Structural,
        Description: "Maps a list of source states to a list of destination states.",
        Outputs: [
          {
            Id: "Output",
            Type: "StateTransitionMapping",
            Color: CATEGORY_COLORS.Structural,
            Label: "State Mapping",
          },
        ],
        Content: [
          {
            Id: "From",
            Type: "List",
            Description: "Main states that can trigger this transition mapping.",
            Options: {
              Label: "From",
              Width: 220,
              StateAutocompleteKind: "role-main",
            },
          },
          {
            Id: "To",
            Type: "List",
            Description: "Main states that this mapping transitions into.",
            Options: {
              Label: "To",
              Width: 220,
              StateAutocompleteKind: "role-main",
            },
          },
          {
            Id: "Priority",
            Type: "Int",
            Description: "Optional mapping priority override.",
            Options: {
              Label: "Priority",
              Default: 0,
              Width: 88,
            },
          },
          {
            Id: "Enabled",
            Type: "Bool",
            Description: "Whether this mapping is enabled.",
            Options: {
              Label: "Enabled",
              Default: true,
              Width: 18,
              Computable: true,
            },
          },
        ],
        Schema: {
          From: "From",
          To: "To",
          Priority: "Priority",
          Enabled: "Enabled",
        },
      },
    },
  ];
}
