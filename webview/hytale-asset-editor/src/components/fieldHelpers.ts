import type { Field } from "@shared/fieldTypes";
import type { FieldInstance } from "../parsing/fieldInstances";

export type FieldSection = {
  name: string;
  fields: Field[];
};

export type OutlineSection = {
  id: string;
  name: string;
  fieldCount: number;
};

export function getFieldLabel(field: Pick<Field, "schemaKey" | "title" | "type">): string {
  return humanize(field.schemaKey);
}

export function groupFieldsBySection(properties: Record<string, Field>) {
  const groups = new Map<string, Field[]>();

  for (const field of Object.values(properties)) {
    const section = field.section ?? "General";
    const fields = groups.get(section) ?? [];
    fields.push(field);
    groups.set(section, fields);
  }

  return Array.from(groups, ([name, fields]) => ({ name, fields } satisfies FieldSection));
}

export function buildOutlineSections(sections: FieldSection[]): OutlineSection[] {
  return sections.map((section, index) => ({
    id: `asset-section-${slugify(section.name) || "section"}-${index}`,
    name: section.name,
    fieldCount: section.fields.length,
  }));
}

export function isFieldVisible(field: FieldInstance | null | undefined, hideUnset = false): boolean {
  if (!field) {
    return false;
  }

  if (!hideUnset) {
    return true;
  }

  switch (field.type) {
    case "string":
    case "number":
    case "boolean":
    case "color":
      return field.value !== undefined;
    case "rawJson":
    case "timeline":
    case "weightedTimeline":
      return field.unparsedData !== undefined;
    case "object":
      return Object.values(field.properties).some(childField => isFieldVisible(childField, true));
    case "array":
      return Array.isArray(field.items)
        ? (Array.isArray(field.parsedItems[0]) ? field.parsedItems[0] : []).some(childField =>
            isFieldVisible(childField, true),
          )
        : field.parsedItems.length > 0;
    case "map":
      return field.entries.length > 0;
    case "variant":
      return Boolean(field.selectedIdentity) || isFieldVisible(field.activeVariantField, true);
    case "ref":
      return isFieldVisible(field.resolvedField, true);
    case "inlineOrReference":
      return field.mode !== "empty";
    default:
      return true;
  }
}

export function humanize(value: string | null | undefined): string | null {
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
