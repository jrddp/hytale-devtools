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

export function groupFieldsBySection(properties: Record<string, FieldInstance>) {
  const groups = new Map<string, FieldInstance[]>();

  for (const field of Object.values(properties)) {
    const section = field.section ?? "General";
    const fields = groups.get(section) ?? [];
    fields.push(field);
    groups.set(section, fields);
  }

  return Array.from(groups, ([name, fields]) => ({ name, fields }) satisfies FieldSection);
}

export function buildOutlineSections(sections: FieldSection[]): OutlineSection[] {
  return sections.map((section, index) => ({
    id: `asset-section-${slugify(section.name) || "section"}-${index}`,
    name: section.name,
    fieldCount: section.fields.length,
  }));
}

export function isFieldSet(field: FieldInstance | null | undefined): boolean {
  if (!field) {
    return false;
  }

  switch (field.type) {
    case "string":
    case "number":
    case "boolean":
    case "color":
      return field.value !== undefined;
    case "rawJson":
      return Boolean(JSON.parse(field.value));
    case "timeline":
    case "weightedTimeline":
      return field.unparsedData !== undefined;
    case "object":
      return Object.values(field.properties).some(childField => isFieldSet(childField));
    case "array":
      return field.items.some(item => isFieldSet(item));
    case "map":
      return field.entries.length > 0;
    case "variant":
      return isFieldSet(field.identityField) || isFieldSet(field.activeVariant);
    case "inlineOrReference":
      return isFieldSet(field.activeField);
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

export function transferMetadata(source: Field, target: Field): Field {
  return {
    ...target,
    schemaKey: source.schemaKey ?? target.schemaKey,
    title: source.title ?? target.title,
    section: source.section ?? target.section,
    markdownDescription: source.markdownDescription ?? target.markdownDescription,
    collapsedByDefault: source.collapsedByDefault ?? target.collapsedByDefault,
    nullable: source.nullable ?? target.nullable,
  };
}
