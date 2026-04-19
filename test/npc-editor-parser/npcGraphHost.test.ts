import path from "node:path";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import {
  createComponentReferenceModifyFieldSchemaKey,
} from "../../src/shared/node-editor/componentReferences";
import type { NodeTemplate } from "../../src/shared/node-editor/workspaceTypes";
import type { FlowNode } from "../../webview/hytale-node-editor/src/common";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import {
  applyNpcGraphUpdateToSession,
  hydrateNpcGraphSessionNodes,
  syncNpcGraphSessionFromDocument,
} from "../../webview/hytale-npc-role-editor/src/npcGraphHost";
import { workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";
import { resolveNpcGraphDocumentFromText } from "../../src/shared/npc-role-editor/graphDocumentRuntime";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");
const descriptorsPath = path.resolve(process.cwd(), "default-data/export-data/npc_descriptors.json");

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

function parseDescriptors(): NpcDescriptorDocument {
  return JSON.parse(readFileSync(descriptorsPath, "utf8")) as NpcDescriptorDocument;
}

function getNpcBehaviorContext(rootId: "Instructions" | "Instruction" | "Sensor") {
  const workspaceRuntime = createWorkspaceRuntime();
  const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", rootId);
  if (!context) {
    throw new Error(`NPC Behavior workspace root "${rootId}" could not be resolved.`);
  }
  return context;
}

function createInteractionInstructionDocument() {
  return {
    Type: "Generic",
    InteractionInstruction: {
      $NodeId: "Instruction-11111111-1111-4111-8111-111111111111",
      Name: "Interaction Name",
    },
    DeathInstruction: {
      $NodeId: "Instruction-22222222-2222-4222-8222-222222222222",
      Name: "Death Name",
    },
  };
}

function getNpcTemplate(templateId: string): NodeTemplate {
  const workspaceRuntime = createWorkspaceRuntime();
  const template = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"]?.nodeTemplatesById[templateId];
  if (!template) {
    throw new Error(`NPC template "${templateId}" could not be resolved.`);
  }
  return template;
}

function createReferenceNode(templateId: string, referenceName: string): FlowNode {
  const template = getNpcTemplate(templateId);
  return {
    id: `${templateId}-node`,
    type: "datanode",
    position: { x: 0, y: 0 },
    data: {
      ...structuredClone(template),
      fieldsBySchemaKey: {
        ...structuredClone(template.fieldsBySchemaKey),
        Reference: {
          ...structuredClone(template.fieldsBySchemaKey.Reference),
          value: referenceName,
          isImplicit: false,
        },
      },
      unparsedMetadata: {},
    },
  } as FlowNode;
}

beforeEach(() => {
  workspace.vscode = {
    postMessage: vi.fn(),
  } as never;
  workspace.setDescriptors({
    descriptors: parseDescriptors(),
    descriptorPath: descriptorsPath,
    descriptorSource: "default-data",
  });
  workspace.setDocument({
    documentPath: `/tmp/npc-graph-host-${Math.random().toString(36).slice(2)}.json`,
    version: 1,
    text: JSON.stringify({ Type: "Generic" }, null, 2),
  });
  workspace.discoveredStates = ["Idle", "Alerted"];
  workspace.componentReferenceTargets = new Map();
});

describe("npc graph host helpers", () => {
  test("syncNpcGraphSessionFromDocument performs a full sync when the active graph field changes", () => {
    const context = getNpcBehaviorContext("Instruction");
    const text = JSON.stringify(createInteractionInstructionDocument(), null, 2);
    const session = createNodeEditorSession();

    const interactionGraphDocument = resolveNpcGraphDocumentFromText({
      text,
      fieldPath: "InteractionInstruction",
      workspaceContext: context,
    });
    const deathGraphDocument = resolveNpcGraphDocumentFromText({
      text,
      fieldPath: "DeathInstruction",
      workspaceContext: context,
    });

    session.context = context;
    session.nodes = structuredClone(interactionGraphDocument.nodes) as never;
    session.edges = structuredClone(interactionGraphDocument.edges) as never;
    session.rootNodeId = interactionGraphDocument.rootNodeId;
    session.committedGraphDocument = interactionGraphDocument;
    session.sourceVersion = 1;
    session.isInitialized = true;

    const didFullSync = syncNpcGraphSessionFromDocument({
      session,
      workspaceContext: context,
      fieldPath: "DeathInstruction",
      documentText: text,
      documentVersion: 2,
      lastSyncedGraphFieldPath: "InteractionInstruction",
      getFallbackGraphDocument: incomingText =>
        resolveNpcGraphDocumentFromText({
          text: incomingText,
          fieldPath: "DeathInstruction",
          workspaceContext: context,
        }),
      shouldQueueInitialFitView: false,
    });

    expect(didFullSync).toBe(true);
    expect(session.sourceVersion).toBe(2);
    expect(session.rootNodeId).toBe(deathGraphDocument.rootNodeId);
    expect(session.committedGraphDocument?.nodes[0]?.data.fieldsBySchemaKey.Name?.value).toBe(
      "Death Name",
    );
  });

  test("applyNpcGraphUpdateToSession uses the incremental path for applied edits", () => {
    const context = getNpcBehaviorContext("Instruction");
    const session = createNodeEditorSession();
    session.context = context;
    session.sourceVersion = 1;
    session.committedGraphDocument = {
      workspaceId: "Instruction",
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          type: "datanode",
          position: { x: 0, y: 0 },
          data: {
            ...getNpcTemplate("Structural.InstructionNode"),
            titleOverride: "Before",
          },
        } as never,
      ],
      edges: [],
    };
    session.nodes = structuredClone(session.committedGraphDocument.nodes) as never;
    session.edges = [];
    session.rootNodeId = "root";

    const getFallbackGraphDocument = vi.fn(() => session.committedGraphDocument!);

    const didFullSync = applyNpcGraphUpdateToSession({
      session,
      workspaceContext: context,
      graphUpdate: {
        type: "graphUpdate",
        documentPath: "/tmp/TestNpc.json",
        version: 2,
        text: "{}",
        fieldPath: "InteractionInstruction",
        appliedEdit: {
          kind: "node-renamed",
          changes: [
            {
              nodeId: "root",
              beforeTitleOverride: "Before",
              afterTitleOverride: "After",
            },
          ],
        },
      },
      getFallbackGraphDocument,
      shouldQueueInitialFitView: false,
    });

    expect(didFullSync).toBe(false);
    expect(getFallbackGraphDocument).not.toHaveBeenCalled();
    expect(session.committedGraphDocument?.nodes[0]?.data.titleOverride).toBe("After");
  });

  test("hydrateNpcGraphSessionNodes applies component-reference overlays to session nodes", () => {
    const session = createNodeEditorSession();
    session.isInitialized = true;
    session.nodes = [createReferenceNode("Sensor.Reference", "Component_Sensor_Sound")] as never;

    workspace.setComponentReferenceTarget({
      status: "loaded",
      componentClass: "Sensor",
      referenceName: "Component_Sensor_Sound",
      text: JSON.stringify({
        Type: "Component",
        Class: "Sensor",
        Parameters: {
          Range: {
            Value: 5,
          },
        },
        Content: {
          Type: "Block",
        },
      }),
    });

    hydrateNpcGraphSessionNodes({
      session,
      descriptors: parseDescriptors(),
      discoveredStates: workspace.discoveredStates,
    });

    expect(
      session.nodes[0]?.type === "datanode"
        ? session.nodes[0].data.fieldsBySchemaKey[
            createComponentReferenceModifyFieldSchemaKey("Range")
          ]
        : undefined,
    ).toMatchObject({
      label: "Range",
      isImplicit: true,
    });
  });
});
