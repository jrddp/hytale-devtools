import path from "node:path";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import {
  createComponentReferenceExportStateFieldSchemaKey,
  createComponentReferenceModifyFieldSchemaKey,
} from "../../src/shared/node-editor/componentReferences";
import type { NodeTemplate } from "../../src/shared/node-editor/workspaceTypes";
import type { FlowNode } from "../../webview/hytale-node-editor/src/common";
import { hydrateComponentReferenceNodes } from "../../webview/hytale-npc-role-editor/src/componentReferenceNodeHydration";
import { workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";

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

function getNpcTemplate(templateId: string): NodeTemplate {
  const workspaceRuntime = createWorkspaceRuntime();
  const template = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"]?.nodeTemplatesById[templateId];
  if (!template) {
    throw new Error(`NPC template "${templateId}" could not be resolved.`);
  }
  return template;
}

function createReferenceNode(
  templateId: string,
  referenceName: string,
  modify: Record<string, unknown>,
): FlowNode {
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
      unparsedMetadata: {
        Modify: structuredClone(modify),
      },
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
    documentPath: `/tmp/component-reference-${Math.random().toString(36).slice(2)}.json`,
    version: 1,
    text: JSON.stringify({ Type: "Generic" }, null, 2),
  });
  workspace.discoveredStates = ["Idle", "Alerted", "Sleep"];
  workspace.componentReferenceTargets = new Map();
});

describe("npc component reference node hydration", () => {
  test("hydrates named export-state rows and active override rows from a resolved component target", () => {
    const referenceName = "Component_Sensor_Sound";
    workspace.setComponentReferenceTarget({
      status: "loaded",
      componentClass: "Sensor",
      referenceName,
      parameters: {
        _ImportStates: ["ComponentAlert"],
        Range: {
          Value: 5,
          Description: "How far the sensor can detect targets.",
        },
        UseTarget: {
          Value: false,
          Description: "Whether the referenced sensor should use the current target.",
        },
      },
    });

    const [hydratedNode] = hydrateComponentReferenceNodes({
      nodes: [
        createReferenceNode("Sensor.Reference", referenceName, {
          Range: 10,
          _ExportStates: ["Alerted"],
        }),
      ],
      descriptors: parseDescriptors(),
      discoveredStates: workspace.discoveredStates,
    });

    const exportStateField =
      hydratedNode.type === "datanode"
        ? hydratedNode.data.fieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(0)]
        : undefined;
    const rangeField =
      hydratedNode.type === "datanode"
        ? hydratedNode.data.fieldsBySchemaKey[createComponentReferenceModifyFieldSchemaKey("Range")]
        : undefined;
    const useTargetField =
      hydratedNode.type === "datanode"
        ? hydratedNode.data.fieldsBySchemaKey[
            createComponentReferenceModifyFieldSchemaKey("UseTarget")
          ]
        : undefined;

    expect(exportStateField).toMatchObject({
      label: "ComponentAlert",
      value: "Alerted",
      overrideAutocompleteValues: ["Idle", "Alerted", "Sleep"],
    });
    expect(rangeField).toMatchObject({
      label: "Range",
      value: 10,
      description: "How far the sensor can detect targets.",
      isImplicit: false,
    });
    expect(useTargetField).toMatchObject({
      label: "Use Target",
      value: false,
      description: "Whether the referenced sensor should use the current target.",
      isImplicit: true,
    });
  });

  test("preserves unresolved modify/export-state data and requests the target document", () => {
    const referenceName = "Component_Sensor_Missing";
    const postMessage = vi.fn();
    workspace.vscode = {
      postMessage,
    } as never;

    const [hydratedNode] = hydrateComponentReferenceNodes({
      nodes: [
        createReferenceNode("Sensor.Reference", referenceName, {
          CustomToggle: true,
          _ExportStates: ["Idle"],
        }),
      ],
      descriptors: parseDescriptors(),
      discoveredStates: workspace.discoveredStates,
    });

    const exportStateField =
      hydratedNode.type === "datanode"
        ? hydratedNode.data.fieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(0)]
        : undefined;
    const customToggleField =
      hydratedNode.type === "datanode"
        ? hydratedNode.data.fieldsBySchemaKey[createComponentReferenceModifyFieldSchemaKey("CustomToggle")]
        : undefined;

    expect(postMessage).toHaveBeenCalledWith({
      type: "resolveComponentReferenceTarget",
      componentClass: "Sensor",
      referenceName,
    });
    expect(exportStateField).toMatchObject({
      label: "Export State 1",
      value: "Idle",
    });
    expect(customToggleField).toMatchObject({
      label: "Custom Toggle",
      value: true,
    });
    expect(workspace.getComponentReferenceTarget("Sensor", referenceName)).toMatchObject({
      status: "loading",
      componentClass: "Sensor",
      referenceName,
    });
  });

  test("prefers current explicit synthetic field values over stale unparsed metadata during rehydration", () => {
    const referenceName = "Component_Sensor_Sound";
    workspace.setComponentReferenceTarget({
      status: "loaded",
      componentClass: "Sensor",
      referenceName,
      parameters: {
        _ImportStates: ["ComponentAlert"],
        Range: {
          Value: 5,
        },
      },
    });

    const node = createReferenceNode("Sensor.Reference", referenceName, {
      Range: 5,
      _ExportStates: ["Idle"],
    });
    if (node.type !== "datanode") {
      throw new Error("Expected data node.");
    }

    node.data.fieldsBySchemaKey[createComponentReferenceModifyFieldSchemaKey("Range")] = {
      schemaKey: createComponentReferenceModifyFieldSchemaKey("Range"),
      localId: createComponentReferenceModifyFieldSchemaKey("Range"),
      type: "float",
      label: "Range",
      value: 10,
      isImplicit: false,
    };
    node.data.fieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(0)] = {
      schemaKey: createComponentReferenceExportStateFieldSchemaKey(0),
      localId: createComponentReferenceExportStateFieldSchemaKey(0),
      type: "string",
      label: "ComponentAlert",
      value: "Alerted",
      isImplicit: false,
    };

    const [rehydratedNode] = hydrateComponentReferenceNodes({
      nodes: [node],
      descriptors: parseDescriptors(),
      discoveredStates: workspace.discoveredStates,
    });

    expect(
      rehydratedNode.type === "datanode"
        ? rehydratedNode.data.fieldsBySchemaKey[createComponentReferenceModifyFieldSchemaKey("Range")]
        : undefined,
    ).toMatchObject({
      value: 10,
      isImplicit: false,
    });
    expect(
      rehydratedNode.type === "datanode"
        ? rehydratedNode.data.fieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(0)]
        : undefined,
    ).toMatchObject({
      value: "Alerted",
      isImplicit: false,
    });
  });

  test("updates derived rows when the reference target changes between hydrations", () => {
    const oldReferenceName = "Component_Sensor_Sound";
    const newReferenceName = "Component_Sensor_Block";
    workspace.setComponentReferenceTarget({
      status: "loaded",
      componentClass: "Sensor",
      referenceName: oldReferenceName,
      parameters: {
        _ImportStates: ["OldState"],
        Range: {
          Value: 5,
        },
      },
    });
    workspace.setComponentReferenceTarget({
      status: "loaded",
      componentClass: "Sensor",
      referenceName: newReferenceName,
      parameters: {
        _ImportStates: ["NewState"],
        UseTarget: {
          Value: false,
        },
      },
    });

    const [initialNode] = hydrateComponentReferenceNodes({
      nodes: [createReferenceNode("Sensor.Reference", oldReferenceName, {})],
      descriptors: parseDescriptors(),
      discoveredStates: workspace.discoveredStates,
    });

    if (initialNode.type !== "datanode") {
      throw new Error("Expected data node.");
    }

    initialNode.data.fieldsBySchemaKey.Reference = {
      ...initialNode.data.fieldsBySchemaKey.Reference,
      value: newReferenceName,
      isImplicit: false,
    };

    const [rehydratedNode] = hydrateComponentReferenceNodes({
      nodes: [initialNode],
      descriptors: parseDescriptors(),
      discoveredStates: workspace.discoveredStates,
    });

    expect(
      rehydratedNode.type === "datanode"
        ? rehydratedNode.data.fieldsBySchemaKey[createComponentReferenceExportStateFieldSchemaKey(0)]
        : undefined,
    ).toMatchObject({
      label: "NewState",
    });
    expect(
      rehydratedNode.type === "datanode"
        ? rehydratedNode.data.fieldsBySchemaKey[createComponentReferenceModifyFieldSchemaKey("UseTarget")]
        : undefined,
    ).toMatchObject({
      label: "Use Target",
      isImplicit: true,
    });
    expect(
      rehydratedNode.type === "datanode"
        ? rehydratedNode.data.fieldsBySchemaKey[createComponentReferenceModifyFieldSchemaKey("Range")]
        : undefined,
    ).toBeUndefined();
  });
});
