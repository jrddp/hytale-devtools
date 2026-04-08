import type { NpcRoleJson } from "./documentTypes";
import { isNpcRoleJson } from "./documentTypes";

export type NpcDocumentParseResult =
  | {
      status: "ready";
      document: NpcRoleJson;
      topLevelKeyOrder: string[];
    }
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
