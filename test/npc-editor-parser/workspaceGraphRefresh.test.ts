import { describe, expect, test } from "vitest";

import { Workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";
import type { NpcPropertySection } from "../../webview/hytale-npc-role-editor/src/propertyModel";

function findSection(sections: NpcPropertySection[], sectionId: string) {
  return sections.find(section => section.id === sectionId);
}

describe("npc workspace deferred graph refresh", () => {
  test("defers property-model refresh until explicitly flushed", () => {
    const workspace = new Workspace();

    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      version: 1,
      text: JSON.stringify(
        {
          Type: "Generic",
          InteractionInstruction: {
            Name: "Before",
          },
        },
        null,
        2,
      ),
    });

    const beforeField = findSection(workspace.propertySections, "interactionInstruction")?.fields[0];
    expect(beforeField?.value.kind).toBe("literal");
    expect((beforeField?.value.kind === "literal" ? beforeField.value.value : null)).toEqual({
      Name: "Before",
    });

    workspace.setDeferredDocument({
      documentPath: "/tmp/TestNpc.json",
      version: 2,
      text: JSON.stringify(
        {
          Type: "Generic",
          InteractionInstruction: {
            Name: "After",
          },
        },
        null,
        2,
      ),
    });

    const staleField = findSection(workspace.propertySections, "interactionInstruction")?.fields[0];
    expect(workspace.hasDeferredDocumentRefresh).toBe(true);
    expect(workspace.parsedDocumentVersion).toBe(1);
    expect((staleField?.value.kind === "literal" ? staleField.value.value : null)).toEqual({
      Name: "Before",
    });

    workspace.flushDeferredDocumentState();

    const refreshedField = findSection(workspace.propertySections, "interactionInstruction")?.fields[0];
    expect(workspace.hasDeferredDocumentRefresh).toBe(false);
    expect(workspace.parsedDocumentVersion).toBe(2);
    expect((refreshedField?.value.kind === "literal" ? refreshedField.value.value : null)).toEqual({
      Name: "After",
    });
  });
});
