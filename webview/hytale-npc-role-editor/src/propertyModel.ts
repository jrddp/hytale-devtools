import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
import type { IndexReference } from "@shared/indexTypes";
import type {
  NpcComponentClass,
  NpcComputeJson,
  NpcJsonValue,
  NpcModifyJson,
  NpcParameterDefinitionJson,
  NpcParametersJson,
  NpcRoleJson,
  NpcRoleType,
} from "./parsing/documentTypes";
import { isNpcComputeJson, isRecord } from "./parsing/documentTypes";
import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";
import { isNpcRoleAttributeKey } from "./roleAttributes";

export type NpcFieldValue =
  | { kind: "literal"; value: unknown }
  | { kind: "compute"; expression: string };

export type NpcFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "list"
  | "rawJson"
  | "graph";

export type NpcSectionId =
  | "parameters"
  | "roleAttributes"
  | "variantReference"
  | "modify"
  | "componentMeta"
  | "content";

export type NpcFieldUiState = {
  collapsed?: boolean;
};

export type NpcSectionUiState = {
  collapsed?: boolean;
};

export type NpcPropertyField = {
  id: string;
  key: string;
  label: string;
  fieldPath: string;
  kind: NpcFieldKind;
  value: NpcFieldValue;
  description?: string;
  required?: boolean;
  isSet?: boolean;
  computable?: boolean;
  canRename?: boolean;
  canChangeType?: boolean;
  canUnset?: boolean;
  isDescriptionEditable?: boolean;
  itemType?: "string" | "number" | "boolean";
  staticSuggestions?: string[];
  symbolRef?: IndexReference;
  preservedData?: Record<string, unknown>;
  ui?: NpcFieldUiState;
};

export type NpcPropertySection = {
  id: NpcSectionId;
  name: string;
  description?: string;
  reorderable?: boolean;
  fields: NpcPropertyField[];
  preservedFields?: Record<string, unknown>;
  keyOrder?: string[];
  ui?: NpcSectionUiState;
};

export type NpcPropertyState = {
  roleType: NpcRoleType;
  componentClass: NpcComponentClass | null;
  sections: NpcPropertySection[];
  preservedTopLevelFields: Record<string, unknown>;
  topLevelKeyOrder: string[];
};

const DOMAIN_TO_REGISTERED_ASSET_KEY: Record<string, string> = {
  Model: "ModelAsset",
  Item: "Item",
  Role: "NPCRole",
  Interaction: "RootInteraction",
  BlockSet: "BlockSet",
  ItemDropList: "ItemDropList",
  AttitudeGroup: "AttitudeGroup",
  ItemAttitudeGroup: "ItemAttitudeGroup",
};

const SECTION_NAMES: Record<NpcSectionId, string> = {
  parameters: "Parameters",
  roleAttributes: "Role Attributes",
  variantReference: "Variant Reference",
  modify: "Modify",
  componentMeta: "Component Metadata",
  content: "Content",
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
  discoveredStates: string[],
  variantReferenceParameters: NpcPropertyField[] = [],
): NpcPropertySection[] {
  const state = buildNpcPropertyState({
    document,
    topLevelKeyOrder: Object.keys(document),
    descriptors,
    variantReferenceParameters,
  });

  applyNpcPropertySectionDerivedState(state.sections, parameterUsageIndex, discoveredStates);
  return state.sections;
}

export function applyNpcPropertySectionDerivedState(
  sections: NpcPropertySection[],
  parameterUsageIndex: ParameterUsageIndex,
  discoveredStates: string[],
): void {
  const roleAttributeSymbolRefsByFieldPath = new Map<string, IndexReference>();
  const roleAttributeSection = sections.find(section => section.id === "roleAttributes");

  for (const field of roleAttributeSection?.fields ?? []) {
    if (field.symbolRef) {
      roleAttributeSymbolRefsByFieldPath.set(field.fieldPath, field.symbolRef);
    }
  }

  const parameterSection = sections.find(section => section.id === "parameters");
  if (!parameterSection) {
    return;
  }

  for (const field of parameterSection.fields) {
    if (field.key === "_ImportStates") {
      field.staticSuggestions = [...discoveredStates];
      continue;
    }

    field.symbolRef = resolveParameterSymbolRef(
      field.key,
      roleAttributeSymbolRefsByFieldPath,
      parameterUsageIndex,
    );
  }
}

export function serializeNpcPropertyState(state: NpcPropertyState): NpcRoleJson {
  const root = new Map<string, unknown>();
  root.set("Type", state.roleType);

  if (state.roleType === "Component" && state.componentClass) {
    root.set("Class", state.componentClass);
  }

  for (const section of state.sections) {
    switch (section.id) {
      case "parameters": {
        const serializedParameters = serializeParametersSection(section);
        if (serializedParameters) {
          root.set("Parameters", serializedParameters);
        }
        break;
      }
      case "roleAttributes": {
        for (const field of section.fields) {
          if (field.isSet === false) {
            continue;
          }

          root.set(field.key, serializeFieldValue(field.value));
        }
        break;
      }
      case "variantReference": {
        for (const field of section.fields) {
          if (field.isSet === false) {
            continue;
          }

          root.set(field.key, serializeFieldValue(field.value));
        }
        break;
      }
      case "modify": {
        const serializedModify = serializeModifySection(section);
        if (serializedModify) {
          root.set("Modify", serializedModify);
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [key, value] of Object.entries(state.preservedTopLevelFields)) {
    if (!root.has(key)) {
      root.set(key, cloneJsonLike(value));
    }
  }

  return Object.fromEntries(root) as NpcRoleJson;
}

export function getNpcFieldTypeLabel(field: NpcPropertyField): string {
  if (field.value.kind === "compute") {
    return "Compute";
  }

  switch (field.kind) {
    case "string":
      return "String";
    case "number":
      return "Number";
    case "boolean":
      return "Boolean";
    case "list":
      if (field.itemType === "number") {
        const literalValue = field.value.kind === "literal" ? field.value.value : undefined;
        if (
          Array.isArray(literalValue) &&
          literalValue.length === 2 &&
          literalValue.every(item => typeof item === "number")
        ) {
          return "Range [min,max]";
        }

        return "Number List";
      }

      if (field.itemType === "boolean") {
        return "Boolean List";
      }

      return "String List";
    case "rawJson":
      return "Raw JSON";
    case "graph":
      return "Graph";
  }
}

export function createDefaultParameterField(parameterName: string): NpcPropertyField {
  return {
    id: `parameter-${parameterName}`,
    key: parameterName,
    label: parameterName,
    fieldPath: `Parameters.${parameterName}.Value`,
    kind: "string",
    value: {
      kind: "literal",
      value: "",
    },
    canRename: true,
    canChangeType: true,
    canUnset: true,
    isDescriptionEditable: true,
    computable: true,
    isSet: true,
    ui: {},
  };
}

export function createVariantModifyOverrideFieldFromParent(
  inheritedField: NpcPropertyField,
): NpcPropertyField {
  return {
    ...cloneNpcPropertyField(inheritedField),
    id: `modify-${inheritedField.key}`,
    label: humanize(inheritedField.key) ?? inheritedField.key,
    fieldPath: `Modify.${inheritedField.key}`,
    computable: true,
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    isSet: true,
    ui: {},
  };
}

export function coerceFieldValueToEmptyLiteral(field: NpcPropertyField): NpcFieldValue {
  switch (field.kind) {
    case "string":
      return { kind: "literal", value: "" };
    case "number":
      return { kind: "literal", value: 0 };
    case "boolean":
      return { kind: "literal", value: false };
    case "list":
      return { kind: "literal", value: [] };
    case "rawJson":
    case "graph":
      return { kind: "literal", value: {} };
  }
}

export function coerceLiteralValueToComputeExpression(field: NpcPropertyField): string {
  if (field.value.kind === "compute") {
    return field.value.expression;
  }

  const literalValue = field.value.value;
  if (typeof literalValue === "string") {
    return literalValue;
  }

  if (typeof literalValue === "number" || typeof literalValue === "boolean") {
    return String(literalValue);
  }

  if (Array.isArray(literalValue)) {
    return JSON.stringify(literalValue);
  }

  return "";
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
        preservedFields[parameterName] = structuredClone(parameterValue);
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

    preservedData[key] = structuredClone(childValue);
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
      descriptorAttribute.Required !== "REQUIRED" ||
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
    return null;
  }

  return {
    id: "roleAttributes",
    name: SECTION_NAMES.roleAttributes,
    description: "Top-level role settings surfaced from the current NPC role document.",
    fields,
    ui: {},
  };
}

function createRoleAttributeField({
  key,
  value,
  descriptorAttribute,
  parameterDefinition,
  isSet,
}: {
  key: string;
  value: unknown;
  descriptorAttribute?: NpcDescriptorAttribute;
  parameterDefinition?: NpcParameterDefinitionJson;
  isSet: boolean;
}): NpcPropertyField {
  const parsedShape =
    value === undefined
      ? inferFieldShapeFromDescriptor(descriptorAttribute, parameterDefinition)
      : parseRoleAttributeFieldShape(value, descriptorAttribute, parameterDefinition);

  return {
    id: `role-attribute-${key}`,
    key,
    label: humanize(key) ?? key,
    fieldPath: key,
    kind: parsedShape.kind,
    value: parsedShape.value,
    description:
      toOptionalDisplayString(descriptorAttribute?.ShortDescription) ??
      toOptionalDisplayString(descriptorAttribute?.LongDescription),
    required: descriptorAttribute?.Required === "REQUIRED",
    isSet,
    computable: descriptorAttribute?.Computable === true,
    canRename: false,
    canChangeType: false,
    canUnset: isSet,
    isDescriptionEditable: false,
    itemType: parsedShape.itemType,
    staticSuggestions: parseStaticSuggestions(descriptorAttribute),
    symbolRef: resolveFieldSymbolRef(descriptorAttribute),
    ui: {},
  };
}

function parseRoleAttributeFieldShape(
  value: unknown,
  descriptorAttribute?: NpcDescriptorAttribute,
  parameterDefinition?: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (isNpcComputeJson(value)) {
    const fallbackShape = inferFieldShapeFromDescriptor(descriptorAttribute, parameterDefinition);
    return {
      kind: fallbackShape.kind,
      value: {
        kind: "compute",
        expression: value.Compute,
      },
      itemType: fallbackShape.itemType,
    };
  }

  return inferLiteralFieldShape(value);
}

function inferFieldShapeFromDescriptor(
  descriptorAttribute?: NpcDescriptorAttribute,
  parameterDefinition?: NpcParameterDefinitionJson,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  const descriptorType = descriptorAttribute?.Type;
  const normalizedDomain = normalizeTypeHint(descriptorAttribute?.Domain);

  switch (descriptorType) {
    case "Boolean":
      return {
        kind: "boolean",
        value: { kind: "literal", value: false },
      };
    case "Integer":
    case "Double":
      return {
        kind: "number",
        value: { kind: "literal", value: 0 },
      };
    case "AssetArray":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: "string",
      };
    case "Array":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: normalizedDomain ?? "string",
      };
    case "Asset":
    case "Enum":
    case "Flag":
    case "String":
      return {
        kind: "string",
        value: { kind: "literal", value: "" },
      };
    default:
      if (parameterDefinition) {
        return parseParameterFieldShape(parameterDefinition);
      }

      return {
        kind: "rawJson",
        value: { kind: "literal", value: {} },
      };
  }
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
      value: { kind: "literal", value: structuredClone(value) },
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
    value: { kind: "literal", value: structuredClone(value) },
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

  for (const [key, value] of Object.entries(modify ?? {})) {
    if (key.startsWith("_")) {
      if (key === "_CombatConfig" || key === "_InteractionVars") {
        fields.push(createSpecialVariantModifierField(key, value));
        continue;
      }

      preservedFields[key] = cloneJsonLike(value);
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

  return {
    id: "modify",
    name: SECTION_NAMES.modify,
    description: "Override values applied on top of the referenced NPC role.",
    fields,
    preservedFields,
    keyOrder: modify ? Object.keys(modify) : [],
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
  const inheritedShape = inheritedField
    ? {
        kind: inheritedField.kind,
        itemType: inheritedField.itemType,
      }
    : undefined;
  const parsedShape = parseVariantModifyFieldShape(value, inheritedField);

  return {
    id: `modify-${key}`,
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
    itemType: parsedShape.itemType ?? inheritedShape?.itemType,
    staticSuggestions: inheritedField?.staticSuggestions
      ? [...inheritedField.staticSuggestions]
      : undefined,
    symbolRef: inheritedField?.symbolRef
      ? { ...inheritedField.symbolRef }
      : undefined,
    ui: {},
  };
}

function createSpecialVariantModifierField(key: string, value: unknown): NpcPropertyField {
  return {
    id: `modify-${key}`,
    key,
    label: humanize(key.replace(/^_+/, "")) ?? key,
    fieldPath: `Modify.${key}`,
    kind: "rawJson",
    value: {
      kind: "literal",
      value: cloneJsonLike(value),
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

    if (document.Type === "Component" && key === "Class") {
      continue;
    }

    if ((document.Type === "Generic" || document.Type === "Abstract") && isNpcRoleAttributeKey(key)) {
      continue;
    }

    preservedTopLevelFields[key] = structuredClone(value);
  }

  return preservedTopLevelFields;
}

function serializeParametersSection(section: NpcPropertySection): NpcParametersJson | null {
  const serializedFieldsByKey = new Map<string, unknown>();

  for (const field of section.fields) {
    if (field.key === "_ImportStates") {
      if (field.value.kind === "literal" && Array.isArray(field.value.value) && field.isSet) {
        serializedFieldsByKey.set(
          field.key,
          field.value.value.filter((item): item is string => typeof item === "string"),
        );
      }
      continue;
    }

    serializedFieldsByKey.set(field.key, serializeParameterField(field));
  }

  const orderedKeys = [
    ...(section.keyOrder ?? []).filter(
      key => serializedFieldsByKey.has(key) || key in (section.preservedFields ?? {}),
    ),
    ...Array.from(serializedFieldsByKey.keys()).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
    ...Object.keys(section.preservedFields ?? {}).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
  ];

  if (orderedKeys.length === 0) {
    return null;
  }

  const parameters = new Map<string, unknown>();
  for (const key of orderedKeys) {
    if (serializedFieldsByKey.has(key)) {
      parameters.set(key, serializedFieldsByKey.get(key));
      continue;
    }

    if (section.preservedFields && key in section.preservedFields) {
      parameters.set(key, cloneJsonLike(section.preservedFields[key]));
    }
  }

  return Object.fromEntries(parameters) as NpcParametersJson;
}

function serializeModifySection(section: NpcPropertySection): NpcModifyJson | null {
  const serializedFieldsByKey = new Map<string, unknown>();

  for (const field of section.fields) {
    if (field.isSet === false) {
      continue;
    }

    serializedFieldsByKey.set(field.key, serializeFieldValue(field.value));
  }

  const orderedKeys = [
    ...(section.keyOrder ?? []).filter(
      key => serializedFieldsByKey.has(key) || key in (section.preservedFields ?? {}),
    ),
    ...Array.from(serializedFieldsByKey.keys()).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
    ...Object.keys(section.preservedFields ?? {}).filter(
      key => !(section.keyOrder ?? []).includes(key),
    ),
  ];

  if (orderedKeys.length === 0) {
    return null;
  }

  const modify = new Map<string, unknown>();
  for (const key of orderedKeys) {
    if (serializedFieldsByKey.has(key)) {
      modify.set(key, serializedFieldsByKey.get(key));
      continue;
    }

    if (section.preservedFields && key in section.preservedFields) {
      modify.set(key, cloneJsonLike(section.preservedFields[key]));
    }
  }

  return Object.fromEntries(modify) as NpcModifyJson;
}

function serializeParameterField(field: NpcPropertyField): NpcParameterDefinitionJson {
  const parameterDefinition = new Map<string, unknown>();
  parameterDefinition.set("Value", serializeFieldValue(field.value));

  if (field.description?.trim()) {
    parameterDefinition.set("Description", field.description.trim());
  }

  if (
    field.kind === "list" &&
    field.value.kind === "literal" &&
    Array.isArray(field.value.value) &&
    field.value.value.length === 0
  ) {
    const typeHint = getTypeHintForItemType(field.itemType);
    if (typeHint) {
      parameterDefinition.set("TypeHint", typeHint);
    }
  }

  for (const [key, value] of Object.entries(field.preservedData ?? {})) {
    parameterDefinition.set(key, cloneJsonLike(value));
  }

  return Object.fromEntries(parameterDefinition) as NpcParameterDefinitionJson;
}

function serializeFieldValue(value: NpcFieldValue): unknown {
  if (value.kind === "compute") {
    return {
      Compute: value.expression,
    } satisfies NpcComputeJson;
  }

  return cloneJsonLike(value.value);
}

function cloneNpcPropertyField(field: NpcPropertyField): NpcPropertyField {
  return {
    ...field,
    value:
      field.value.kind === "compute"
        ? {
            kind: "compute",
            expression: field.value.expression,
          }
        : {
            kind: "literal",
            value: cloneJsonLike(field.value.value),
          },
    staticSuggestions: field.staticSuggestions ? [...field.staticSuggestions] : undefined,
    symbolRef: field.symbolRef ? { ...field.symbolRef } : undefined,
    preservedData: field.preservedData ? cloneJsonLike(field.preservedData) : undefined,
    ui: field.ui ? { ...field.ui } : undefined,
  };
}

function cloneJsonLike<T>(value: T): T {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneJsonLike(item)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, cloneJsonLike(childValue)]),
    ) as T;
  }

  return value;
}

function resolveRoleDescriptor(
  roleType: NpcRoleType,
  descriptors: NpcDescriptorDocument,
): NpcDescriptor | undefined {
  const descriptorName = roleType === "Abstract" ? "Generic" : roleType;
  return descriptors.find(
    descriptor => descriptor.Category === "Role" && descriptor.Name === descriptorName,
  );
}

function resolveFieldSymbolRef(
  descriptorAttribute?: NpcDescriptorAttribute,
): IndexReference | undefined {
  if (!descriptorAttribute || typeof descriptorAttribute.Domain !== "string") {
    return undefined;
  }

  const registeredAssetsKey = DOMAIN_TO_REGISTERED_ASSET_KEY[descriptorAttribute.Domain];
  if (!registeredAssetsKey) {
    return undefined;
  }

  if (descriptorAttribute.Type !== "Asset" && descriptorAttribute.Type !== "AssetArray") {
    return undefined;
  }

  return {
    indexKind: "registeredAssets",
    key: registeredAssetsKey,
  };
}

function resolveParameterSymbolRef(
  parameterName: string,
  roleAttributeSymbolRefsByFieldPath: Map<string, IndexReference>,
  parameterUsageIndex: ParameterUsageIndex,
): IndexReference | undefined {
  const directTranslationPaths = [...parameterUsageIndex.directTranslationByFieldPath.entries()]
    .filter(([, directTranslationParameter]) => directTranslationParameter === parameterName)
    .map(([fieldPath]) => fieldPath);

  if (directTranslationPaths.length !== 1) {
    return undefined;
  }

  return roleAttributeSymbolRefsByFieldPath.get(directTranslationPaths[0]);
}

function parseStaticSuggestions(
  descriptorAttribute?: NpcDescriptorAttribute,
): string[] | undefined {
  const rawFlagDescriptions = descriptorAttribute?.FlagDescriptions;
  if (!isRecord(rawFlagDescriptions)) {
    return undefined;
  }

  const values = Object.keys(rawFlagDescriptions).map(normalizeFlagValue);
  return values.length > 0 ? values : undefined;
}

function normalizeFlagValue(value: string): string {
  if (!/^[A-Z0-9_]+$/.test(value)) {
    return value;
  }

  return value
    .split("_")
    .filter(Boolean)
    .map(segment => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join("");
}

function normalizeTypeHint(
  typeHint: unknown,
): "string" | "number" | "boolean" | undefined {
  if (typeof typeHint !== "string" || !typeHint.trim()) {
    return undefined;
  }

  const normalized = typeHint.trim().toLowerCase();
  if (normalized === "string") {
    return "string";
  }
  if (normalized === "number" || normalized === "double") {
    return "number";
  }
  if (normalized === "boolean") {
    return "boolean";
  }
  return undefined;
}

function inferItemTypeFromPrimitiveList(
  value: Array<string | number | boolean>,
): "string" | "number" | "boolean" | undefined {
  if (value.every(item => typeof item === "string")) {
    return "string";
  }

  if (value.every(item => typeof item === "number")) {
    return "number";
  }

  if (value.every(item => typeof item === "boolean")) {
    return "boolean";
  }

  return undefined;
}

function getTypeHintForItemType(
  itemType: NpcPropertyField["itemType"],
): string | undefined {
  if (itemType === "string") {
    return "String";
  }
  if (itemType === "number") {
    return "Number";
  }
  if (itemType === "boolean") {
    return "Boolean";
  }
  return undefined;
}

function isPrimitiveListItem(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isParameterDefinitionJson(value: unknown): value is NpcParameterDefinitionJson {
  return isRecord(value) && "Value" in value;
}

function humanize(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toOptionalDisplayString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
