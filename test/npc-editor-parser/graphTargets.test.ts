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

  test("passes StateTransitions through without shape adaptation", () => {
    const document: NpcRoleJson = {
      Type: "Generic",
      StateTransitions: [
        {
          States: [
            {
              From: ["Idle"],
              To: ["Alerted"],
            },
          ],
          Actions: [
            {
              Type: "Timeout",
            },
          ],
        },
      ],
    };

    expect(resolveNpcGraphTarget(document, "StateTransitions")).toEqual({
      fieldPath: "StateTransitions",
      workspaceRoot: "StateTransitions",
      value: [
        {
          States: [
            {
              From: ["Idle"],
              To: ["Alerted"],
            },
          ],
          Actions: [
            {
              Type: "Timeout",
            },
          ],
        },
      ],
    });

    const patchedRoot = patchNpcGraphTarget(document, "StateTransitions", {
      value: [
        {
          States: [
            {
              From: ["Search"],
              To: ["Idle"],
            },
          ],
          Actions: [],
        },
      ],
    });

    expect(patchedRoot).toBe("StateTransitions");
    expect(document.StateTransitions).toEqual([
      {
        States: [
          {
            From: ["Search"],
            To: ["Idle"],
          },
        ],
        Actions: [],
      },
    ]);
  });

  test("resolves and patches graph-backed component content roots", () => {
    const cases: Array<{
      componentClass: string;
      workspaceRoot: string;
      initialContent: unknown;
      nextContent: unknown;
    }> = [
      {
        componentClass: "Action",
        workspaceRoot: "Action",
        initialContent: { Type: "Nothing" },
        nextContent: { Type: "Timeout" },
      },
      {
        componentClass: "ActionList",
        workspaceRoot: "ActionList",
        initialContent: [{ Type: "Nothing" }],
        nextContent: [{ Type: "Timeout" }],
      },
      {
        componentClass: "BodyMotion",
        workspaceRoot: "BodyMotion",
        initialContent: { Type: "Nothing" },
        nextContent: { Type: "Sequence", Motions: [] },
      },
      {
        componentClass: "HeadMotion",
        workspaceRoot: "HeadMotion",
        initialContent: { Type: "Nothing" },
        nextContent: { Type: "Sequence", Motions: [] },
      },
      {
        componentClass: "Instruction",
        workspaceRoot: "Instruction",
        initialContent: { Name: "Instruction Content" },
        nextContent: { Name: "Updated Instruction" },
      },
      {
        componentClass: "Path",
        workspaceRoot: "Path",
        initialContent: { Waypoints: [] },
        nextContent: { Scale: { Compute: "Scale" }, Waypoints: [] },
      },
      {
        componentClass: "Sensor",
        workspaceRoot: "Sensor",
        initialContent: { Type: "Any" },
        nextContent: { Type: "Time" },
      },
    ];

    for (const testCase of cases) {
      const document: NpcRoleJson = {
        Type: "Component",
        Class: testCase.componentClass,
        Content: testCase.initialContent,
      };

      expect(resolveNpcGraphTarget(document, "Content")).toMatchObject({
        workspaceRoot: testCase.workspaceRoot,
        value: testCase.initialContent,
      });
      expect(
        patchNpcGraphTarget(document, "Content", {
          value: testCase.nextContent,
        }),
      ).toBe(testCase.workspaceRoot);
      expect(document.Content).toEqual(testCase.nextContent);
    }
  });

  test("does not treat Role component content as an NPC behavior graph root", () => {
    const roleComponent: NpcRoleJson = {
      Type: "Component",
      Class: "Role",
      Content: {
        Type: "Generic",
      },
    };

    expect(resolveNpcGraphTarget(roleComponent, "Content")).toBeNull();
  });
});
