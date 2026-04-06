import { describe, expect, test } from "vitest";

import {
  parseNpcDocumentText,
  type NpcDocumentParseResult,
} from "../../webview/hytale-npc-role-editor/src/parsing/parseNpcDocument";
import { readFixtureText } from "./helpers";

function expectReady(result: NpcDocumentParseResult) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(`Expected ready parse result, received ${result.status}`);
  }
  return result.document;
}

describe("npc editor parseNpcDocumentText", () => {
  test("rejects invalid JSON", () => {
    const result = parseNpcDocumentText("{");
    expect(result).toMatchObject({
      status: "error",
    });
  });

  test("rejects non-object roots", () => {
    const result = parseNpcDocumentText("[]");
    expect(result).toEqual({
      status: "error",
      error: "NPC role document root must be a JSON object.",
    });
  });

  test("parses standard parameters for a generic role", () => {
    const document = expectReady(
      parseNpcDocumentText(
        readFixtureText(
          "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
        ),
      ),
    );

    expect(document.roleType).toBe("Generic");
    expect(document.parameters?.entries).toHaveLength(3);
    expect(document.parameters?.entries[0]).toMatchObject({
      name: "Invulnerable",
      description: "Whether this NPC is invulnerable.",
      typeHint: undefined,
      private: undefined,
      value: {
        kind: "literal",
        value: false,
      },
    });
  });

  test("keeps special parameter keys excluded from editable standard entries", () => {
    const document = expectReady(
      parseNpcDocumentText(
        readFixtureText(
          "Server/NPC/Roles/_Core/Components/Selectors/Component_Instruction_Generic_Idle.json",
        ),
      ),
    );

    expect(document.roleType).toBe("Component");
    expect(document.parameters?.excludedEntries._ImportStates).toBeDefined();
    expect(document.parameters?.entries.every(entry => entry.name !== "_ImportStates")).toBe(true);
  });
});
