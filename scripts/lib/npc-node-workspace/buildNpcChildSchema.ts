import type { NpcDescriptor, NpcDescriptorAttribute } from "../../../src/shared/npc-role-editor/descriptorTypes";
import {
  NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE,
  type NpcBehaviorConnectionType,
  getNpcBehaviorChildConnectionType,
  getNpcBehaviorChildDomain,
  getNpcBehaviorChildDomainDefinition,
  getNpcBehaviorChildPinSide,
  getNpcBehaviorConnectionAuthoringSide,
  getNpcBehaviorConnectionColor,
  getNpcBehaviorDescriptorSelfConnectionType,
} from "../../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import type { NodePinDefinition } from "../../../src/node-editor/workspaceDefinitionTypes";
import {
  mergeAttributes,
  normalizeDescription,
  type ChildSpec,
  type OutputAuthoredParentConnectionTypesByChildId,
  type SupportedDescriptorCategory,
} from "./npcNodeWorkspaceModel";

export function resolveInstructionChildSpec(attribute: NpcDescriptorAttribute): ChildSpec | null {
  return resolveChildSpec({ Category: "Structural", Name: "Instruction" }, attribute);
}

export function resolveChildSpec(
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
    allowComponentReferences: shouldAllowComponentReferencesForDomain(domain),
  };
}

export function getDescriptorTemplateParentTargetIds(
  descriptor: NpcDescriptor & { Category: SupportedDescriptorCategory },
): string[] {
  const childDefinition = getNpcBehaviorChildDomainDefinition(descriptor.Category);
  return childDefinition ? [childDefinition.childId] : [];
}

export function getInstructionTemplateParentTargetId(): string {
  const childDefinition = getNpcBehaviorChildDomainDefinition("Instruction");
  if (!childDefinition) {
    throw new Error("Instruction child domain definition is missing.");
  }

  return childDefinition.childId;
}

export function createParentCompatibilityInputs(
  childTargetIds: readonly string[],
  outputAuthoredParentConnectionTypesByChildId: OutputAuthoredParentConnectionTypesByChildId,
  options?: {
    label?: string;
  },
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

  return collapseParentCompatibilityConnectionTypes(Array.from(connectionTypes))
    .sort((left, right) => left.localeCompare(right))
    .map((connectionType, index) =>
      createParentCompatibilityInputPin(connectionType, index, options?.label),
    );
}

export function createSelfOutputPin(connectionType: NpcBehaviorConnectionType): NodePinDefinition {
  return {
    Id: "Output",
    Type: connectionType,
    Color: getNpcBehaviorConnectionColor(connectionType),
    Label: "For",
  };
}

export function shouldEmitSelfOutputPin(
  category: SupportedDescriptorCategory,
  descriptorName: string,
): boolean {
  const selfConnectionType = getNpcBehaviorDescriptorSelfConnectionType(category, descriptorName);
  return getNpcBehaviorConnectionAuthoringSide(selfConnectionType) === "input";
}

export function collectOutputAuthoredParentConnectionTypesByChildId(
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

export function createChildPinDefinition(
  attribute: NpcDescriptorAttribute,
  childSpec: ChildSpec,
): NodePinDefinition {
  return {
    Id: `${attribute.Name}Pin`,
    Type: childSpec.connectionType,
    Color: getNpcBehaviorConnectionColor(childSpec.connectionType),
    Label: normalizeChildPinLabel(attribute.Name),
    Description: normalizeDescription(attribute.ShortDescription),
    Multiple: childSpec.multiplicity === "multiple" || undefined,
    Required: isRequiredChildAttribute(attribute) || undefined,
  };
}

function isRequiredChildAttribute(attribute: NpcDescriptorAttribute): boolean {
  if (attribute.Required === "REQUIRED") {
    return true;
  }

  const validator = attribute.Validator;
  return (
    typeof validator === "object" &&
    validator !== null &&
    "Type" in validator &&
    (validator as { Type?: unknown }).Type === "ArrayNotEmpty"
  );
}

function shouldAllowComponentReferencesForDomain(domain: string): boolean {
  return (
    domain === "Action" ||
    domain === "ActionList" ||
    domain === "BodyMotion" ||
    domain === "HeadMotion" ||
    domain === "Instruction" ||
    domain === "Path" ||
    domain === "Sensor"
  );
}

function collapseParentCompatibilityConnectionTypes(
  connectionTypes: NpcBehaviorConnectionType[],
): NpcBehaviorConnectionType[] {
  return connectionTypes.filter(connectionType => {
    return !connectionTypes.some(
      otherType =>
        otherType !== connectionType &&
        getNpcBehaviorWorkspaceConnectionAncestors(connectionType).includes(otherType),
    );
  });
}

function getNpcBehaviorWorkspaceConnectionAncestors(
  connectionType: NpcBehaviorConnectionType,
): NpcBehaviorConnectionType[] {
  const visited = new Set<NpcBehaviorConnectionType>();
  const ancestors: NpcBehaviorConnectionType[] = [];
  const pending = [
    ...(NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE[connectionType]?.Extends ?? []),
  ] as NpcBehaviorConnectionType[];

  while (pending.length > 0) {
    const next = pending.pop()!;
    if (visited.has(next)) {
      continue;
    }
    visited.add(next);
    ancestors.push(next);
    pending.push(
      ...((NPC_BEHAVIOR_CONNECTION_TYPES_FOR_WORKSPACE[next]?.Extends ?? []) as NpcBehaviorConnectionType[]),
    );
  }

  return ancestors;
}

function createParentCompatibilityInputPin(
  connectionType: NpcBehaviorConnectionType,
  index: number,
  label?: string,
): NodePinDefinition {
  return {
    Id: index === 0 ? "Input" : `Input${index}`,
    Type: connectionType,
    Color: getNpcBehaviorConnectionColor(connectionType),
    Label: label ?? "Parent",
  };
}

function normalizeChildPinLabel(attributeName: string): string {
  switch (attributeName) {
    case "BodyMotion":
      return "Body Motion";
    case "HeadMotion":
      return "Head Motion";
    case "ValueToParameterMappings":
      return "Parameter Mappings";
    default:
      return attributeName;
  }
}
