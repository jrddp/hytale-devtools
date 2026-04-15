import { describe, expect, test } from "vitest";

import {
  patchNpcGraphTarget,
  resolveNpcGraphTarget,
} from "../../src/shared/npc-role-editor/graphTargets";
import type { NpcRoleJson } from "../../src/shared/npc-role-editor/documentTypes";

describe("npc graph target resolution", () => {
  test("resolves and patches Instructions with preserved root metadata", () => {
    const document: NpcRoleJson = {
      Type: "Generic",
      Instructions: [
        {
          Name: "Original",
        },
      ],
      $NodeId: "Root-1",
      $Comment: "hello",
    };

    const target = resolveNpcGraphTarget(document, "Instructions");
    expect(target).toEqual({
      fieldPath: "Instructions",
      workspaceRoot: "Instructions",
      value: [{ Name: "Original" }],
      preservedData: {
        $NodeId: "Root-1",
        $Comment: "hello",
      },
    });

    const patchedRoot = patchNpcGraphTarget(document, "Instructions", {
      value: [{ Name: "Updated" }],
      preservedData: {
        $NodeId: "Root-2",
        $NodeEditorMetadata: { viewport: { x: 1, y: 2, zoom: 3 } },
      },
    });

    expect(patchedRoot).toBe("Instructions");
    expect(document.Instructions).toEqual([{ Name: "Updated" }]);
    expect(document.$NodeId).toBe("Root-2");
    expect(document.$NodeEditorMetadata).toEqual({
      viewport: { x: 1, y: 2, zoom: 3 },
    });
    expect(document.$Comment).toBeUndefined();
  });

  test("resolves top-level instruction roots by field path", () => {
    const document: NpcRoleJson = {
      Type: "Generic",
      InteractionInstruction: { Name: "Interaction" },
      DeathInstruction: { Name: "Death" },
    };

    expect(resolveNpcGraphTarget(document, "InteractionInstruction")).toMatchObject({
      workspaceRoot: "Instruction",
      value: { Name: "Interaction" },
    });
    expect(resolveNpcGraphTarget(document, "DeathInstruction")).toMatchObject({
      workspaceRoot: "Instruction",
      value: { Name: "Death" },
    });
  });

  test("resolves graph-backed component content roots", () => {
    const instructionComponent: NpcRoleJson = {
      Type: "Component",
      Class: "Instruction",
      Content: { Name: "Instruction Content" },
    };
    const sensorComponent: NpcRoleJson = {
      Type: "Component",
      Class: "Sensor",
      Content: { Type: "Any" },
    };
    const actionComponent: NpcRoleJson = {
      Type: "Component",
      Class: "Action",
      Content: { Type: "Nothing" },
    };

    expect(resolveNpcGraphTarget(instructionComponent, "Content")).toMatchObject({
      workspaceRoot: "Instruction",
      value: { Name: "Instruction Content" },
    });
    expect(resolveNpcGraphTarget(sensorComponent, "Content")).toMatchObject({
      workspaceRoot: "Sensor",
      value: { Type: "Any" },
    });
    expect(resolveNpcGraphTarget(actionComponent, "Content")).toBeNull();
  });
});
