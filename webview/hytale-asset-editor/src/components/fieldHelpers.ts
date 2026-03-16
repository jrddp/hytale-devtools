import type { Field } from "@shared/fieldTypes";

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
