import path from "node:path";
import { describe, expect, test } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import type { NodeEditorWorkspaceContext, NodeTemplate } from "../../src/shared/node-editor/workspaceTypes";
import {
  createComponentReferenceExportStatesFieldSchemaKey,
  createComponentReferenceInterfaceParametersFieldSchemaKey,
  createComponentReferenceModifyFieldSchemaKey,
  createComponentReferenceModifyMapFieldSchemaKey,
} from "../../src/shared/node-editor/componentReferences";
import { serializeGraphDocument } from "../../src/shared/node-editor/graphDocument";
import {
  applyNodeEditorGraphEdit,
  invertNodeEditorGraphEdit,
} from "../../src/shared/node-editor/graphEditUtils";
import type { FlowEdge, FlowNode } from "../../webview/hytale-node-editor/src/common";
import { parseDocumentText } from "../../webview/hytale-node-editor/src/node-editor/parsing/parseDocument.svelte";
import {
  collectConflictingEdges,
  getCompatibleInputHandleId,
} from "../../webview/hytale-node-editor/src/node-editor/utils/nodeUtils.svelte";
import { serializeWorkspaceState } from "../../webview/hytale-node-editor/src/node-editor/parsing/serializeDocument";
import { createNodeEditorSession } from "../../webview/hytale-node-editor/src/workspace.svelte";
import {
  areSemanticallyEquivalentValues,
  formatSemanticDiff,
  normalizeRoundTripJson,
  normalizeWorkspaceStateForSemanticComparison,
} from "./helpers";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");

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

function getNpcBehaviorWorkspace() {
  const workspaceRuntime = createWorkspaceRuntime();
  const workspace = workspaceRuntime.nodeEditorWorkspaces["NPC Behavior"];
  expect(workspace).toBeDefined();
  return workspace;
}

function getNpcBehaviorContext(rootId: "Instructions" | "Instruction" | "Sensor"): NodeEditorWorkspaceContext {
  const workspaceRuntime = createWorkspaceRuntime();
  const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot("NPC Behavior", rootId);
  if (!context) {
    throw new Error(`NPC Behavior workspace root "${rootId}" could not be resolved.`);
  }
  return context;
}

function expectSemanticRoundTrip(
  documentRoot: Record<string, unknown>,
  context: NodeEditorWorkspaceContext,
): Record<string, unknown> {
  const parsed = parseDocumentText(JSON.stringify(documentRoot), context);
  const serialized = normalizeRoundTripJson(
    serializeWorkspaceState(parsed, context.rootMenuName),
  ) as Record<string, unknown>;
  const reparsed = parseDocumentText(JSON.stringify(serialized), context);
  const expected = normalizeWorkspaceStateForSemanticComparison(parsed);
  const actual = normalizeWorkspaceStateForSemanticComparison(reparsed);

  if (!areSemanticallyEquivalentValues(expected, actual)) {
    throw new Error(formatSemanticDiff(expected, actual));
  }

  return serialized;
}

function findTemplateNodeIds(nodes: FlowNode[]): string[] {
  return nodes
    .filter((node): node is FlowNode & { type: "datanode" } => node.type === "datanode")
    .map(node => node.data.templateId);
}

function createDataNode(id: string, template: NodeTemplate): FlowNode {
  return {
    id,
    type: "datanode",
    position: { x: 0, y: 0 },
    data: structuredClone(template),
  } as FlowNode;
}

function createEdge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
  } as FlowEdge;
}

describe("NPC behavior component references", () => {
  test("generates component-reference templates, autocomplete filters, and reference-enabled slots", () => {
    const workspace = getNpcBehaviorWorkspace();

    expect(workspace.nodeTemplatesById["Structural.InstructionReference"]).toMatchObject({
      isComponentReference: true,
      componentReferenceClass: "Instruction",
    });
    expect(workspace.nodeTemplatesById["Sensor.Reference"]).toMatchObject({
      isComponentReference: true,
      componentReferenceClass: "Sensor",
    });
    expect(workspace.nodeTemplatesById["Action.ActionReference"]).toMatchObject({
      isComponentReference: true,
      componentReferenceClass: "Action",
    });
    expect(workspace.nodeTemplatesById["Action.ActionListReference"]).toMatchObject({
      isComponentReference: true,
      componentReferenceClass: "ActionList",
      slotOccupancy: "whole-slot",
    });
    expect(workspace.nodeTemplatesById["Path.Reference"]).toMatchObject({
      isComponentReference: true,
      componentReferenceClass: "Path",
    });

    expect(
      workspace.nodeTemplatesById["Sensor.Reference"].fieldsBySchemaKey.Reference.symbolLookup,
    ).toMatchObject({
      indexKind: "registeredAssets",
      key: "NPCRole",
      filter: {
        npcRoleTypes: ["Component"],
        npcComponentClasses: ["Sensor"],
      },
    });
    expect(workspace.nodeTemplatesById["Sensor.Reference"].fieldsBySchemaKey.Reference.computable).toBe(true);
    expect(workspace.nodeTemplatesById["Sensor.Reference"].fieldsBySchemaKey.Nullable).toMatchObject({
      type: "checkbox",
      value: false,
    });
    expect(workspace.nodeTemplatesById["Sensor.Reference"].fieldsBySchemaKey.Interfaces).toMatchObject({
      type: "list",
      value: [],
      symbolLookup: {
        indexKind: "assetDerived",
        key: "npcComponentInterfaces",
      },
    });
    expect(
      workspace.nodeTemplatesById["Action.ActionReference"].fieldsBySchemaKey.Reference.symbolLookup,
    ).toMatchObject({
      filter: {
        npcRoleTypes: ["Component"],
        npcComponentClasses: ["Action"],
      },
    });

    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].childSchemas.Sensor).toMatchObject({
      allowComponentReferences: true,
    });
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].childSchemas.BodyMotion).toMatchObject({
      allowComponentReferences: true,
    });
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].childSchemas.HeadMotion).toMatchObject({
      allowComponentReferences: true,
    });
    expect(workspace.nodeTemplatesById["Structural.InstructionNode"].childSchemas.Actions).toMatchObject({
      allowComponentReferences: true,
    });
    expect(workspace.nodeTemplatesById["Action.Timeout"].childSchemas.Action).toMatchObject({
      allowComponentReferences: true,
    });
    expect(workspace.nodeTemplatesById["Action.MakePath"].childSchemas.Path).toMatchObject({
      allowComponentReferences: true,
    });
    expect(workspace.nodeTemplatesById["Structural.ActionListRoot"].childSchemas.Actions).toMatchObject({
      allowComponentReferences: true,
      componentReferenceSlotOccupancy: "normal-item",
    });

    expect(workspace.connectionTypesById.Action.extends).toContain("ActionListItem");
    expect(workspace.connectionTypesById.ActionListReference.extends).toContain("ActionListItem");
    expect(workspace.nodeTemplatesById["Action.ActionReference"].inputPins).toHaveLength(1);
    expect(workspace.nodeTemplatesById["Action.ActionReference"].inputPins[0]).toMatchObject({
      connectionType: "ActionListItem",
      label: "Parent",
    });
    expect(workspace.nodeTemplatesById["Action.ActionListReference"].inputPins).toHaveLength(1);
    expect(workspace.nodeTemplatesById["Action.ActionListReference"].inputPins[0]).toMatchObject({
      connectionType: "ActionListItem",
      label: "Parent",
    });
  });

  test("round-trips an instruction reference wrapper at the root", () => {
    const context = getNpcBehaviorContext("Instruction");
    const documentRoot = {
      Reference: "Component_Instruction_Generic_Idle",
      Modify: {
        UseTarget: true,
        _ExportStates: ["Idle"],
      },
    };

    const parsed = parseDocumentText(JSON.stringify(documentRoot), context);
    expect(findTemplateNodeIds(parsed.nodes)).toContain("Structural.InstructionReference");

    const serialized = expectSemanticRoundTrip(documentRoot, context);
    expect(serialized).toMatchObject({
      Reference: "Component_Instruction_Generic_Idle",
      Modify: {
        UseTarget: true,
        _ExportStates: ["Idle"],
      },
    });
    expect(serialized).not.toHaveProperty("Type");
  });

  test("round-trips a computed instruction reference wrapper at the root", () => {
    const context = getNpcBehaviorContext("Instruction");
    const documentRoot = {
      Reference: {
        Compute: "SelectedInstruction",
      },
      Nullable: true,
      Interfaces: ["Hytale.Test.Component.Seek"],
      Modify: {
        Range: 6,
        Tags: ["Aggro", "Close"],
        Flags: [true, false],
        _ExportStates: ["Idle", "Alerted"],
        _InterfaceParameters: {
          "Hytale.Test.Component.Seek": {
            Range: {
              Compute: "SeekRange",
            },
          },
        },
      },
    };

    const parsed = parseDocumentText(JSON.stringify(documentRoot), context);
    expect(findTemplateNodeIds(parsed.nodes)).toContain("Structural.InstructionReference");

    const serialized = expectSemanticRoundTrip(documentRoot, context);
    expect(serialized).toMatchObject(documentRoot);
    expect(serialized).not.toHaveProperty("Type");
  });

  test("serializes edited computed reference parameter maps to Modify", () => {
    const context = getNpcBehaviorContext("Instruction");
    const template = context.nodeTemplatesById["Structural.InstructionReference"];
    const node = createDataNode("computed-ref", template);
    if (node.type !== "datanode") {
      throw new Error("Expected data node.");
    }

    const modifyMapKey = createComponentReferenceModifyMapFieldSchemaKey();
    const exportStatesKey = createComponentReferenceExportStatesFieldSchemaKey();
    const interfaceParametersKey =
      createComponentReferenceInterfaceParametersFieldSchemaKey("Hytale.Test.Component.Seek");
    node.data.fieldsBySchemaKey = {
      ...structuredClone(template.fieldsBySchemaKey),
      Reference: {
        ...structuredClone(template.fieldsBySchemaKey.Reference),
        value: {
          Compute: "SelectedInstruction",
        },
        isImplicit: false,
        isSet: true,
      },
      Nullable: {
        ...structuredClone(template.fieldsBySchemaKey.Nullable),
        value: true,
        isImplicit: false,
        isSet: true,
      },
      Interfaces: {
        ...structuredClone(template.fieldsBySchemaKey.Interfaces),
        value: ["Hytale.Test.Component.Seek"],
        isImplicit: false,
        isSet: true,
      },
      [modifyMapKey]: {
        schemaKey: modifyMapKey,
        localId: modifyMapKey,
        type: "parameterMap",
        label: "Parameters",
        value: {
          Range: 6,
          Tags: ["Aggro", "Close"],
          Enabled: true,
        },
        isImplicit: false,
        isSet: true,
      },
      [exportStatesKey]: {
        schemaKey: exportStatesKey,
        localId: exportStatesKey,
        type: "list",
        label: "Export States",
        value: ["Idle"],
        isImplicit: false,
        isSet: true,
      },
      [interfaceParametersKey]: {
        schemaKey: interfaceParametersKey,
        localId: interfaceParametersKey,
        type: "parameterMap",
        label: "Hytale.Test.Component.Seek Parameters",
        value: {
          Range: {
            Compute: "SeekRange",
          },
        },
        isImplicit: false,
        isSet: true,
      },
    };

    const serialized = normalizeRoundTripJson(
      serializeWorkspaceState(
        {
          nodes: [node],
          edges: [],
          rootNodeId: node.id,
        },
        context.rootMenuName,
      ),
    );

    expect(serialized).toMatchObject({
      Reference: {
        Compute: "SelectedInstruction",
      },
      Nullable: true,
      Interfaces: ["Hytale.Test.Component.Seek"],
      Modify: {
        Range: 6,
        Tags: ["Aggro", "Close"],
        Enabled: true,
        _ExportStates: ["Idle"],
        _InterfaceParameters: {
          "Hytale.Test.Component.Seek": {
            Range: {
              Compute: "SeekRange",
            },
          },
        },
      },
    });
  });

  test("graph edits can create and undo synthetic computed-reference fields", () => {
    const context = getNpcBehaviorContext("Instruction");
    const template = context.nodeTemplatesById["Structural.InstructionReference"];
    const node = createDataNode("computed-ref-edit", template);
    if (node.type !== "datanode") {
      throw new Error("Expected data node.");
    }

    node.data.fieldsBySchemaKey.Reference = {
      ...structuredClone(template.fieldsBySchemaKey.Reference),
      value: {
        Compute: "SelectedInstruction",
      },
      isImplicit: false,
      isSet: true,
    };

    const modifyMapKey = createComponentReferenceModifyMapFieldSchemaKey();
    const afterField = {
      schemaKey: modifyMapKey,
      localId: modifyMapKey,
      type: "parameterMap",
      label: "Parameters",
      value: {
        Range: 6,
      },
      isImplicit: false,
      isSet: true,
    } as const;
    const graphDocument = {
      workspaceId: "Instruction",
      rootNodeId: node.id,
      nodes: [node],
      edges: [],
    } as never;
    const edit = {
      kind: "node-properties-updated",
      propertyChanges: [
        {
          type: "field-value",
          nodeId: node.id,
          schemaKey: modifyMapKey,
          beforeValue: undefined,
          afterValue: afterField.value,
          beforeField: undefined,
          afterField,
        },
      ],
    } as const;

    applyNodeEditorGraphEdit(graphDocument, edit);
    expect(graphDocument.nodes[0]?.data.fieldsBySchemaKey[modifyMapKey]).toMatchObject(afterField);
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).toMatchObject({
      Reference: {
        Compute: "SelectedInstruction",
      },
      Modify: {
        Range: 6,
      },
    });

    applyNodeEditorGraphEdit(graphDocument, invertNodeEditorGraphEdit(edit));
    expect(graphDocument.nodes[0]?.data.fieldsBySchemaKey).not.toHaveProperty(modifyMapKey);
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).not.toHaveProperty("Modify");
  });

  test("graph edits can reset computed-reference fields and unparsed Modify when compute turns off", () => {
    const context = getNpcBehaviorContext("Instruction");
    const template = context.nodeTemplatesById["Structural.InstructionReference"];
    const node = createDataNode("computed-ref-reset", template);
    if (node.type !== "datanode") {
      throw new Error("Expected data node.");
    }

    const modifyMapKey = createComponentReferenceModifyMapFieldSchemaKey();
    const exportStatesKey = createComponentReferenceExportStatesFieldSchemaKey();
    const interfaceParametersKey =
      createComponentReferenceInterfaceParametersFieldSchemaKey("Hytale.Test.Component.Seek");
    const modifyFieldKey = createComponentReferenceModifyFieldSchemaKey("LegacyRange");
    node.data.unparsedMetadata = {
      Modify: {
        LegacyRange: 5,
        _ExportStates: ["Idle"],
      },
      OtherMetadata: true,
    };
    node.data.fieldsBySchemaKey = {
      ...structuredClone(template.fieldsBySchemaKey),
      Reference: {
        ...structuredClone(template.fieldsBySchemaKey.Reference),
        value: {
          Compute: "SelectedInstruction",
        },
        isImplicit: false,
        isSet: true,
      },
      Nullable: {
        ...structuredClone(template.fieldsBySchemaKey.Nullable),
        value: true,
        isImplicit: false,
        isSet: true,
      },
      Interfaces: {
        ...structuredClone(template.fieldsBySchemaKey.Interfaces),
        value: ["Hytale.Test.Component.Seek"],
        isImplicit: false,
        isSet: true,
      },
      [modifyMapKey]: {
        schemaKey: modifyMapKey,
        localId: modifyMapKey,
        type: "parameterMap",
        label: "Parameters",
        value: {
          Range: 6,
        },
        isImplicit: false,
        isSet: true,
      },
      [exportStatesKey]: {
        schemaKey: exportStatesKey,
        localId: exportStatesKey,
        type: "list",
        label: "Export States",
        value: ["Alerted"],
        isImplicit: false,
        isSet: true,
      },
      [interfaceParametersKey]: {
        schemaKey: interfaceParametersKey,
        localId: interfaceParametersKey,
        type: "parameterMap",
        label: "Hytale.Test.Component.Seek Parameters",
        value: {
          Range: {
            Compute: "SeekRange",
          },
        },
        isImplicit: false,
        isSet: true,
      },
      [modifyFieldKey]: {
        schemaKey: modifyFieldKey,
        localId: modifyFieldKey,
        type: "float",
        label: "Legacy Range",
        value: 5,
        isImplicit: false,
        isSet: true,
      },
    };

    const graphDocument = {
      workspaceId: "Instruction",
      rootNodeId: node.id,
      nodes: [node],
      edges: [],
    } as never;
    const previousFields = structuredClone(node.data.fieldsBySchemaKey);
    const previousUnparsedMetadata = structuredClone(node.data.unparsedMetadata);
    const nextReferenceField = {
      ...structuredClone(previousFields.Reference),
      value: "Component_Instruction_Generic_Idle",
      isImplicit: false,
      isSet: true,
    };
    const edit = {
      kind: "node-properties-updated",
      propertyChanges: [
        {
          type: "field-value",
          nodeId: node.id,
          schemaKey: "Reference",
          beforeField: previousFields.Reference,
          afterField: nextReferenceField,
          beforeValue: previousFields.Reference.value,
          afterValue: nextReferenceField.value,
        },
        ...[
          "Nullable",
          "Interfaces",
          modifyMapKey,
          exportStatesKey,
          interfaceParametersKey,
          modifyFieldKey,
        ].map(schemaKey => ({
          type: "field-value" as const,
          nodeId: node.id,
          schemaKey,
          beforeField: previousFields[schemaKey],
          afterField: undefined,
          beforeValue: previousFields[schemaKey]?.value,
          afterValue: undefined,
        })),
        {
          type: "unparsed-metadata",
          nodeId: node.id,
          beforeUnparsedMetadata: previousUnparsedMetadata,
          afterUnparsedMetadata: {
            OtherMetadata: true,
          },
        },
      ],
    } as const;

    applyNodeEditorGraphEdit(graphDocument, edit);
    const fieldsAfterReset = graphDocument.nodes[0]?.data.fieldsBySchemaKey;
    expect(fieldsAfterReset).toHaveProperty("Reference");
    expect(fieldsAfterReset).not.toHaveProperty("Nullable");
    expect(fieldsAfterReset).not.toHaveProperty("Interfaces");
    expect(fieldsAfterReset).not.toHaveProperty(modifyMapKey);
    expect(fieldsAfterReset).not.toHaveProperty(exportStatesKey);
    expect(fieldsAfterReset).not.toHaveProperty(interfaceParametersKey);
    expect(fieldsAfterReset).not.toHaveProperty(modifyFieldKey);
    expect(graphDocument.nodes[0]?.data.unparsedMetadata).toEqual({
      OtherMetadata: true,
    });
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).not.toHaveProperty("Modify");

    applyNodeEditorGraphEdit(graphDocument, invertNodeEditorGraphEdit(edit));
    expect(graphDocument.nodes[0]?.data.fieldsBySchemaKey).toMatchObject(previousFields);
    expect(graphDocument.nodes[0]?.data.unparsedMetadata).toEqual(previousUnparsedMetadata);
    expect(normalizeRoundTripJson(serializeGraphDocument(graphDocument))).toMatchObject({
      Reference: {
        Compute: "SelectedInstruction",
      },
      Interfaces: ["Hytale.Test.Component.Seek"],
      Nullable: true,
      Modify: {
        Range: 6,
        _ExportStates: ["Alerted"],
        _InterfaceParameters: {
          "Hytale.Test.Component.Seek": {
            Range: {
              Compute: "SeekRange",
            },
          },
        },
      },
    });
  });

  test("does not serialize hidden computed-only fields while a reference is static", () => {
    const context = getNpcBehaviorContext("Instruction");
    const template = context.nodeTemplatesById["Structural.InstructionReference"];
    const node = createDataNode("static-ref", template);
    if (node.type !== "datanode") {
      throw new Error("Expected data node.");
    }

    const interfaceParametersKey =
      createComponentReferenceInterfaceParametersFieldSchemaKey("Hytale.Test.Component.Seek");
    node.data.fieldsBySchemaKey = {
      ...structuredClone(template.fieldsBySchemaKey),
      Reference: {
        ...structuredClone(template.fieldsBySchemaKey.Reference),
        value: "Component_Instruction_Generic_Idle",
        isImplicit: false,
        isSet: true,
      },
      Nullable: {
        ...structuredClone(template.fieldsBySchemaKey.Nullable),
        value: true,
        isImplicit: false,
        isSet: true,
      },
      Interfaces: {
        ...structuredClone(template.fieldsBySchemaKey.Interfaces),
        value: ["Hytale.Test.Component.Seek"],
        isImplicit: false,
        isSet: true,
      },
      [interfaceParametersKey]: {
        schemaKey: interfaceParametersKey,
        localId: interfaceParametersKey,
        type: "parameterMap",
        label: "Hytale.Test.Component.Seek Parameters",
        value: {
          Range: 6,
        },
        isImplicit: false,
        isSet: true,
      },
    };

    const serialized = normalizeRoundTripJson(
      serializeWorkspaceState(
        {
          nodes: [node],
          edges: [],
          rootNodeId: node.id,
        },
        context.rootMenuName,
      ),
    );

    expect(serialized).toMatchObject({
      Reference: "Component_Instruction_Generic_Idle",
    });
    expect(serialized).not.toHaveProperty("Nullable");
    expect(serialized).not.toHaveProperty("Interfaces");
    expect(serialized).not.toHaveProperty("Modify");
  });

  test("round-trips child component references for sensor, motions, action items, and paths", () => {
    const context = getNpcBehaviorContext("Instruction");
    const documentRoot = {
      Name: "Use Component References",
      Sensor: {
        Reference: "Component_Sensor_Sound",
        Modify: {
          Range: 10,
          _ExportStates: ["Alerted"],
        },
      },
      BodyMotion: {
        Reference: "Component_BodyMotion_Idle",
        Modify: {
          BlendDuration: 0.2,
        },
      },
      HeadMotion: {
        Reference: "Component_HeadMotion_Idle",
        Modify: {
          TrackTarget: true,
        },
      },
      Actions: [
        {
          Reference: "Component_Test_Action_Sequence",
          Modify: {
            Delay: 0.5,
          },
        },
        {
          Type: "MakePath",
          Path: {
            Reference: "Component_Path_Test",
            Modify: {
              IgnoreObstacles: true,
            },
          },
        },
      ],
    };

    const parsed = parseDocumentText(JSON.stringify(documentRoot), context);
    expect(findTemplateNodeIds(parsed.nodes)).toEqual(
      expect.arrayContaining([
        "Structural.InstructionNode",
        "Sensor.Reference",
        "BodyMotion.Reference",
        "HeadMotion.Reference",
        "Action.ActionReference",
        "Action.MakePath",
        "Path.Reference",
      ]),
    );

    const serialized = expectSemanticRoundTrip(documentRoot, context);
    expect(serialized).toMatchObject({
      Name: "Use Component References",
      Sensor: {
        Reference: "Component_Sensor_Sound",
        Modify: {
          Range: 10,
          _ExportStates: ["Alerted"],
        },
      },
      BodyMotion: {
        Reference: "Component_BodyMotion_Idle",
        Modify: {
          BlendDuration: 0.2,
        },
      },
      HeadMotion: {
        Reference: "Component_HeadMotion_Idle",
        Modify: {
          TrackTarget: true,
        },
      },
      Actions: [
        {
          Reference: "Component_Test_Action_Sequence",
          Modify: {
            Delay: 0.5,
          },
        },
        {
          Type: "MakePath",
          Path: {
            Reference: "Component_Path_Test",
            Modify: {
              IgnoreObstacles: true,
            },
          },
        },
      ],
    });
    expect((serialized.Sensor as Record<string, unknown>)?.Type).toBeUndefined();
    expect((serialized.BodyMotion as Record<string, unknown>)?.Type).toBeUndefined();
    expect((serialized.HeadMotion as Record<string, unknown>)?.Type).toBeUndefined();
    expect(((serialized.Actions as unknown[])?.[0] as Record<string, unknown>)?.Type).toBeUndefined();
    expect(
      ((((serialized.Actions as unknown[])?.[1] as Record<string, unknown>)?.Path as Record<string, unknown>)?.Type),
    ).toBeUndefined();
  });

  test("round-trips an exclusive ActionList reference wrapper on flattened Actions slots", () => {
    const context = getNpcBehaviorContext("Instruction");
    const documentRoot = {
      Name: "Sleep",
      Actions: {
        Reference: "Component_ActionList_Sleep",
        Modify: {
          UseTarget: true,
        },
      },
    };

    const parsed = parseDocumentText(JSON.stringify(documentRoot), context);
    expect(findTemplateNodeIds(parsed.nodes)).toContain("Action.ActionListReference");

    const serialized = expectSemanticRoundTrip(documentRoot, context);
    expect(serialized).toMatchObject({
      Name: "Sleep",
      Actions: {
        Reference: "Component_ActionList_Sleep",
        Modify: {
          UseTarget: true,
        },
      },
    });
    expect((serialized.Actions as Record<string, unknown>)?.Type).toBeUndefined();
  });

  test("treats ActionListReference as exclusive while allowing normal Action references to coexist", () => {
    const workspace = getNpcBehaviorWorkspace();
    const context = getNpcBehaviorContext("Instruction");
    const session = createNodeEditorSession();
    session.context = context;

    const instructionTemplate = workspace.nodeTemplatesById["Structural.InstructionNode"];
    const timeoutTemplate = workspace.nodeTemplatesById["Action.Timeout"];
    const actionReferenceTemplate = workspace.nodeTemplatesById["Action.ActionReference"];
    const actionListReferenceTemplate = workspace.nodeTemplatesById["Action.ActionListReference"];
    const actionsPin = instructionTemplate.outputPins.find(pin => pin.schemaKey === "Actions");
    expect(actionsPin).toBeDefined();

    const timeoutInputHandle = getCompatibleInputHandleId(
      timeoutTemplate,
      actionsPin!.connectionType,
      context.connectionTypesById,
    );
    const actionReferenceInputHandle = getCompatibleInputHandleId(
      actionReferenceTemplate,
      actionsPin!.connectionType,
      context.connectionTypesById,
    );
    const actionListReferenceInputHandle = getCompatibleInputHandleId(
      actionListReferenceTemplate,
      actionsPin!.connectionType,
      context.connectionTypesById,
    );
    expect(timeoutInputHandle).toBeDefined();
    expect(actionReferenceInputHandle).toBeDefined();
    expect(actionListReferenceInputHandle).toBeDefined();

    session.nodes = [
      createDataNode("instruction", instructionTemplate),
      createDataNode("timeout", timeoutTemplate),
      createDataNode("action-ref", actionReferenceTemplate),
      createDataNode("action-ref-new", actionReferenceTemplate),
      createDataNode("action-list-ref", actionListReferenceTemplate),
    ];

    session.edges = [
      createEdge("edge-timeout", "instruction", "Actions", "timeout", timeoutInputHandle!),
      createEdge("edge-action-ref", "instruction", "Actions", "action-ref", actionReferenceInputHandle!),
    ];

    expect(
      collectConflictingEdges(
        {
          source: "instruction",
          sourceHandle: "Actions",
          target: "action-ref-new",
          targetHandle: actionReferenceInputHandle!,
        },
        session,
      ),
    ).toEqual([]);

    expect(
      collectConflictingEdges(
        {
          source: "instruction",
          sourceHandle: "Actions",
          target: "action-list-ref",
          targetHandle: actionListReferenceInputHandle!,
        },
        session,
      ).map(edge => edge.id),
    ).toEqual(["edge-timeout", "edge-action-ref"]);

    session.edges = [
      createEdge(
        "edge-action-list-ref",
        "instruction",
        "Actions",
        "action-list-ref",
        actionListReferenceInputHandle!,
      ),
    ];

    expect(
      collectConflictingEdges(
        {
          source: "instruction",
          sourceHandle: "Actions",
          target: "action-ref",
          targetHandle: actionReferenceInputHandle!,
        },
        session,
      ).map(edge => edge.id),
    ).toEqual(["edge-action-list-ref"]);
  });
});
