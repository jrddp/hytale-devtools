import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
import type { IndexReference } from "@shared/indexTypes";
import type { NpcDocument, NpcStandardParameterEntry } from "./parsing/documentTypes";
import type { NpcEditorIssue } from "./issues";
import {
  getStandardParameterEditorType,
  getStandardParameterEditorTypeLabel,
} from "./parsing/parameterEditorTypes";
import type { NpcStandardParameterEditorType } from "./parsing/documentTypes";
import type { ParameterUsageIndex } from "./compute/parameterUsageIndex";

export type NpcPropertyInfoItem = {
  label: string;
  value: string;
};

export type NpcPropertyFieldBase = {
  id: string;
  fieldPath: string;
  key: string;
  label: string;
  typeLabel: string;
  description?: string;
  infoItems?: NpcPropertyInfoItem[];
  issues?: NpcEditorIssue[];
};

export type NpcPropertyScalarField = NpcPropertyFieldBase & {
  type: "string" | "number" | "boolean" | "enum";
  value: string | number | boolean;
  valueMode?: "literal" | "compute";
  options?: Array<{ value: string; description?: string }>;
  symbolRef?: IndexReference;
  itemSymbolRef?: IndexReference;
};

export type NpcPropertyListField = NpcPropertyFieldBase & {
  type: "list";
  items: Array<string | number | boolean>;
  itemSymbolRef?: IndexReference;
  itemAutocompleteValues?: string[];
};

export type NpcPropertyRawJsonField = NpcPropertyFieldBase & {
  type: "rawJson";
  value: unknown;
};

export type NpcPropertyParameterField = NpcPropertyFieldBase & {
  type: "parameter";
  parameterName: string;
  valueMode: "literal" | "compute";
  editorType: NpcStandardParameterEditorType;
  typeHint?: string;
  literalKind: "string" | "number" | "boolean" | "list" | "rawJson";
  literalValue?: unknown;
  computeExpression?: string;
  symbolRef?: IndexReference;
  itemSymbolRef?: IndexReference;
};

export type NpcPropertyField =
  | NpcPropertyScalarField
  | NpcPropertyListField
  | NpcPropertyRawJsonField
  | NpcPropertyParameterField;

export type NpcPropertySection = {
  id: string;
  name: string;
  description?: string;
  fields: NpcPropertyField[];
};

const ROLE_ATTRIBUTE_SKIP_KEYS = new Set([
  "Type",
  "Parameters",
  "Instructions",
  "InteractionInstruction",
  "DeathInstruction",
  "StateTransitions",
  "MotionControllerList",
  "Content",
  "Class",
  "Interface",
  "Reference",
  "Modify",
  "TestType",
  "FailReason",
  "$Comment",
  "$Title",
  "$TODO",
  "$Author",
  "$NodeEditorMetadata",
  "$Position",
  "$NodeId",
  "$FloatingFunctionNodes",
  "$Groups",
  "$WorkspaceID",
]);

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

type NpcFieldSymbolMetadata = {
  symbolRef?: IndexReference;
  itemSymbolRef?: IndexReference;
};

export function buildNpcPropertySections(
  document: NpcDocument,
  descriptors: NpcDescriptorDocument,
  parameterUsageIndex: ParameterUsageIndex,
  discoveredStates: string[],
  issuesByFieldPath: Map<string, NpcEditorIssue[]> = new Map(),
): NpcPropertySection[] {
  const sections: NpcPropertySection[] = [];

  const variantReferenceSection = buildVariantReferenceSection(document.rawRoot);
  if (variantReferenceSection) {
    sections.push(variantReferenceSection);
  }

  const roleAttributeFields = buildRoleAttributeFields(
    document.rawRoot,
    document.roleType,
    descriptors,
    issuesByFieldPath,
  );
  const roleAttributeSymbolMetadataByFieldPath = new Map(
    roleAttributeFields
      .map(field => [field.fieldPath, extractFieldSymbolMetadata(field)] as const)
      .filter(([, metadata]) => metadata.symbolRef || metadata.itemSymbolRef),
  );

  const parameterSection = buildParameterSection(
    document,
    roleAttributeSymbolMetadataByFieldPath,
    parameterUsageIndex,
    discoveredStates,
    issuesByFieldPath,
  );
  if (parameterSection) {
    sections.push(parameterSection);
  }

  const roleAttributeSection = buildRoleAttributeSection(roleAttributeFields);
  if (roleAttributeSection) {
    sections.push(roleAttributeSection);
  }

  return sections;
}

function buildVariantReferenceSection(
  documentData: Record<string, unknown>,
): NpcPropertySection | null {
  if (documentData.Type !== "Variant") {
    return null;
  }

  const fields: NpcPropertyField[] = [];
  const reference = documentData.Reference;
  const modify = documentData.Modify;

  if (reference !== undefined) {
    fields.push(
      createPropertyField({
        id: "variant-reference-reference",
        fieldPath: "Reference",
        key: "Reference",
        label: "Reference",
        value: reference,
        description: "The parent NPC role or template this variant extends.",
      }),
    );
  }

  if (modify !== undefined) {
  fields.push({
      id: "variant-reference-modify",
      fieldPath: "Modify",
      key: "Modify",
      label: "Modify",
      typeLabel: "Raw JSON",
      description: "Override values applied on top of the referenced NPC role.",
      type: "rawJson",
      value: modify,
      infoItems: [{ label: "Role", value: "Override payload" }],
    });
  }

  if (fields.length === 0) {
    return null;
  }

  return {
    id: "npc-section-variant-reference",
    name: "Variant Reference",
    description: "Reference metadata and override payloads for variant NPC roles.",
    fields,
  };
}

function buildParameterSection(
  document: NpcDocument,
  roleAttributeSymbolMetadataByFieldPath: Map<string, NpcFieldSymbolMetadata>,
  parameterUsageIndex: ParameterUsageIndex,
  discoveredStates: string[],
  issuesByFieldPath: Map<string, NpcEditorIssue[]>,
): NpcPropertySection | null {
  const parameters = document.parameters;
  if (!parameters && !document.roleType) {
    return null;
  }

  const fields: NpcPropertyField[] = [];

  if (document.roleType === "Component") {
    fields.push(createImportStatesField(parameters, discoveredStates, issuesByFieldPath));
  }

  fields.push(
    ...(
      parameters?.entries.map(entry =>
        createParameterField(
          entry,
          roleAttributeSymbolMetadataByFieldPath,
          parameterUsageIndex,
          issuesByFieldPath.get(`Parameters.${entry.name}.Value`) ?? [],
        ),
      ) ?? []
    ),
  );

  return {
    id: "npc-section-parameters",
    name: "Parameters",
    description:
      document.roleType === "Component"
        ? "Template parameter values and imported parent-state slots."
        : "Template parameter values.",
    fields,
  };
}

function createImportStatesField(
  parameters: NpcDocument["parameters"],
  discoveredStates: string[],
  issuesByFieldPath: Map<string, NpcEditorIssue[]>,
): NpcPropertyListField {
  return {
    id: "parameter-import-states",
    fieldPath: "Parameters._ImportStates",
    key: "_ImportStates",
    label: "Import States",
    typeLabel: "String List",
    description:
      "Ordered aliases for parent NPC states this component imports. These map by index to a reference's _ExportStates.",
    issues: issuesByFieldPath.get("Parameters._ImportStates") ?? [],
    type: "list",
    items: parameters?.importStates ?? [],
    itemAutocompleteValues: discoveredStates,
  };
}

function createParameterField(
  entry: NpcStandardParameterEntry,
  roleAttributeSymbolMetadataByFieldPath: Map<string, NpcFieldSymbolMetadata>,
  parameterUsageIndex: ParameterUsageIndex,
  issues: NpcEditorIssue[],
): NpcPropertyParameterField {
  const infoItems: NpcPropertyInfoItem[] = [];
  const editorType = getStandardParameterEditorType(entry);
  const symbolMetadata = resolveParameterSymbolMetadata(
    entry.name,
    roleAttributeSymbolMetadataByFieldPath,
    parameterUsageIndex,
  );

  if (entry.private === true) {
    infoItems.push({ label: "Private", value: "Yes" });
  }

  if (typeof entry.typeHint === "string" && entry.typeHint.trim()) {
    infoItems.push({ label: "Type Hint", value: entry.typeHint });
  }

  const literalValue =
    entry.value.kind === "literal" ? entry.value.value : undefined;

  return {
    id: `parameter-${entry.name}`,
    fieldPath: `Parameters.${entry.name}.Value`,
    key: entry.name,
    label: entry.name,
    typeLabel: getStandardParameterEditorTypeLabel(editorType),
    description: toOptionalDisplayString(entry.description),
    infoItems,
    issues,
    type: "parameter",
    parameterName: entry.name,
    valueMode: entry.value.kind,
    editorType,
    typeHint: entry.typeHint,
    literalKind: getLiteralKind(literalValue),
    literalValue,
    computeExpression: entry.value.kind === "compute" ? entry.value.expression : undefined,
    symbolRef: symbolMetadata.symbolRef,
    itemSymbolRef: symbolMetadata.itemSymbolRef,
  };
}

function getLiteralKind(value: unknown): NpcPropertyParameterField["literalKind"] {
  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "string") {
    return "string";
  }

  if (Array.isArray(value) && value.every(item => isPrimitiveListItem(item))) {
    return "list";
  }

  return "rawJson";
}

function buildRoleAttributeSection(
  fields: NpcPropertyField[],
): NpcPropertySection | null {
  if (fields.length === 0) {
    return null;
  }

  return {
    id: "npc-section-role-attributes",
    name: "Role Attributes",
    description: "Top-level role settings surfaced from the current NPC role document.",
    fields,
  };
}

function buildRoleAttributeFields(
  documentData: Record<string, unknown>,
  roleType: string | null,
  descriptors: NpcDescriptorDocument,
  issuesByFieldPath: Map<string, NpcEditorIssue[]>,
): NpcPropertyField[] {
  if (roleType === "Variant") {
    return [];
  }

  const roleDescriptor = resolveRoleDescriptor(roleType, descriptors);
  const fields: NpcPropertyField[] = [];

  const sortedEntries = Object.entries(documentData)
    .filter(([key]) => !ROLE_ATTRIBUTE_SKIP_KEYS.has(key) && !key.startsWith("$"))
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [key, value] of sortedEntries) {
    const descriptorAttribute = roleDescriptor?.Attributes?.find(attribute => attribute.Name === key);
    const infoItems: NpcPropertyInfoItem[] = [];

    if (descriptorAttribute?.Required === "REQUIRED") {
      infoItems.push({ label: "Required", value: "Yes" });
    }

    if (descriptorAttribute?.Computable) {
      infoItems.push({ label: "Computable", value: "Yes" });
    }

    fields.push(
      createPropertyField({
        id: `role-attribute-${key}`,
        fieldPath: key,
        key,
        label: humanize(key) ?? key,
        description:
          toOptionalDisplayString(descriptorAttribute?.ShortDescription) ??
          toOptionalDisplayString(descriptorAttribute?.LongDescription),
        value,
        infoItems,
        descriptorAttribute,
        issuesByFieldPath,
      }),
    );
  }

  return fields;
}

function resolveRoleDescriptor(
  roleType: string | null,
  descriptors: NpcDescriptorDocument,
): NpcDescriptor | undefined {
  if (!roleType) {
    return undefined;
  }

  const descriptorName = roleType === "Abstract" ? "Generic" : roleType;
  return descriptors.find(
    descriptor => descriptor.Category === "Role" && descriptor.Name === descriptorName,
  );
}

function createPropertyField({
  id,
  fieldPath,
  key,
  label,
  typeLabel,
  description,
  value,
  infoItems = [],
  descriptorAttribute,
  issuesByFieldPath = new Map(),
}: {
  id: string;
  fieldPath: string;
  key: string;
  label: string;
  typeLabel?: string;
  description?: string;
  value: unknown;
  infoItems?: NpcPropertyInfoItem[];
  descriptorAttribute?: NpcDescriptorAttribute;
  issuesByFieldPath?: Map<string, NpcEditorIssue[]>;
}): NpcPropertyField {
  const symbolMetadata = resolveFieldSymbolMetadata(descriptorAttribute);
  const issues = issuesByFieldPath.get(fieldPath) ?? [];

  if (isComputeExpression(value)) {
    return {
      id,
      fieldPath,
      key,
      label,
      typeLabel: typeLabel ?? "String",
      description,
      infoItems: [...infoItems, { label: "Value Source", value: "Compute expression" }],
      issues,
      type: "string",
      value: value.Compute,
      valueMode: "compute",
      symbolRef: symbolMetadata.symbolRef,
      itemSymbolRef: symbolMetadata.itemSymbolRef,
    };
  }

  if (typeof value === "boolean") {
    return {
      id,
      fieldPath,
      key,
      label,
      typeLabel: typeLabel ?? "Boolean",
      description,
      infoItems,
      issues,
      type: "boolean",
      value,
    };
  }

  if (typeof value === "number") {
    return {
      id,
      fieldPath,
      key,
      label,
      typeLabel: typeLabel ?? "Number",
      description,
      infoItems,
      issues,
      type: "number",
      value,
    };
  }

  if (typeof value === "string") {
    const options = parseEnumOptions(descriptorAttribute);
    if (options.length > 0) {
      return {
        id,
        fieldPath,
        key,
        label,
        typeLabel: typeLabel ?? "Enum",
        description,
        infoItems,
        issues,
        type: "enum",
        value,
        options,
      };
    }

    return {
      id,
      fieldPath,
      key,
      label,
      typeLabel: typeLabel ?? "String",
      description,
      infoItems,
      issues,
      type: "string",
      value,
      valueMode: "literal",
      symbolRef: symbolMetadata.symbolRef,
      itemSymbolRef: symbolMetadata.itemSymbolRef,
    };
  }

  if (Array.isArray(value) && value.every(item => isPrimitiveListItem(item))) {
    return {
      id,
      fieldPath,
      key,
      label,
      typeLabel: typeLabel ?? "List",
      description,
      infoItems,
      issues,
      type: "list",
      items: value,
      itemSymbolRef: symbolMetadata.itemSymbolRef,
    };
  }

  return {
    id,
    fieldPath,
    key,
    label,
    typeLabel: typeLabel ?? "Raw JSON",
    description,
    infoItems,
    issues,
    type: "rawJson",
    value,
  };
}

function resolveFieldSymbolMetadata(
  descriptorAttribute?: NpcDescriptorAttribute,
): NpcFieldSymbolMetadata {
  if (!descriptorAttribute || typeof descriptorAttribute.Domain !== "string") {
    return {};
  }

  const registeredAssetsKey = DOMAIN_TO_REGISTERED_ASSET_KEY[descriptorAttribute.Domain];
  if (!registeredAssetsKey) {
    return {};
  }

  if (descriptorAttribute.Type === "Asset") {
    return {
      symbolRef: {
        indexKind: "registeredAssets",
        key: registeredAssetsKey,
      },
    };
  }

  if (descriptorAttribute.Type === "AssetArray") {
    return {
      itemSymbolRef: {
        indexKind: "registeredAssets",
        key: registeredAssetsKey,
      },
    };
  }

  return {};
}

function extractFieldSymbolMetadata(field: NpcPropertyField): NpcFieldSymbolMetadata {
  if (field.type === "list") {
    return {
      itemSymbolRef: field.itemSymbolRef,
    };
  }

  if (field.type === "parameter") {
    return {
      symbolRef: field.symbolRef,
      itemSymbolRef: field.itemSymbolRef,
    };
  }

  if (field.type === "string" || field.type === "enum") {
    return {
      symbolRef: field.symbolRef,
      itemSymbolRef: field.itemSymbolRef,
    };
  }

  return {};
}

function resolveParameterSymbolMetadata(
  parameterName: string,
  roleAttributeSymbolMetadataByFieldPath: Map<string, NpcFieldSymbolMetadata>,
  parameterUsageIndex: ParameterUsageIndex,
): NpcFieldSymbolMetadata {
  const directTranslationPaths = [...parameterUsageIndex.directTranslationByFieldPath.entries()]
    .filter(([, directTranslationParameter]) => directTranslationParameter === parameterName)
    .map(([fieldPath]) => fieldPath);

  if (directTranslationPaths.length !== 1) {
    return {};
  }

  return roleAttributeSymbolMetadataByFieldPath.get(directTranslationPaths[0]) ?? {};
}

function parseEnumOptions(
  descriptorAttribute?: NpcDescriptorAttribute,
): Array<{ value: string; description?: string }> {
  const rawFlagDescriptions = descriptorAttribute?.FlagDescriptions;
  if (!isRecord(rawFlagDescriptions)) {
    return [];
  }

  return Object.entries(rawFlagDescriptions).map(([rawValue, description]) => ({
    value: normalizeFlagValue(rawValue),
    description: typeof description === "string" ? description : undefined,
  }));
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

function isComputeExpression(value: unknown): value is { Compute: string } {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.Compute === "string";
}

function isPrimitiveListItem(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalDisplayString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
