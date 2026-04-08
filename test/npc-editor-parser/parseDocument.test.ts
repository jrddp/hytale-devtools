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

    expect(document.Type).toBe("Generic");
    expect(Object.keys(document.Parameters ?? {})).toEqual([
      "Invulnerable",
      "MemoriesNameOverride",
      "NameTranslationKey",
    ]);
    expect(document.Parameters?.Invulnerable).toMatchObject({
      Value: false,
      Description: "Whether this NPC is invulnerable.",
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

    expect(document.Type).toBe("Component");
    expect(document.Parameters?._ImportStates).toEqual(["Alerted", "Search", "Chase"]);
    expect(Object.keys(document.Parameters ?? {})).toContain("_ImportStates");
  });

  test("preserves malformed _ImportStates as an excluded special entry", () => {
    const document = expectReady(
      parseNpcDocumentText(
        JSON.stringify({
          Type: "Component",
          Parameters: {
            _ImportStates: ["Idle", 2],
          },
        }),
      ),
    );

    expect(document.Parameters?._ImportStates).toEqual(["Idle", 2]);
  });
});
