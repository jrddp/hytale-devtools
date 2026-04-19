import path from "node:path";
import { isNpcRoleType } from "../shared/npc-role-editor/documentTypes";

export function getNpcRoleReferenceName(value: string): string {
  return path.basename(value).replace(/\.json$/i, "");
}

export function matchesNpcRoleReferenceCandidate(candidate: string, referenceValue: string): boolean {
  const normalizedReferenceValue = normalizeNpcRoleReferenceCandidate(referenceValue);
  if (!normalizedReferenceValue) {
    return false;
  }

  const normalizedCandidate = normalizeNpcRoleReferenceCandidate(candidate);
  if (normalizedCandidate === normalizedReferenceValue) {
    return true;
  }

  if (normalizedCandidate.endsWith(`/${normalizedReferenceValue}`)) {
    return true;
  }

  return getNpcRoleReferenceName(normalizedCandidate) === getNpcRoleReferenceName(normalizedReferenceValue);
}

export function isLikelyNpcComponentReferencePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  const referenceName = getNpcRoleReferenceName(normalized);
  return normalized.includes("/Components/") || referenceName.startsWith("Component_");
}

export function filterNpcRoleReferenceNamesFromPaths(
  values: Iterable<string>,
  allowedRoleTypes: readonly string[] = ["Generic", "Abstract", "Variant"],
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

export function parseNpcRoleTypeFromText(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    const type = (parsed as Record<string, unknown>).Type;
    return typeof type === "string" && isNpcRoleType(type) ? type : undefined;
  } catch {
    return undefined;
  }
}

export function parseNpcComponentClassFromText(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    if ((parsed as Record<string, unknown>).Type !== "Component") {
      return undefined;
    }

    const componentClass = (parsed as Record<string, unknown>).Class;
    return typeof componentClass === "string" ? componentClass : undefined;
  } catch {
    return undefined;
  }
}

function normalizeNpcRoleReferenceCandidate(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/\.json$/i, "")
    .replace(/\/+/g, "/");
}
