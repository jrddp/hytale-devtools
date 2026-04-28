import path from "node:path";
import { describe, expect, test } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import { serializeGraphDocument } from "../../src/shared/node-editor/graphDocument";
import {
  applyNodeEditorGraphEdit,
  invertNodeEditorGraphEdit,
} from "../../src/shared/node-editor/graphEditUtils";
import type { NodeEditorWorkspaceContext } from "../../src/shared/node-editor/workspaceTypes";
import type { NodeEditorGraphDocument } from "../../src/shared/node-editor/graphTypes";
import { parseDocumentText } from "../../webview/hytale-node-editor/src/node-editor/parsing/parseDocument.svelte";
import { serializeWorkspaceState } from "../../webview/hytale-node-editor/src/node-editor/parsing/serializeDocument";
import {
  createFieldValuePropertyChange,
  createNodePropertiesUpdatedEdit,
} from "../../webview/hytale-node-editor/src/node-editor/utils/graphDocument";
import {
  nodeField,
  nodeTemplate,
  normalizeRoundTripJson,
} from "./helpers";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

function getNpcBehaviorContext(rootId: string): NodeEditorWorkspaceContext {
  const schemaRuntime = new SchemaRuntime(schemaDir, logger);
  const workspaceRuntime = new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);
  const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", rootId);
  if (!context) {
    throw new Error(`NPC Behavior workspace root "${rootId}" could not be resolved.`);
  }
  return context;
}

describe("node field defaults and explicit empty strings", () => {
  test("keeps random instruction default ranges unset and omitted from serialization", () => {
    const context = getNpcBehaviorContext("Instruction");
    const parsed = parseDocumentText(JSON.stringify({ Type: "Random" }), context);
    const randomNode = parsed.nodes.find(
      node => node.type === "datanode" && node.data.templateId === "Structural.RandomInstructionNode",
    );
    if (!randomNode || randomNode.type !== "datanode") {
      throw new Error("Random instruction node was not parsed.");
    }

    const executeForField = randomNode.data.fieldsBySchemaKey.ExecuteFor;
    expect(executeForField).toMatchObject({
      isSet: false,
      defaultValue: [Number.MAX_VALUE, Number.MAX_VALUE],
      value: [Number.MAX_VALUE, Number.MAX_VALUE],
    });

    const serialized = normalizeRoundTripJson(
      serializeWorkspaceState(parsed, context.rootMenuName),
    ) as Record<string, unknown>;
    expect(serialized).toMatchObject({
      Type: "Random",
    });
    expect(serialized).not.toHaveProperty("ExecuteFor");
  });

  test("keeps boolean defaults unset and omitted from serialization", () => {
    const context = getNpcBehaviorContext("Instruction");
    const parsed = parseDocumentText(JSON.stringify({ Type: "Random" }), context);
    const randomNode = parsed.nodes.find(
      node => node.type === "datanode" && node.data.templateId === "Structural.RandomInstructionNode",
    );
    if (!randomNode || randomNode.type !== "datanode") {
      throw new Error("Random instruction node was not parsed.");
    }

    expect(randomNode.data.fieldsBySchemaKey.Enabled).toMatchObject({
      isSet: false,
      defaultValue: true,
      value: true,
    });
    expect(randomNode.data.fieldsBySchemaKey.Continue).toMatchObject({
      isSet: false,
      defaultValue: false,
      value: false,
    });

    const serialized = normalizeRoundTripJson(
      serializeWorkspaceState(parsed, context.rootMenuName),
    ) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty("Enabled");
    expect(serialized).not.toHaveProperty("Continue");
  });

  test("graph edits can return slider fields to unset defaults", () => {
    const template = nodeTemplate("SliderTemplate", {
      fieldsBySchemaKey: {
        Octaves: nodeField("Octaves", "intslider", {
          defaultValue: 25,
          value: 25,
        }),
      },
    });
    const beforeField = structuredClone(template.fieldsBySchemaKey.Octaves);
    expect(beforeField).toMatchObject({
      type: "intslider",
      isSet: false,
      defaultValue: 25,
      value: 25,
    });

    const setField = {
      ...structuredClone(beforeField),
      value: 3,
      isImplicit: false,
      isSet: true,
    };
    const unsetDefaultField = {
      ...structuredClone(beforeField),
      value: undefined,
      isImplicit: true,
      isSet: false,
    };
    const graphDocument: NodeEditorGraphDocument = {
      workspaceId: "Action",
      rootNodeId: "slider",
      nodes: [
        {
          id: "slider",
          type: "datanode",
          position: { x: 0, y: 0 },
          data: template,
        },
      ],
      edges: [],
    };
    const setEdit = createNodePropertiesUpdatedEdit([
      createFieldValuePropertyChange({
        nodeId: "slider",
        schemaKey: "Octaves",
        beforeField,
        afterField: setField,
      }),
    ]);
    const unsetEdit = createNodePropertiesUpdatedEdit([
      createFieldValuePropertyChange({
        nodeId: "slider",
        schemaKey: "Octaves",
        beforeField: setField,
        afterField: unsetDefaultField,
      }),
    ]);
    if (!setEdit || !unsetEdit) {
      throw new Error("Expected slider field edits to be created.");
    }

    applyNodeEditorGraphEdit(graphDocument, setEdit);
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).toMatchObject({
      Octaves: 3,
    });

    applyNodeEditorGraphEdit(graphDocument, unsetEdit);
    expect(graphDocument.nodes[0]?.data.fieldsBySchemaKey.Octaves).toMatchObject({
      isSet: false,
      isImplicit: true,
    });
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).not.toHaveProperty(
      "Octaves",
    );
  });

  test("parses and serializes explicit empty strings for explicit-empty-capable fields", () => {
    const context = getNpcBehaviorContext("Action");
    const parsed = parseDocumentText(
      JSON.stringify({
        Type: "DisplayName",
        DisplayName: "",
      }),
      context,
    );
    const actionNode = parsed.nodes.find(
      node => node.type === "datanode" && node.data.templateId === "Action.DisplayName",
    );
    if (!actionNode || actionNode.type !== "datanode") {
      throw new Error("DisplayName action node was not parsed.");
    }

    expect(actionNode.data.fieldsBySchemaKey.DisplayName).toMatchObject({
      allowsExplicitEmpty: true,
      isExplicitEmpty: true,
      isImplicit: false,
      isSet: true,
      value: "",
    });

    expect(
      normalizeRoundTripJson(serializeWorkspaceState(parsed, context.rootMenuName)),
    ).toMatchObject({
      Type: "DisplayName",
      DisplayName: "",
    });
  });

  test("graph edits preserve explicit-empty field state through undo", () => {
    const context = getNpcBehaviorContext("Action");
    const template = context.nodeTemplatesById["Action.DisplayName"];
    const beforeField = structuredClone(template.fieldsBySchemaKey.DisplayName);
    const afterField = {
      ...structuredClone(beforeField),
      value: "",
      isImplicit: false,
      isExplicitEmpty: true,
      isSet: true,
    };
    const graphDocument: NodeEditorGraphDocument = {
      workspaceId: "Action",
      rootNodeId: "displayName",
      nodes: [
        {
          id: "displayName",
          type: "datanode",
          position: { x: 0, y: 0 },
          data: structuredClone(template),
        },
      ],
      edges: [],
    };
    const edit = createNodePropertiesUpdatedEdit([
      createFieldValuePropertyChange({
        nodeId: "displayName",
        schemaKey: "DisplayName",
        beforeField,
        afterField,
      }),
    ]);
    if (!edit) {
      throw new Error("Expected field edit to be created.");
    }

    applyNodeEditorGraphEdit(graphDocument, edit);
    expect(graphDocument.nodes[0]?.data.fieldsBySchemaKey.DisplayName).toMatchObject({
      isExplicitEmpty: true,
      isSet: true,
      value: "",
    });
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).toMatchObject({
      DisplayName: "",
    });

    applyNodeEditorGraphEdit(graphDocument, invertNodeEditorGraphEdit(edit));
    expect(graphDocument.nodes[0]?.data.fieldsBySchemaKey.DisplayName).toMatchObject({
      isExplicitEmpty: false,
      isSet: false,
    });
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).not.toHaveProperty(
      "DisplayName",
    );
  });
});
