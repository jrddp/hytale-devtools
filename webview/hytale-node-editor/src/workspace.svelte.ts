import { type WebviewToExtensionMessage } from "@shared/node-editor/messageTypes";
import { type NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import RBush, { type BBox } from "rbush";
import { type FlowEdge, type FlowNode, type VSCodeApi } from "src/common";
import { serializeDocument } from "src/node-editor/parsing/serialize/serializeDocument";
import { getAbsolutePosition } from "src/node-editor/utils/nodeUtils.svelte";

export interface WorkspaceState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  rootNodeId: string;
}

class NodeRBush extends RBush<FlowNode> {
  toBBox(node: FlowNode) {
    const { x, y } = getAbsolutePosition(node);
    const { width, height } = node.measured;
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
}

export class Workspace {
  isInitialized = $state(false);
  context = $state<NodeEditorWorkspaceContext>();
  nodes = $state.raw<FlowNode[]>([]);
  edges = $state.raw<FlowEdge[]>([]);
  rootNodeId = $state<string>();
  vscode = $state<VSCodeApi>();
  sourceVersion = $state(-1);

  // unfortunately, we can't keep a single dynamically updating map because nodes and edges are immutable and are completely reset every change
  private nodesById = $derived(new Map(this.nodes.map(node => [node.id, node])));
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

  getRootNode() {
    return this.getNodeById(this.rootNodeId);
  }

  searchNodesCollidingWith(bbox: BBox) {
    return this.spatialIndex.search(bbox);
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
