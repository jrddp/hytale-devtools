import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { HytaleNpcRoleDocument } from "../../src/npc-role-editor/hytaleNpcRoleDocument";
import { applyNpcGraphEditToDocument } from "../../src/npc-role-editor/graphEditRuntime";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import { invertNodeEditorGraphEdit } from "../../src/shared/node-editor/graphEditUtils";
import type { NodeEditorGraphEdit, NodeEditorGraphNode } from "../../src/shared/node-editor/graphTypes";
import { parseNpcRoleDocumentOrThrow, resolveNpcGraphDocumentFromText } from "../../src/shared/npc-role-editor/graphDocumentRuntime";
import type { NpcGraphTargetWorkspaceRoot } from "../../src/shared/npc-role-editor/graphTargets";
import type { NpcRoleJson } from "../../src/shared/npc-role-editor/documentTypes";
import { reconcileSessionWithGraphUpdate } from "../../webview/hytale-node-editor/src/node-editor/utils/documentUpdates";
import { syncSessionFromGraphDocument } from "../../webview/hytale-node-editor/src/node-editor/utils/sessionSync";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(
  process.cwd(),
  "default-data/node-editor-workspace-definitions",
);

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

function createWorkspaceRuntime(): WorkspaceRuntime {
  const schemaRuntime = new SchemaRuntime(schemaDir, logger);
  return new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);
}

function getNpcBehaviorContext(rootId: NpcGraphTargetWorkspaceRoot) {
  const workspaceRuntime = createWorkspaceRuntime();
  const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", rootId);
  if (!context) {
    throw new Error(`NPC Behavior workspace root "${rootId}" could not be resolved.`);
  }
  return { workspaceRuntime, context };
}

function createNpcDocument(textDocument: NpcRoleJson): HytaleNpcRoleDocument {
  return new HytaleNpcRoleDocument(
    {
      fsPath: "/tmp/TestNpc.json",
      toString: () => "file:///tmp/TestNpc.json",
    } as never,
    `${JSON.stringify(textDocument, null, 2)}\n`,
    1 as never,
  );
}

function createInteractionInstructionDocument(): NpcRoleJson {
  return {
    Type: "Generic",
    InteractionInstruction: {
      $NodeId: "Instruction-11111111-1111-4111-8111-111111111111",
      Name: "Land",
      Sensor: {
        $NodeId: "Sensor-22222222-2222-4222-8222-222222222222",
        Type: "And",
        Sensors: [
          {
            $NodeId: "Sensor-33333333-3333-4333-8333-333333333333",
            Type: "BlockType",
            BlockSet: "Empty",
            Sensor: {
              $NodeId: "Sensor-44444444-4444-4444-8444-444444444444",
              Type: "AdjustPosition",
              Offset: [0, -1, 0],
              Sensor: {
                $NodeId: "Sensor-55555555-5555-4555-8555-555555555555",
                Type: "Block",
                RelativeTo: "Self",
              },
            },
          },
        ],
      },
    },
  };
}

function createDeathInstructionDocument(): NpcRoleJson {
  return {
    Type: "Generic",
    DeathInstruction: {
      $NodeId: "Instruction-11111111-1111-4111-8111-111111111111",
      Name: "Land",
      Sensor: {
        $NodeId: "Sensor-22222222-2222-4222-8222-222222222222",
        Type: "And",
        Sensors: [
          {
            $NodeId: "Sensor-33333333-3333-4333-8333-333333333333",
            Type: "BlockType",
            BlockSet: "Empty",
            Sensor: {
              $NodeId: "Sensor-44444444-4444-4444-8444-444444444444",
              Type: "AdjustPosition",
              Offset: [0, -1, 0],
              Sensor: {
                $NodeId: "Sensor-55555555-5555-4555-8555-555555555555",
                Type: "Block",
                RelativeTo: "Self",
              },
            },
          },
        ],
      },
    },
  };
}

function createInstructionsDocument(): NpcRoleJson {
  return {
    Type: "Generic",
    Instructions: [
      {
        $NodeId: "Instruction-11111111-1111-4111-8111-111111111111",
        Name: "Land",
        Sensor: {
          $NodeId: "Sensor-22222222-2222-4222-8222-222222222222",
          Type: "And",
          Sensors: [
            {
              $NodeId: "Sensor-33333333-3333-4333-8333-333333333333",
              Type: "BlockType",
              BlockSet: "Empty",
              Sensor: {
                $NodeId: "Sensor-44444444-4444-4444-8444-444444444444",
                Type: "AdjustPosition",
                Offset: [0, -1, 0],
                Sensor: {
                  $NodeId: "Sensor-55555555-5555-4555-8555-555555555555",
                  Type: "Block",
                  RelativeTo: "Self",
                },
              },
            },
          ],
        },
      },
      {
        $NodeId: "Instruction-66666666-6666-4666-8666-666666666666",
        Name: "Fallback",
      },
    ],
    $NodeId: "InstructionListRoot-77777777-7777-4777-8777-777777777777",
    $Comment: "root graph comment",
  };
}

function createSensorComponentDocument(): NpcRoleJson {
  return {
    Type: "Component",
    Class: "Sensor",
    Content: {
      $NodeId: "Sensor-11111111-1111-4111-8111-111111111111",
      Type: "BlockType",
      BlockSet: "Empty",
      Sensor: {
        $NodeId: "Sensor-22222222-2222-4222-8222-222222222222",
        Type: "AdjustPosition",
        Offset: [0, -1, 0],
        Sensor: {
          $NodeId: "Sensor-33333333-3333-4333-8333-333333333333",
          Type: "Block",
          RelativeTo: "Self",
        },
      },
    },
  };
}

function createActionComponentDocument(): NpcRoleJson {
  return {
    Type: "Component",
    Class: "Action",
    Content: {
      $NodeId: "Action-11111111-1111-4111-8111-111111111111",
      Type: "PlayAnimation",
      Animation: "Idle",
    },
  };
}

function createActionListComponentDocument(): NpcRoleJson {
  return {
    Type: "Component",
    Class: "ActionList",
    Content: [
      {
        $NodeId: "Action-11111111-1111-4111-8111-111111111111",
        Type: "PlayAnimation",
        Animation: "Idle",
      },
    ],
  };
}

function createBodyMotionComponentDocument(): NpcRoleJson {
  return {
    Type: "Component",
    Class: "BodyMotion",
    Content: {
      $NodeId: "BodyMotion-11111111-1111-4111-8111-111111111111",
      Type: "Wander",
      RelativeSpeed: 1,
    },
  };
}

function createHeadMotionComponentDocument(): NpcRoleJson {
  return {
    Type: "Component",
    Class: "HeadMotion",
    Content: {
      $NodeId: "HeadMotion-11111111-1111-4111-8111-111111111111",
      Type: "Watch",
      RelativeTurnSpeed: 1,
    },
  };
}

function createPathComponentDocument(): NpcRoleJson {
  return {
    Type: "Component",
    Class: "Path",
    Content: {
      $NodeId: "Path-11111111-1111-4111-8111-111111111111",
      Scale: 1,
      Waypoints: [
        {
          $NodeId: "Waypoint-11111111-1111-4111-8111-111111111111",
          Rotation: 0,
          Distance: 4,
        },
      ],
    },
  };
}

function findGraphNodeByTemplateId(
  nodes: NodeEditorGraphNode[],
  templateId: string,
): NodeEditorGraphNode {
  const node = nodes.find(candidate => candidate.data.templateId === templateId);
  if (!node) {
    throw new Error(`Expected graph node for template "${templateId}".`);
  }
  return node;
}

function createOffsetEdit(nodeId: string, afterValue: [number, number, number]): NodeEditorGraphEdit {
  return {
    kind: "node-properties-updated",
    propertyChanges: [
      {
        type: "field-value",
        nodeId,
        schemaKey: "Offset",
        beforeValue: [0, -1, 0],
        afterValue,
        beforeIsImplicit: false,
        afterIsImplicit: false,
      },
    ],
  };
}

function createFieldValueEdit(
  nodeId: string,
  schemaKey: string,
  beforeValue: unknown,
  afterValue: unknown,
): NodeEditorGraphEdit {
  return {
    kind: "node-properties-updated",
    propertyChanges: [
      {
        type: "field-value",
        nodeId,
        schemaKey,
        beforeValue,
        afterValue,
        beforeIsImplicit: false,
        afterIsImplicit: false,
      },
    ],
  };
}

describe("npc embedded graph round-trip", () => {
  test("applies and inverts InteractionInstruction graph edits through the NPC document runtime", () => {
    const document = createNpcDocument(createInteractionInstructionDocument());
    const { workspaceRuntime, context } = getNpcBehaviorContext("Instruction");
    const initialGraphDocument = resolveNpcGraphDocumentFromText({
      text: document.text,
      fieldPath: "InteractionInstruction",
      workspaceContext: context,
    });
    const adjustPositionNode = findGraphNodeByTemplateId(
      initialGraphDocument.nodes,
      "Sensor.AdjustPosition",
    );
    const edit = createOffsetEdit(adjustPositionNode.id, [0, -2, 0]);

    applyNpcGraphEditToDocument(document, {
      fieldPath: "InteractionInstruction",
      edit,
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    let parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(
      (
        ((parsed.InteractionInstruction as Record<string, unknown>).Sensor as Record<string, unknown>)
          .Sensors as Record<string, unknown>[]
      )[0].Sensor,
    ).toMatchObject({
      Type: "AdjustPosition",
      Offset: [0, -2, 0],
    });
    expect(document.getCachedGraphDocument("InteractionInstruction")?.workspaceRoot).toBe(
      "Instruction",
    );

    applyNpcGraphEditToDocument(document, {
      fieldPath: "InteractionInstruction",
      edit: invertNodeEditorGraphEdit(edit),
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(
      (
        ((parsed.InteractionInstruction as Record<string, unknown>).Sensor as Record<string, unknown>)
          .Sensors as Record<string, unknown>[]
      )[0].Sensor,
    ).toMatchObject({
      Type: "AdjustPosition",
      Offset: [0, -1, 0],
    });
  });

  test("applies and inverts DeathInstruction graph edits through the NPC document runtime", () => {
    const document = createNpcDocument(createDeathInstructionDocument());
    const { workspaceRuntime, context } = getNpcBehaviorContext("Instruction");
    const initialGraphDocument = resolveNpcGraphDocumentFromText({
      text: document.text,
      fieldPath: "DeathInstruction",
      workspaceContext: context,
    });
    const adjustPositionNode = findGraphNodeByTemplateId(
      initialGraphDocument.nodes,
      "Sensor.AdjustPosition",
    );
    const edit = createOffsetEdit(adjustPositionNode.id, [0, -5, 0]);

    applyNpcGraphEditToDocument(document, {
      fieldPath: "DeathInstruction",
      edit,
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    let parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(
      (
        ((parsed.DeathInstruction as Record<string, unknown>).Sensor as Record<string, unknown>)
          .Sensors as Record<string, unknown>[]
      )[0].Sensor,
    ).toMatchObject({
      Type: "AdjustPosition",
      Offset: [0, -5, 0],
    });

    applyNpcGraphEditToDocument(document, {
      fieldPath: "DeathInstruction",
      edit: invertNodeEditorGraphEdit(edit),
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(
      (
        ((parsed.DeathInstruction as Record<string, unknown>).Sensor as Record<string, unknown>)
          .Sensors as Record<string, unknown>[]
      )[0].Sensor,
    ).toMatchObject({
      Type: "AdjustPosition",
      Offset: [0, -1, 0],
    });
  });

  test("applies and inverts Instructions-root graph edits while preserving root metadata", () => {
    const initialDocument = createInstructionsDocument();
    const document = createNpcDocument(initialDocument);
    const { workspaceRuntime, context } = getNpcBehaviorContext("Instructions");
    const initialGraphDocument = resolveNpcGraphDocumentFromText({
      text: document.text,
      fieldPath: "Instructions",
      workspaceContext: context,
    });
    const adjustPositionNode = findGraphNodeByTemplateId(
      initialGraphDocument.nodes,
      "Sensor.AdjustPosition",
    );
    const edit = createOffsetEdit(adjustPositionNode.id, [0, -3, 0]);

    applyNpcGraphEditToDocument(document, {
      fieldPath: "Instructions",
      edit,
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    let parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(parsed.$NodeId).toBe(initialDocument.$NodeId);
    expect(parsed.$Comment).toBe(initialDocument.$Comment);
    expect(
      ((((parsed.Instructions as Record<string, unknown>[])[0].Sensor as Record<string, unknown>)
        .Sensors as Record<string, unknown>[])[0].Sensor as Record<string, unknown>).Offset,
    ).toEqual([0, -3, 0]);

    applyNpcGraphEditToDocument(document, {
      fieldPath: "Instructions",
      edit: invertNodeEditorGraphEdit(edit),
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(parsed.$NodeId).toBe(initialDocument.$NodeId);
    expect(parsed.$Comment).toBe(initialDocument.$Comment);
    expect(parsed.Instructions).toBeInstanceOf(Array);
    expect((parsed.Instructions as unknown[])).toHaveLength(2);
    expect(
      ((((parsed.Instructions as Record<string, unknown>[])[0].Sensor as Record<string, unknown>)
        .Sensors as Record<string, unknown>[])[0].Sensor as Record<string, unknown>).Offset,
    ).toEqual([0, -1, 0]);
  });

  test("reconciles embedded graph updates incrementally for reverse-authored NPC graphs", () => {
    const document = createNpcDocument(createInteractionInstructionDocument());
    const { workspaceRuntime, context } = getNpcBehaviorContext("Instruction");
    const initialGraphDocument = resolveNpcGraphDocumentFromText({
      text: document.text,
      fieldPath: "InteractionInstruction",
      workspaceContext: context,
    });
    const adjustPositionNode = findGraphNodeByTemplateId(
      initialGraphDocument.nodes,
      "Sensor.AdjustPosition",
    );
    const edit = createOffsetEdit(adjustPositionNode.id, [0, -2, 0]);
    const session = createNodeEditorSession();

    syncSessionFromGraphDocument({
      session,
      workspaceContext: context,
      graphDocument: initialGraphDocument,
      sourceVersion: document.revision,
    });

    applyNpcGraphEditToDocument(document, {
      fieldPath: "InteractionInstruction",
      edit,
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    const getFallbackGraphDocument = vi.fn(() =>
      resolveNpcGraphDocumentFromText({
        text: document.text,
        fieldPath: "InteractionInstruction",
        workspaceContext: context,
      }),
    );

    const didFullSync = reconcileSessionWithGraphUpdate({
      session,
      workspaceContext: context,
      getFallbackGraphDocument,
      version: document.revision,
      appliedEdit: edit,
    });

    expect(didFullSync).toBe(false);
    expect(getFallbackGraphDocument).not.toHaveBeenCalled();
    expect(session.sourceVersion).toBe(document.revision);

    const committedAdjustPositionNode = findGraphNodeByTemplateId(
      session.committedGraphDocument?.nodes ?? [],
      "Sensor.AdjustPosition",
    );
    expect(committedAdjustPositionNode.data.fieldsBySchemaKey.Offset?.value).toEqual([
      0,
      -2,
      0,
    ]);
  });

  test("applies and inverts graph edits for graph-backed sensor component content", () => {
    const document = createNpcDocument(createSensorComponentDocument());
    const { workspaceRuntime, context } = getNpcBehaviorContext("Sensor");
    const initialGraphDocument = resolveNpcGraphDocumentFromText({
      text: document.text,
      fieldPath: "Content",
      workspaceContext: context,
    });
    const adjustPositionNode = findGraphNodeByTemplateId(
      initialGraphDocument.nodes,
      "Sensor.AdjustPosition",
    );
    const edit = createOffsetEdit(adjustPositionNode.id, [0, -4, 0]);

    applyNpcGraphEditToDocument(document, {
      fieldPath: "Content",
      edit,
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    let parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(
      ((parsed.Content as Record<string, unknown>).Sensor as Record<string, unknown>).Offset,
    ).toEqual([0, -4, 0]);

    applyNpcGraphEditToDocument(document, {
      fieldPath: "Content",
      edit: invertNodeEditorGraphEdit(edit),
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
    });

    parsed = parseNpcRoleDocumentOrThrow(document.text).document;
    expect(
      ((parsed.Content as Record<string, unknown>).Sensor as Record<string, unknown>).Offset,
    ).toEqual([0, -1, 0]);
  });

  test("applies graph edits for all behavior component content roots", () => {
    const cases: Array<{
      document: NpcRoleJson;
      workspaceRoot: NpcGraphTargetWorkspaceRoot;
      templateId: string;
      schemaKey: string;
      beforeValue: unknown;
      afterValue: unknown;
      getUpdatedValue: (document: NpcRoleJson) => unknown;
    }> = [
      {
        document: createActionComponentDocument(),
        workspaceRoot: "Action",
        templateId: "Action.PlayAnimation",
        schemaKey: "Animation",
        beforeValue: "Idle",
        afterValue: "Wave",
        getUpdatedValue: document => (document.Content as Record<string, unknown>).Animation,
      },
      {
        document: createActionListComponentDocument(),
        workspaceRoot: "ActionList",
        templateId: "Action.PlayAnimation",
        schemaKey: "Animation",
        beforeValue: "Idle",
        afterValue: "Wave",
        getUpdatedValue: document =>
          ((document.Content as Record<string, unknown>[])[0] as Record<string, unknown>)
            .Animation,
      },
      {
        document: createBodyMotionComponentDocument(),
        workspaceRoot: "BodyMotion",
        templateId: "BodyMotion.Wander",
        schemaKey: "RelativeSpeed",
        beforeValue: 1,
        afterValue: 2,
        getUpdatedValue: document => (document.Content as Record<string, unknown>).RelativeSpeed,
      },
      {
        document: createHeadMotionComponentDocument(),
        workspaceRoot: "HeadMotion",
        templateId: "HeadMotion.Watch",
        schemaKey: "RelativeTurnSpeed",
        beforeValue: 1,
        afterValue: 2,
        getUpdatedValue: document =>
          (document.Content as Record<string, unknown>).RelativeTurnSpeed,
      },
      {
        document: createPathComponentDocument(),
        workspaceRoot: "Path",
        templateId: "Path.Path",
        schemaKey: "Scale",
        beforeValue: 1,
        afterValue: 3,
        getUpdatedValue: document => (document.Content as Record<string, unknown>).Scale,
      },
    ];

    for (const testCase of cases) {
      const document = createNpcDocument(testCase.document);
      const { workspaceRuntime, context } = getNpcBehaviorContext(testCase.workspaceRoot);
      const initialGraphDocument = resolveNpcGraphDocumentFromText({
        text: document.text,
        fieldPath: "Content",
        workspaceContext: context,
      });
      const targetNode = findGraphNodeByTemplateId(
        initialGraphDocument.nodes,
        testCase.templateId,
      );
      const edit = createFieldValueEdit(
        targetNode.id,
        testCase.schemaKey,
        testCase.beforeValue,
        testCase.afterValue,
      );

      applyNpcGraphEditToDocument(document, {
        fieldPath: "Content",
        edit,
        resolveWorkspaceContext: workspaceRoot =>
          workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", workspaceRoot),
      });

      const parsed = parseNpcRoleDocumentOrThrow(document.text).document;
      expect(testCase.getUpdatedValue(parsed)).toEqual(testCase.afterValue);
    }
  });
});
