import type { NpcComputeJson, NpcJsonValue, NpcRoleJson } from "./documentTypes";
import { isNpcRoleJson } from "./documentTypes";

const DEFAULT_JSON_INDENT = 2;

export type ParsedNpcRoleDocument = {
  document: NpcRoleJson;
  topLevelKeyOrder: string[];
};

export type NpcDocumentParseResult =
  | ({
      status: "ready";
    } & ParsedNpcRoleDocument)
  | {
      status: "error";
      error: string;
    };

export function parseNpcDocumentText(text: string): NpcDocumentParseResult {
  try {
    const parsed = JSON.parse(text);
    if (!isNpcRoleJson(parsed)) {
      return {
        status: "error",
        error:
          typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? 'NPC role document must declare a valid "Type".'
            : "NPC role document root must be a JSON object.",
      };
    }

    return {
      status: "ready",
      document: structuredClone(parsed),
      topLevelKeyOrder: Object.keys(parsed),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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
    : JSON.parse(JSON.stringify(value.value));
}
