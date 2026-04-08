import path from "node:path";

export const VARIANT_REFERENCE_ROLE_TYPES = [
  "Generic",
  "Abstract",
  "Variant",
] as const;

export type VariantReferenceRoleType = (typeof VARIANT_REFERENCE_ROLE_TYPES)[number];

export function isVariantReferenceRoleType(value: unknown): value is VariantReferenceRoleType {
  return (
    value === "Generic" ||
    value === "Abstract" ||
    value === "Variant"
  );
}

export function parseNpcRoleTypeFromText(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    const type = (parsed as Record<string, unknown>).Type;
    return typeof type === "string" ? type : undefined;
  } catch {
    return undefined;
  }
}

export function getNpcRoleReferenceName(value: string): string {
  return path.basename(value).replace(/\.json$/i, "");
}

export function isLikelyNpcComponentReferencePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  const referenceName = getNpcRoleReferenceName(normalized);
  return normalized.includes("/Components/") || referenceName.startsWith("Component_");
}

export function filterNpcRoleReferenceNamesFromPaths(
  values: Iterable<string>,
  allowedRoleTypes: readonly string[] = VARIANT_REFERENCE_ROLE_TYPES,
): string[] {
  const includeComponents = allowedRoleTypes.includes("Component");
  const filtered = new Set<string>();

  for (const value of values) {
    if (!includeComponents && isLikelyNpcComponentReferencePath(value)) {
      continue;
    }

    filtered.add(getNpcRoleReferenceName(value));
  }

  return [...filtered].sort((left, right) => left.localeCompare(right));
}
