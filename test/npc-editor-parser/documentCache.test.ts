import { describe, expect, test } from "vitest";

import { HytaleNpcRoleDocument } from "../../src/npc-role-editor/hytaleNpcRoleDocument";
import { parseNpcDocumentText } from "../../src/shared/npc-role-editor/documentParsing";
import type { NodeEditorGraphDocument } from "../../src/shared/node-editor/graphTypes";

function parseNpcRoleDocumentOrThrow(text: string) {
  const result = parseNpcDocumentText(text);
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return {
    document: result.document,
    topLevelKeyOrder: result.topLevelKeyOrder,
  };
}

describe("npc role document caches", () => {
  test("invalidates parsed and graph caches on full text replacement", () => {
    const initialText = JSON.stringify(
      {
        Type: "Generic",
        InteractionInstruction: {
          Name: "Before",
        },
      },
      null,
      2,
    );
    const document = new HytaleNpcRoleDocument(
      {
        fsPath: "/tmp/TestNpc.json",
        toString: () => "file:///tmp/TestNpc.json",
      } as never,
      initialText,
      1,
    );

    const parsedBefore = document.getParsedDocument(parseNpcRoleDocumentOrThrow);
    const cachedGraphDocument: NodeEditorGraphDocument = {
      workspaceId: "NPC Behavior",
      rootNodeId: "Instruction-1",
      nodes: [],
      edges: [],
    };
    document.setCachedGraphDocument("InteractionInstruction", {
      workspaceRoot: "Instruction",
      graphDocument: cachedGraphDocument,
    });

    document.replaceText(
      JSON.stringify(
        {
          Type: "Generic",
          InteractionInstruction: {
            Name: "After",
          },
        },
        null,
        2,
      ),
    );

    const parsedAfter = document.getParsedDocument(parseNpcRoleDocumentOrThrow);
    expect(parsedBefore.document).not.toBe(parsedAfter.document);
    expect(document.getCachedGraphDocument("InteractionInstruction")).toBeUndefined();
  });
});
