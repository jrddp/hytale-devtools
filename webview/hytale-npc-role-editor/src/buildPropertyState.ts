import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
import { resolveNpcDescriptorAssetSymbolLookup } from "@shared/npc-role-editor/assetSymbolLookup";
import type { IndexReference } from "@shared/indexTypes";
import type { NpcStateAutocompleteKind } from "@shared/npc-role-editor/stateAutocomplete";
import type {
  NpcComponentClass,
  NpcModifyJson,
  NpcParameterDefinitionJson,
  NpcParametersJson,
  NpcRoleJson,
  NpcRoleType,
} from "./parsing/documentTypes";
import { isNpcComputeJson, isRecord } from "./parsing/documentTypes";
import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";
import { isNpcRoleAttributeKey } from "./roleAttributes";
import {
  createRoleAttributeField,
  isEffectivelyRequiredRoleAttribute,
  resolveRoleDescriptor,
} from "./roleAttributeFields";
import type { NpcPropertyField, NpcPropertySection, NpcPropertyState } from "./propertyTypes";
import {
  cloneJsonLike,
  createDefaultParameterField,
  createVariantModifyOverrideFieldFromParent,
  humanize,
  inferItemTypeFromPrimitiveList,
  isPrimitiveListItem,
  normalizeFlagValue,
  normalizeTypeHint,
  toOptionalDisplayString,
} from "./propertyFieldUtilities";
import {
  createRichObjectField,
  createStateTransitionsField,
  describeRichObjectShape,
  isContentWrapperShape,
} from "./structuredFields";

const SECTION_NAMES: Record<NpcPropertySection["id"], string> = {
  parameters: "Parameters",
  roleAttributes: "Role Attributes",
  variantReference: "Variant Reference",
  modify: "Modify",
  componentMeta: "Component Metadata",
  content: "Content",
  instructions: "Instructions",
  interactionInstruction: "Interaction Instruction",
  deathInstruction: "Death Instruction",
  motionControllerList: "Motion Controllers",
  stateTransitions: "State Transitions",
};

export function buildNpcPropertyState({
  document,
  topLevelKeyOrder,
  descriptors,
  variantReferenceParameters = [],
}: {
  document: NpcRoleJson;
  topLevelKeyOrder: string[];
  descriptors: NpcDescriptorDocument;
  variantReferenceParameters?: NpcPropertyField[];
}): NpcPropertyState {
  const roleType = document.Type;
  const componentClass =
    roleType === "Component" && typeof document.Class === "string"
      ? (document.Class as NpcComponentClass)
      : null;
  const sections: NpcPropertySection[] = [];

  const variantReferenceSection = buildVariantReferenceSection(document);
  if (variantReferenceSection) {
    sections.push(variantReferenceSection);
  }

  const modifySection = buildModifySection(document, variantReferenceParameters);
  if (modifySection) {
    sections.push(modifySection);
  }

  if (shouldIncludeParametersSection(roleType)) {
    sections.push(buildParametersSection(document, roleType));
  }

  if (roleType === "Generic" || roleType === "Abstract") {
    sections.push(buildTopLevelInstructionSection(document, "instructions"));
    sections.push(buildTopLevelInstructionSection(document, "interactionInstruction"));
    sections.push(buildTopLevelInstructionSection(document, "deathInstruction"));
    sections.push(buildStateTransitionsSection(document, descriptors));
    sections.push(buildMotionControllerListSection(document, descriptors));
  }

  const contentSection = buildContentSection(document, descriptors);
  if (contentSection) {
    sections.push(contentSection);
  }

  const roleAttributeSection = buildRoleAttributesSection(document, descriptors);
  if (roleAttributeSection) {
    sections.push(roleAttributeSection);
  }

  return {
    roleType,
    componentClass,
    sections,
    preservedTopLevelFields: buildPreservedTopLevelFields(document),
    topLevelKeyOrder: [...topLevelKeyOrder],
  };
}

export function buildNpcPropertySections(
  document: NpcRoleJson,
  descriptors: NpcDescriptorDocument,
  parameterUsageIndex: ParameterUsageIndex,
  variantReferenceParameters: NpcPropertyField[] = [],
): NpcPropertySection[] {
  const state = buildNpcPropertyState({
    document,
    topLevelKeyOrder: Object.keys(document),
    descriptors,
    variantReferenceParameters,
  });

  applyNpcPropertySectionDerivedState(state.sections, parameterUsageIndex, descriptors);
  return state.sections;
}

export function applyNpcPropertySectionDerivedState(
  sections: NpcPropertySection[],
  parameterUsageIndex: ParameterUsageIndex,
  descriptors: NpcDescriptorDocument = [],
): void {
  const roleAttributeSymbolRefsByKey = new Map<string, IndexReference>();
  const roleAttributeSection = sections.find(section => section.id === "roleAttributes");

  for (const field of roleAttributeSection?.fields ?? []) {
    if (field.symbolRef) {
      roleAttributeSymbolRefsByKey.set(field.key, field.symbolRef);
    }
  }

  for (const [key, symbolRef] of getDescriptorRoleAttributeSymbolRefsByKey(descriptors)) {
    if (!roleAttributeSymbolRefsByKey.has(key)) {
      roleAttributeSymbolRefsByKey.set(key, symbolRef);
    }
  }

  const parameterSection = sections.find(section => section.id === "parameters");
  if (parameterSection) {
    for (const field of parameterSection.fields) {
      field.symbolRef = resolveParameterSymbolRef(
        field.key,
        roleAttributeSymbolRefsByKey,
        parameterUsageIndex,
      );
    }
  }

  const modifySection = sections.find(section => section.id === "modify");
  for (const field of modifySection?.fields ?? []) {
    if (field.symbolRef || field.staticSuggestions?.length) {
      continue;
    }

    field.symbolRef = resolveModifyFieldSymbolRef(
      field.key,
      field.fieldPath,
      roleAttributeSymbolRefsByKey,
      parameterUsageIndex,
    );
  }
}

function shouldIncludeParametersSection(roleType: NpcRoleType): boolean {
  return (
    roleType === "Generic" ||
    roleType === "Abstract" ||
    roleType === "Variant" ||
    roleType === "Component"
  );
}

function buildParametersSection(
  document: NpcRoleJson,
  roleType: NpcRoleType,
): NpcPropertySection {
  const parameters = isRecord(document.Parameters)
    ? (document.Parameters as NpcParametersJson)
    : undefined;
  const keyOrder = parameters ? Object.keys(parameters) : [];
  const preservedFields: Record<string, unknown> = {};
  const fields: NpcPropertyField[] = [];

  if (roleType === "Component") {
    fields.push(createImportStatesField(parameters));
  }

  if (parameters) {
    for (const [parameterName, parameterValue] of Object.entries(parameters)) {
      if (parameterName === "_ImportStates") {
        continue;
      }

      if (!isParameterDefinitionJson(parameterValue) || parameterName.startsWith("_")) {
        preservedFields[parameterName] = cloneJsonLike(parameterValue);
        continue;
      }

      fields.push(createParameterField(parameterName, parameterValue));
    }
  }

  return {
    id: "parameters",
    name: SECTION_NAMES.parameters,
    description:
      roleType === "Component"
        ? "Template parameter values and imported parent-state slots."
        : "Template parameter values.",
    reorderable: true,
    fields,
    preservedFields,
    keyOrder,
    ui: {},
  };
}

function buildTopLevelInstructionSection(
  document: NpcRoleJson,
  sectionId: "instructions" | "interactionInstruction" | "deathInstruction",
): NpcPropertySection {
  const key =
    sectionId === "instructions"
      ? "Instructions"
      : sectionId === "interactionInstruction"
        ? "InteractionInstruction"
        : "DeathInstruction";
  const rawValue = document[key];

  return {
    id: sectionId,
    name: SECTION_NAMES[sectionId],
    description:
      sectionId === "instructions"
        ? "Top-level ordered instruction list for the role."
        : sectionId === "interactionInstruction"
        ? "Single root instruction that controls interaction availability and interaction-side effects."
        : "Single root instruction that runs when the NPC dies.",
    fields: [
      {
        id: `top-level-${key}`,
        key,
        label: SECTION_NAMES[sectionId],
        fieldPath: key,
        kind: "graph",
        rootType: sectionId === "instructions" ? "Instructions" : "Instruction",
        value: {
          kind: "literal",
          value: cloneJsonLike(rawValue ?? (sectionId === "instructions" ? [] : {})),
        },
        description: undefined,
        computable: false,
        canRename: false,
        canChangeType: false,
        canUnset: true,
        isDescriptionEditable: false,
        isSet: rawValue !== undefined,
        preservedData:
          sectionId === "instructions"
            ? buildTopLevelGraphRootMetadata(document)
            : undefined,
        ui: {},
      },
    ],
    ui: {},
  };
}

function buildTopLevelGraphRootMetadata(document: NpcRoleJson): Record<string, unknown> | undefined {
  const preservedData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith("$")) {
      preservedData[key] = cloneJsonLike(value);
    }
  }

  return Object.keys(preservedData).length > 0 ? preservedData : undefined;
}

function buildMotionControllerListSection(
  document: NpcRoleJson,
  descriptors: NpcDescriptorDocument,
): NpcPropertySection {
  return {
    id: "motionControllerList",
    name: SECTION_NAMES.motionControllerList,
    description: "Ordered list of motion controller definitions for the role.",
    fields: [
      createRichObjectField({
        key: "MotionControllerList",
        label: "Motion Controllers",
        fieldPath: "MotionControllerList",
        shapeKey: "MotionControllerList",
        value: document.MotionControllerList,
        descriptors,
        description: "Ordered list of motion controllers.",
        canUnset: true,
        isSet: document.MotionControllerList !== undefined,
      }),
    ],
    ui: {},
  };
}

function buildStateTransitionsSection(
  document: NpcRoleJson,
  descriptors: NpcDescriptorDocument,
): NpcPropertySection {
  return {
    id: "stateTransitions",
    name: SECTION_NAMES.stateTransitions,
    description: "Ordered list of state transitions and the actions that run when they fire.",
    fields: [createStateTransitionsField(document.StateTransitions, descriptors)],
    ui: {},
  };
}

function buildContentSection(
  document: NpcRoleJson,
  descriptors: NpcDescriptorDocument,
): NpcPropertySection | null {
  if (document.Type !== "Component") {
    return null;
  }

  const componentClass = typeof document.Class === "string" ? document.Class : undefined;
  const contentValue = document.Content;
  const field = createComponentContentField({
    componentClass,
    value: contentValue,
    descriptors,
  });

  return {
    id: "content",
    name: SECTION_NAMES.content,
    description: "Component behavior/content definition.",
    fields: [field],
    ui: {},
  };
}

function createComponentContentField({
  componentClass,
  value,
  descriptors,
}: {
  componentClass?: string;
  value: unknown;
  descriptors: NpcDescriptorDocument;
}): NpcPropertyField {
  if (isContentWrapperShape(value)) {
    return createRawJsonContentField({
      kind: "rawJson",
      value,
      description:
        "Component content reference/wrapper editing is deferred for now. This value is preserved as raw JSON.",
    });
  }

  switch (componentClass) {
    case "Instruction":
    case "Sensor":
      return createRawJsonContentField({
        kind: "graph",
        value,
        rootType: componentClass,
        description:
          "This component will eventually use an embedded graph editor. This slice keeps the underlying JSON editable.",
      });
    case "Action":
    case "ActionList":
    case "BodyMotion":
    case "HeadMotion":
    case "Path":
      return createRichObjectField({
        key: "Content",
        label: "Content",
        fieldPath: "Content",
        shapeKey: componentClass,
        value,
        descriptors,
        description: describeRichObjectShape(componentClass, descriptors),
        canUnset: false,
        isSet: value !== undefined,
      });
    default:
      return createRawJsonContentField({
        kind: "rawJson",
        value,
        description:
          "This component class does not have a structured content editor yet. The value is preserved as raw JSON.",
      });
  }
}

function createRawJsonContentField({
  kind,
  value,
  rootType,
  description,
}: {
  kind: "rawJson" | "graph";
  value: unknown;
  rootType?: string;
  description: string;
}): NpcPropertyField {
  return {
    id: "component-content",
    key: "Content",
    label: "Content",
    fieldPath: "Content",
    kind,
    rootType,
    value: {
      kind: "literal",
      value: cloneJsonLike(value ?? {}),
    },
    description,
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset: false,
    isDescriptionEditable: false,
    isSet: value !== undefined,
    ui: {},
  };
}

function buildRoleAttributesSection(
  document: NpcRoleJson,
  descriptors: NpcDescriptorDocument,
): NpcPropertySection | null {
  if (document.Type !== "Generic" && document.Type !== "Abstract") {
    return null;
  }

  const roleDescriptor = resolveRoleDescriptor(document.Type, descriptors);
  const parameters = isRecord(document.Parameters)
    ? (document.Parameters as NpcParametersJson)
    : undefined;
  const fields: NpcPropertyField[] = [];
  const includedKeys = new Set<string>();

  for (const [key, value] of Object.entries(document)) {
    if (!isNpcRoleAttributeKey(key)) {
      continue;
    }

    const descriptorAttribute = roleDescriptor?.Attributes?.find(attribute => attribute.Name === key);
    const parameterDefinition = isParameterDefinitionJson(parameters?.[key])
      ? (parameters?.[key] as NpcParameterDefinitionJson)
      : undefined;
    fields.push(
      createRoleAttributeField({
        key,
        value,
        descriptorAttribute,
        parameterDefinition,
        isSet: true,
      }),
    );
    includedKeys.add(key);
  }

  for (const descriptorAttribute of roleDescriptor?.Attributes ?? []) {
    if (
      !isEffectivelyRequiredRoleAttribute(descriptorAttribute.Name, descriptorAttribute) ||
      includedKeys.has(descriptorAttribute.Name) ||
      !isNpcRoleAttributeKey(descriptorAttribute.Name)
    ) {
      continue;
    }

    fields.push(
      createRoleAttributeField({
        key: descriptorAttribute.Name,
        value: undefined,
        descriptorAttribute,
        parameterDefinition: isParameterDefinitionJson(parameters?.[descriptorAttribute.Name])
          ? (parameters?.[descriptorAttribute.Name] as NpcParameterDefinitionJson)
          : undefined,
        isSet: false,
      }),
    );
  }

  if (fields.length === 0) {
    const hasAvailableRoleAttributes = (roleDescriptor?.Attributes ?? []).some(
      descriptorAttribute => isNpcRoleAttributeKey(descriptorAttribute.Name),
    );
    if (!hasAvailableRoleAttributes) {
      return null;
    }
  }

  const orderedFields = [
    ...fields.filter(field => field.required === true),
    ...fields.filter(field => field.required !== true),
  ];

  return {
    id: "roleAttributes",
    name: SECTION_NAMES.roleAttributes,
    description: "Top-level role settings surfaced from the current NPC role document.",
    fields: orderedFields,
    ui: {},
  };
}

function createImportStatesField(parameters: NpcParametersJson | undefined): NpcPropertyField {
  const importStatesValue = Array.isArray(parameters?._ImportStates)
    ? parameters._ImportStates.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: "parameter-import-states",
    key: "_ImportStates",
    label: "Import States",
    fieldPath: "Parameters._ImportStates",
    kind: "list",
    value: {
      kind: "literal",
      value: importStatesValue,
    },
    description:
      "Ordered aliases for parent NPC states this component imports. These map by index to a reference's _ExportStates.",
    itemType: "string",
    canRename: false,
    canChangeType: false,
    canUnset: false,
    isDescriptionEditable: false,
    computable: false,
    isSet: Array.isArray(parameters?._ImportStates),
    stateAutocompleteKind: "component-parent-alias",
    ui: {},
  };
}

function createParameterField(
  parameterName: string,
  definition: NpcParameterDefinitionJson,
): NpcPropertyField {
  const { kind, value, itemType } = parseParameterFieldShape(definition);
  const preservedData: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(definition)) {
    if (key === "Value" || key === "Description" || key === "TypeHint") {
      continue;
    }

    preservedData[key] = cloneJsonLike(childValue);
  }

  return {
    id: `parameter-${parameterName}`,
    key: parameterName,
    label: parameterName,
    fieldPath: `Parameters.${parameterName}.Value`,
    kind,
    value,
    description: toOptionalDisplayString(definition.Description),
    canRename: true,
    canChangeType: true,
    canUnset: true,
    isDescriptionEditable: true,
    computable: true,
    isSet: true,
    itemType,
    preservedData,
    ui: {},
  };
}

function buildVariantReferenceSection(document: NpcRoleJson): NpcPropertySection | null {
  if (document.Type !== "Variant") {
    return null;
  }

  const fields: NpcPropertyField[] = [];
  const referenceValue = document.Reference;
  fields.push({
    id: "variant-reference-reference",
    key: "Reference",
    label: "Reference",
    fieldPath: "Reference",
    kind: "string",
    value:
      typeof referenceValue === "string"
        ? { kind: "literal", value: referenceValue }
        : isNpcComputeJson(referenceValue)
          ? { kind: "compute", expression: referenceValue.Compute }
          : { kind: "literal", value: "" },
    description: "The parent NPC role or template this variant extends.",
    canRename: false,
    canChangeType: false,
    canUnset: typeof referenceValue !== "undefined",
    isDescriptionEditable: false,
    computable: false,
    isSet: typeof referenceValue !== "undefined",
    symbolRef: {
      indexKind: "registeredAssets",
      key: "NPCRole",
      filter: {
        npcRoleTypes: ["Generic", "Abstract", "Variant"],
      },
    },
    ui: {},
  });

  return {
    id: "variantReference",
    name: SECTION_NAMES.variantReference,
    description: "The parent NPC role or template this variant extends.",
    fields,
    ui: {},
  };
}

function buildModifySection(
  document: NpcRoleJson,
  variantReferenceParameters: NpcPropertyField[],
): NpcPropertySection | null {
  if (document.Type !== "Variant") {
    return null;
  }

  const modify = isRecord(document.Modify) ? (document.Modify as NpcModifyJson) : undefined;
  const inheritedFieldsByKey = new Map(
    variantReferenceParameters.map(field => [field.key, field] as const),
  );
  const fields: NpcPropertyField[] = [];
  const preservedFields: Record<string, unknown> = {};
  const keyOrder = modify ? Object.keys(modify) : [];

  if (modify) {
    for (const [key, value] of Object.entries(modify)) {
      if (key.startsWith("_")) {
        if (key === "_CombatConfig" || key === "_InteractionVars") {
          fields.push(createSpecialVariantModifierField(key, value));
        } else {
          preservedFields[key] = cloneJsonLike(value);
        }
        continue;
      }

      fields.push(
        createVariantModifyField({
          key,
          value,
          inheritedField: inheritedFieldsByKey.get(key),
        }),
      );
    }
  }

  return {
    id: "modify",
    name: SECTION_NAMES.modify,
    description: "Parameter overrides applied to the referenced parent role.",
    fields,
    preservedFields,
    keyOrder,
    ui: {},
  };
}

function createVariantModifyField({
  key,
  value,
  inheritedField,
}: {
  key: string;
  value: unknown;
  inheritedField?: NpcPropertyField;
}): NpcPropertyField {
  const parsedShape = parseVariantModifyFieldShape(value, inheritedField);

  return {
    id: `variant-modify-${key}`,
    key,
    label: humanize(key) ?? key,
    fieldPath: `Modify.${key}`,
    kind: parsedShape.kind,
    value: parsedShape.value,
    description: inheritedField?.description,
    computable: true,
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    isSet: true,
    itemType: parsedShape.itemType,
    staticSuggestions: inheritedField?.staticSuggestions ? [...inheritedField.staticSuggestions] : undefined,
    symbolRef: inheritedField?.symbolRef ? { ...inheritedField.symbolRef } : undefined,
    stateAutocompleteKind: inheritedField?.stateAutocompleteKind,
    animationAutocompleteKind: inheritedField?.animationAutocompleteKind,
    ui: {},
  };
}

function createSpecialVariantModifierField(key: string, value: unknown): NpcPropertyField {
  return {
    id: `variant-modifier-${key}`,
    key,
    label: humanize(key) ?? key,
    fieldPath: `Modify.${key}`,
    kind: "rawJson",
    value: {
      kind: "literal",
      value: cloneJsonLike(value ?? {}),
    },
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    computable: false,
    isSet: true,
    ui: {},
  };
}

function parseParameterFieldShape(
  definition: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (isNpcComputeJson(definition.Value)) {
    return {
      kind: "string",
      value: {
        kind: "compute",
        expression: definition.Value.Compute,
      },
    };
  }

  return inferLiteralFieldShape(definition.Value, normalizeTypeHint(definition.TypeHint));
}

function parseVariantModifyFieldShape(
  value: unknown,
  inheritedField?: NpcPropertyField,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (isNpcComputeJson(value)) {
    return {
      kind: inheritedField?.kind ?? "string",
      value: {
        kind: "compute",
        expression: value.Compute,
      },
      itemType: inheritedField?.itemType,
    };
  }

  return inferLiteralFieldShape(value, inheritedField?.itemType);
}

function buildPreservedTopLevelFields(document: NpcRoleJson): Record<string, unknown> {
  const preservedTopLevelFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(document)) {
    if (key === "Type" || key === "Parameters") {
      continue;
    }

    if (document.Type === "Variant" && (key === "Reference" || key === "Modify")) {
      continue;
    }

    if (document.Type === "Component" && (key === "Class" || key === "Content")) {
      continue;
    }

    if (
      (document.Type === "Generic" || document.Type === "Abstract") &&
      (key === "Instructions" ||
        key === "InteractionInstruction" ||
        key === "DeathInstruction" ||
        key === "MotionControllerList" ||
        key === "StateTransitions")
    ) {
      continue;
    }

    if ((document.Type === "Generic" || document.Type === "Abstract") && key.startsWith("$")) {
      continue;
    }

    if ((document.Type === "Generic" || document.Type === "Abstract") && isNpcRoleAttributeKey(key)) {
      continue;
    }

    preservedTopLevelFields[key] = cloneJsonLike(value);
  }

  return preservedTopLevelFields;
}

function resolveFieldSymbolRef(
  descriptorAttribute?: NpcDescriptorAttribute,
): IndexReference | undefined {
  return resolveNpcDescriptorAssetSymbolLookup(descriptorAttribute);
}

function getDescriptorRoleAttributeSymbolRefsByKey(
  descriptors: NpcDescriptorDocument,
): Map<string, IndexReference> {
  const roleAttributeSymbolRefsByKey = new Map<string, IndexReference>();
  const roleDescriptor = resolveRoleDescriptor("Generic", descriptors);

  for (const descriptorAttribute of roleDescriptor?.Attributes ?? []) {
    if (!isNpcRoleAttributeKey(descriptorAttribute.Name)) {
      continue;
    }

    const symbolRef = resolveFieldSymbolRef(descriptorAttribute);
    if (symbolRef) {
      roleAttributeSymbolRefsByKey.set(descriptorAttribute.Name, symbolRef);
    }
  }

  return roleAttributeSymbolRefsByKey;
}

function resolveParameterSymbolRef(
  parameterName: string,
  roleAttributeSymbolRefsByKey: Map<string, IndexReference>,
  parameterUsageIndex: ParameterUsageIndex,
): IndexReference | undefined {
  const translatedRoleAttributeKeys = [...parameterUsageIndex.directTranslationByFieldPath.entries()]
    .filter(([, directTranslationParameter]) => directTranslationParameter === parameterName)
    .map(([fieldPath]) => resolveRoleAttributeKeyForFieldPath(fieldPath, roleAttributeSymbolRefsByKey))
    .filter((key): key is string => key !== undefined);
  const uniqueTranslatedKeys = [...new Set(translatedRoleAttributeKeys)];

  if (uniqueTranslatedKeys.length !== 1) {
    return undefined;
  }

  return roleAttributeSymbolRefsByKey.get(uniqueTranslatedKeys[0]);
}

function resolveModifyFieldSymbolRef(
  fieldKey: string,
  fieldPath: string,
  roleAttributeSymbolRefsByKey: Map<string, IndexReference>,
  parameterUsageIndex: ParameterUsageIndex,
): IndexReference | undefined {
  const directTranslationParameter = parameterUsageIndex.directTranslationByFieldPath.get(fieldPath);
  if (directTranslationParameter) {
    const translatedRoleAttributeKeys = [...parameterUsageIndex.directTranslationByFieldPath.entries()]
      .filter(([, parameterName]) => parameterName === directTranslationParameter)
      .map(([candidateFieldPath]) =>
        resolveRoleAttributeKeyForFieldPath(candidateFieldPath, roleAttributeSymbolRefsByKey),
      )
      .filter((key): key is string => key !== undefined);
    const uniqueTranslatedKeys = [...new Set(translatedRoleAttributeKeys)];

    if (uniqueTranslatedKeys.length === 1) {
      return roleAttributeSymbolRefsByKey.get(uniqueTranslatedKeys[0]);
    }
  }

  return roleAttributeSymbolRefsByKey.get(fieldKey);
}

function resolveRoleAttributeKeyForFieldPath(
  fieldPath: string,
  roleAttributeSymbolRefsByKey: Map<string, IndexReference>,
): string | undefined {
  if (roleAttributeSymbolRefsByKey.has(fieldPath)) {
    return fieldPath;
  }

  if (fieldPath.startsWith("Modify.")) {
    const fieldKey = fieldPath.slice("Modify.".length);
    if (roleAttributeSymbolRefsByKey.has(fieldKey)) {
      return fieldKey;
    }
  }

  return undefined;
}


function inferLiteralFieldShape(
  value: unknown,
  fallbackItemType?: "string" | "number" | "boolean",
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (typeof value === "boolean") {
    return {
      kind: "boolean",
      value: { kind: "literal", value },
    };
  }

  if (typeof value === "number") {
    return {
      kind: "number",
      value: { kind: "literal", value },
    };
  }

  if (typeof value === "string") {
    return {
      kind: "string",
      value: { kind: "literal", value },
    };
  }

  if (Array.isArray(value) && value.every(isPrimitiveListItem)) {
    return {
      kind: "list",
      value: { kind: "literal", value: cloneJsonLike(value) },
      itemType: inferItemTypeFromPrimitiveList(value) ?? fallbackItemType ?? "string",
    };
  }

  if (Array.isArray(value) && value.length === 0) {
    return {
      kind: "list",
      value: { kind: "literal", value: [] },
      itemType: fallbackItemType ?? "string",
    };
  }

  return {
    kind: "rawJson",
    value: { kind: "literal", value: cloneJsonLike(value) },
  };
}

function isParameterDefinitionJson(value: unknown): value is NpcParameterDefinitionJson {
  return isRecord(value) && "Value" in value;
}
