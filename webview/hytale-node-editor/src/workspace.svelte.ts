import {
  type ActionRequest,
  type NodeEditorControlScheme,
  type NodeEditorPlatform,
  type WebviewToExtensionMessage,
} from "@shared/node-editor/messageTypes";
import {
  type NodeEditorWorkspaceContext,
  type NodeTemplate,
} from "@shared/node-editor/workspaceTypes";
import { addEdge, type Connection } from "@xyflow/svelte";
import RBush, { type BBox } from "rbush";
import { type FlowEdge, type FlowNode, type VSCodeApi } from "src/common";
import { serializeDocument } from "src/node-editor/parsing/serializeDocument";
import { getAbsolutePosition } from "src/node-editor/utils/nodeUtils.svelte";

export type SelectionType = "replace" | "add";

export interface WorkspaceState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  rootNodeId: string;
  arePositionsSet: boolean;
}

class NodeRBush extends RBush<FlowNode> {
  toBBox(node: FlowNode) {
    const { x, y } = getAbsolutePosition(node);
    const { width, height } = node.measured ?? { width: node.width, height: node.height };
    if (width == undefined || height == undefined) return undefined;
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
}

export class Workspace {
  isInitialized = $state(false);
  controlScheme = $state<NodeEditorControlScheme>("mouse");
  platform = $state<NodeEditorPlatform>("win");
  context = $state<NodeEditorWorkspaceContext>();
  arePositionsSet = $state(true);
  areNodesMeasured = $derived(!!this.getRootNode()?.measured?.width);

  actionRequests = $state<ActionRequest[]>([]);

  nodes = $state.raw<FlowNode[]>([]);
  edges = $state.raw<FlowEdge[]>([]);
  rootNodeId = $state<string>();
  vscode = $state<VSCodeApi>() as VSCodeApi;
  sourceVersion = $state(-1);
  selectedNodes = $derived(this.nodes.filter(node => node.selected));

  // unfortunately, we can't keep a single dynamically updating map because nodes and edges are immutable and are completely reset every change
  private nodesById = $derived(new Map(this.nodes.map(node => [node.id, node])));
  /** Gets effective selection of nodes - including children of directly selected nodes */
  private effectivelySelectedNodes = $derived.by(() => {
    // note: nodes order always includes parents first so this guarentees that we mark parents selection first
    // we are intentionally starting set as empty instead of using selectedNodes
    const selectedNodeIds = new Set();
    const selectedNodeList = [];
    for (const node of this.nodes) {
      if (node.selected || selectedNodeIds.has(node.parentId)) {
        selectedNodeIds.add(node.id);
        selectedNodeList.push(node);
      }
    }
    return selectedNodeList;
  });
  /** parentId -> handleId -> edge */
  private outgoingConnections = $derived.by(() => {
    const outgoingConnections: Map<string, Map<string, FlowEdge[]>> = new Map();
    this.edges.forEach(edge => {
      if (!outgoingConnections.has(edge.source)) {
        outgoingConnections.set(edge.source, new Map());
      }
      if (!outgoingConnections.get(edge.source)!.has(edge.sourceHandle)) {
        outgoingConnections.get(edge.source)!.set(edge.sourceHandle, []);
      }
      outgoingConnections.get(edge.source)!.get(edge.sourceHandle)!.push(edge);
    });
    return outgoingConnections;
  });
  /** childId -> edge */
  private incomingConnections: Map<string, FlowEdge> = $derived.by(() => {
    const incomingConnections: Map<string, FlowEdge> = new Map();
    this.edges.forEach(edge => {
      incomingConnections.set(edge.target, edge);
    });
    return incomingConnections;
  });
  /** Spatially indexed nodes for collision searching (e.g. setting group inheritence) */
  private spatialIndex: NodeRBush = $derived(new NodeRBush().load(this.nodes));

  getNodeById(nodeId: string) {
    return this.nodesById.get(nodeId);
  }

  getRootNode(): FlowNode {
    return this.getNodeById(this.rootNodeId!)!;
  }

  searchNodesCollidingWith(bbox: BBox) {
    return this.spatialIndex.search(bbox);
  }

  getEffectivelySelectedNodes(): FlowNode[] {
    return [...this.effectivelySelectedNodes];
  }

  getOutgoingConnections(nodeId: string): Map<string, FlowEdge[]> | undefined {
    const original = this.outgoingConnections.get(nodeId);
    if (!original) {
      return undefined;
    }
    // shallow copy internal edge lists
    return new Map(
      Array.from(original.entries()).map(([handleId, edges]) => [handleId, [...edges]]),
    );
  }

  getOutgoingConnectionsForHandle(nodeId: string, handleId: string): FlowEdge[] {
    const outgoingConnections = this.outgoingConnections.get(nodeId)?.get(handleId) ?? [];
    return [...outgoingConnections];
  }

  getIncomingConnection(nodeId: string): FlowEdge | undefined {
    return this.incomingConnections.get(nodeId);
  }

  getValidTemplates(variantKindOrTemplateId: string | undefined): NodeTemplate[] {
    const variantKind = this.context.variantKindsById[variantKindOrTemplateId];
    if (variantKind) {
      return Object.values(variantKind.Variants).map(
        templateId => this.context.nodeTemplatesById[templateId],
      );
    }
    if (variantKindOrTemplateId) {
      return [this.context.nodeTemplatesById[variantKindOrTemplateId]];
    }
    return Object.values(this.context.nodeTemplatesById);
  }

  selectNode(nodeId: string, selectionType: SelectionType): void {
    this.nodes = this.nodes.map(node => {
      if (node.id === nodeId) {
        return node.selected ? node : { ...node, selected: true };
      } else {
        switch (selectionType) {
          case "replace":
            return node.selected ? { ...node, selected: false } : node;
          case "add":
            return node;
        }
      }
    });
  }

  addEdges(addedEdges: Connection[] | FlowEdge[]): void {
    let newEdges = this.edges;
    for (const edge of addedEdges) {
      newEdges = addEdge(edge, newEdges);
    }
    this.edges = newEdges;
  }

  selectNodes(nodeIds: string[], selectionType: SelectionType): void {
    const idSet = new Set(nodeIds);
    this.nodes = this.nodes.map(node => {
      if (idSet.has(node.id)) {
        return node.selected ? node : { ...node, selected: true };
      } else {
        switch (selectionType) {
          case "replace":
            return node.selected ? { ...node, selected: false } : node;
          case "add":
            return node;
        }
      }
    });
  }

  updateControlSchemeSetting(controlScheme: NodeEditorControlScheme): void {
    if (this.controlScheme === controlScheme) {
      return;
    }

    this.controlScheme = controlScheme;

    const payload: Extract<WebviewToExtensionMessage, { type: "update-setting" }> = {
      type: "update-setting",
      setting: "controlScheme",
      value: controlScheme,
    };
    this.vscode.postMessage(payload);
  }
}

export const workspace = new Workspace();

/** Serializes current document state and applies changes with VSCode.
 * This effectively marks the view as dirty and adds the serialization to the undo tree. */
export function applyDocumentState(reason?: string) {
  const serialized = serializeDocument();

  const payload: Extract<WebviewToExtensionMessage, { type: "apply" }> = {
    type: "apply",
    text: JSON.stringify(serialized, null, "\t"),
    sourceVersion: workspace.sourceVersion,
  };

  workspace.vscode.postMessage(payload);
  workspace.sourceVersion++;
}
