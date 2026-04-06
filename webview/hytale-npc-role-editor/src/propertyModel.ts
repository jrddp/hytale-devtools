import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
import type { NpcDocument, NpcStandardParameterEntry } from "./parsing/documentTypes";

export type NpcPropertyInfoItem = {
  label: string;
  value: string;
};

export type NpcPropertyFieldBase = {
  id: string;
  fieldPath: string;
  key: string;
  label: string;
  description?: string;
  infoItems?: NpcPropertyInfoItem[];
};

export type NpcPropertyScalarField = NpcPropertyFieldBase & {
  type: "string" | "number" | "boolean" | "enum";
  value: string | number | boolean;
  options?: Array<{ value: string; description?: string }>;
};

export type NpcPropertyListField = NpcPropertyFieldBase & {
  type: "list";
  items: Array<string | number | boolean>;
};

export type NpcPropertyRawJsonField = NpcPropertyFieldBase & {
  type: "rawJson";
  value: unknown;
};

export type NpcPropertyParameterField = NpcPropertyFieldBase & {
  type: "parameter";
  parameterName: string;
  valueMode: "literal" | "compute";
  literalKind: "string" | "number" | "boolean" | "list" | "rawJson";
  literalValue?: unknown;
  computeExpression?: string;
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

export function buildNpcPropertySections(
  document: NpcDocument,
  descriptors: NpcDescriptorDocument,
): NpcPropertySection[] {
  const sections: NpcPropertySection[] = [];

  const variantReferenceSection = buildVariantReferenceSection(document.rawRoot);
  if (variantReferenceSection) {
    sections.push(variantReferenceSection);
  }

  const parameterSection = buildParameterSection(document);
  if (parameterSection) {
    sections.push(parameterSection);
  }

  const roleAttributeSection = buildRoleAttributeSection(document.rawRoot, document.roleType, descriptors);
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

function buildParameterSection(document: NpcDocument): NpcPropertySection | null {
  const parameters = document.parameters;
  if (!parameters && !document.roleType) {
    return null;
  }

  return {
    id: "npc-section-parameters",
    name: "Parameters",
    description: "Template parameter values.",
    fields: parameters?.entries.map(entry => createParameterField(entry)) ?? [],
  };
}

function createParameterField(entry: NpcStandardParameterEntry): NpcPropertyParameterField {
  const infoItems: NpcPropertyInfoItem[] = [];

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
    description: toOptionalDisplayString(entry.description),
    infoItems,
    type: "parameter",
    parameterName: entry.name,
    valueMode: entry.value.kind,
    literalKind: getLiteralKind(literalValue),
    literalValue,
    computeExpression: entry.value.kind === "compute" ? entry.value.expression : undefined,
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
  documentData: Record<string, unknown>,
  roleType: string | null,
  descriptors: NpcDescriptorDocument,
): NpcPropertySection | null {
  if (roleType === "Variant") {
    return null;
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
      }),
    );
  }

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
  description,
  value,
  infoItems = [],
  descriptorAttribute,
}: {
  id: string;
  fieldPath: string;
  key: string;
  label: string;
  description?: string;
  value: unknown;
  infoItems?: NpcPropertyInfoItem[];
  descriptorAttribute?: NpcDescriptorAttribute;
}): NpcPropertyField {
  if (isComputeExpression(value)) {
    return {
      id,
      fieldPath,
      key,
      label,
      description,
      infoItems: [...infoItems, { label: "Value Source", value: "Compute expression" }],
      type: "string",
      value: value.Compute,
    };
  }

  if (typeof value === "boolean") {
    return {
      id,
      fieldPath,
      key,
      label,
      description,
      infoItems,
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
      description,
      infoItems,
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
        description,
        infoItems,
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
      description,
      infoItems,
      type: "string",
      value,
    };
  }

  if (Array.isArray(value) && value.every(item => isPrimitiveListItem(item))) {
    return {
      id,
      fieldPath,
      key,
      label,
      description,
      infoItems,
      type: "list",
      items: value,
    };
  }

  return {
    id,
    fieldPath,
    key,
    label,
    description,
    infoItems,
    type: "rawJson",
    value,
  };
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
