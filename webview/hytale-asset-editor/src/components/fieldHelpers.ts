import type { Field } from "@shared/fieldTypes";

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

  return Array.from(groups, ([name, fields]) => ({ name, fields }));
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
