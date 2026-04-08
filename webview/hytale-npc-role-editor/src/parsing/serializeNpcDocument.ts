import type { NpcComputeJson, NpcJsonValue, NpcRoleJson } from "./documentTypes";

const DEFAULT_JSON_INDENT = 2;

export function serializeNpcDocument(
  document: NpcRoleJson,
  topLevelKeyOrder: string[] = Object.keys(document),
): Record<string, unknown> {
  const fieldsByKey = new Map(Object.entries(document));
  const orderedKeys = [
    ...topLevelKeyOrder.filter(key => fieldsByKey.has(key)),
    ...Array.from(fieldsByKey.keys()).filter(key => !topLevelKeyOrder.includes(key)),
  ];

  return Object.fromEntries(
    orderedKeys.map(key => [key, structuredClone(fieldsByKey.get(key))]),
  );
}

export function serializeNpcDocumentText(
  document: NpcRoleJson,
  topLevelKeyOrder?: string[],
): string {
  return `${JSON.stringify(serializeNpcDocument(document, topLevelKeyOrder), null, DEFAULT_JSON_INDENT)}\n`;
}

export function serializeStandardParameterValue(
  value:
    | { kind: "literal"; value: NpcJsonValue }
    | { kind: "compute"; expression: string },
): NpcJsonValue | NpcComputeJson {
  return value.kind === "compute"
    ? {
        Compute: value.expression,
      }
    : structuredClone(value.value);
}
