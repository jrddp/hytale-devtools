import {
  createEmptyNodeEditorClipboardSelection,
  type NodeEditorClipboardSelection,
} from "@shared/node-editor/clipboardTypes";
import { applyNodeEditorGraphEdit } from "@shared/node-editor/graphEditUtils";
import {
  type NodeEditorGraphDocument,
  type NodeEditorGraphEdit,
} from "@shared/node-editor/graphTypes";
import {
  type ActionRequest,
  type NodeEditorControlScheme,
  type NodeEditorDocumentEditKind,
  type NodeEditorGraphEditMessage,
  type NodeEditorPlatform,
  type SnapshotNodeEditorGraphEditKind,
  type WebviewToExtensionMessage,
} from "@shared/node-editor/messageTypes";
import {
  type NodeEditorWorkspaceContext,
  type NodeTemplate,
} from "@shared/node-editor/workspaceTypes";
import { addEdge, type Connection } from "@xyflow/svelte";
import RBush, { type BBox } from "rbush";
import { type FlowEdge, type FlowNode, type FlowNodeData, type VSCodeApi } from "src/common";
import {
  buildNodeRenamedEdit,
  buildNodeResizedEdit,
  buildNodesMovedEdit,
  graphEditRequiresDocumentRefresh,
  workspaceStateToGraphDocument,
} from "src/node-editor/utils/graphDocument";
import { getAbsolutePosition } from "src/node-editor/utils/nodeUtils.svelte";

export type SelectionType = "replace" | "add";
export type WorkspaceNodeUpdate = [
  string,
  Omit<Partial<FlowNode>, "data"> & { data?: Partial<FlowNodeData> },
];

export interface WorkspaceState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  rootNodeId?: string;
}

export type NodeRenderDetailMode = "full" | "low";
const DEFAULT_LOW_DETAIL_ZOOM_THRESHOLD = 0.3;
const DEFAULT_LOW_DETAIL_CANVAS_EDGE_BASE_WIDTH = 1;

export interface NodeEditorDebugState {
  hideNodes: boolean;
  hideGroups: boolean;
  hideEdges: boolean;
  useCustomSelectionBoxLogic: boolean;
  lowDetailZoomThreshold: number;
  lowDetailCanvasEdgeBaseWidth: number;
}

function hasRenderableNodeSize(node: FlowNode) {
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  return typeof width === "number" && width > 0 && typeof height === "number" && height > 0;
}

class NodeRBush extends RBush<FlowNode> {
  toBBox(node: FlowNode) {
    const { x, y } = getAbsolutePosition(node);
    const { width, height } = node.measured ?? {
      width: node.width,
      height: node.height,
    };
    if (width == undefined || height == undefined) return undefined;
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
}

export class Workspace {
  isInitialized = $state(false);
  controlScheme = $state<NodeEditorControlScheme>("mouse");
  platform = $state<NodeEditorPlatform>("win");
  context = $state<NodeEditorWorkspaceContext>();

  actionRequests = $state<ActionRequest[]>([]);

  autocompleteField = $state<string>();
  autocompleteValues = $state<string[]>([]);

  nodes = $state.raw<FlowNode[]>([]);
  edges = $state.raw<FlowEdge[]>([]);
  rootNodeId = $state<string | undefined>();
  vscode = $state<VSCodeApi>() as VSCodeApi;
  sourceVersion = $state(-1);
  committedGraphDocument = $state.raw<NodeEditorGraphDocument | undefined>(undefined);
  pendingLocalEditId = $state<number | undefined>();
  nextClientEditId = $state(0);
  areNodesMeasured = $state(false);
  private pendingMeasurementNodeIds = $state.raw<Set<string>>(new Set());

  /** clipboard snapshot of copied/cut nodes plus edges fully contained within that selection */
  copiedSelection = $state.raw<NodeEditorClipboardSelection>(
    createEmptyNodeEditorClipboardSelection(),
  );
  isDevelopment = $state(false);
  renderDetailMode = $state<NodeRenderDetailMode>("full");
  viewportZoom = $state(1);
  zoomCompensationScale = $derived(this.viewportZoom < 1 ? 1 / this.viewportZoom : 1);
  debugState = $state<NodeEditorDebugState>({
    hideNodes: false,
    hideGroups: false,
    hideEdges: false,
    useCustomSelectionBoxLogic: true,
    lowDetailZoomThreshold: DEFAULT_LOW_DETAIL_ZOOM_THRESHOLD,
    lowDetailCanvasEdgeBaseWidth: DEFAULT_LOW_DETAIL_CANVAS_EDGE_BASE_WIDTH,
  });

  // unfortunately, we can't keep a single dynamically updating map because nodes and edges are immutable and are completely reset every change
  private nodesById = $derived(new Map(this.nodes.map(node => [node.id, node])));
  /** Gets effective selection of nodes, including children of directly selected nodes. */
  private effectivelySelectedNodes = $derived.by(() => {
    // note: nodes order always includes parents first so this guarentees that we mark parents selection first
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
  private spatialIndex: NodeRBush = $derived.by(() => {
    const spatialIndex = new NodeRBush();
    spatialIndex.load(this.nodes.filter(node => hasRenderableNodeSize(node)));
    return spatialIndex;
  });

  getNodeById(nodeId: string) {
    return this.nodesById.get(nodeId);
  }

  getRootNode(): FlowNode | undefined {
    return this.rootNodeId ? this.getNodeById(this.rootNodeId) : undefined;
  }

  searchNodesCollidingWith(bbox: BBox) {
    return this.spatialIndex.search(bbox);
  }

  resetMeasurementTracking(nodes: FlowNode[] = this.nodes) {
    const pendingMeasurementNodeIds = new Set<string>();
    for (const node of nodes) {
      if (!hasRenderableNodeSize(node)) {
        pendingMeasurementNodeIds.add(node.id);
      }
    }

    this.pendingMeasurementNodeIds = pendingMeasurementNodeIds;
    this.areNodesMeasured = pendingMeasurementNodeIds.size === 0;
  }

  trackMeasurementForNodeIds(nodeIds: Iterable<string>) {
    const pendingMeasurementNodeIds = new Set(this.pendingMeasurementNodeIds);
    let didChange = false;

    for (const nodeId of nodeIds) {
      const node = this.getNodeById(nodeId);
      if (!node || hasRenderableNodeSize(node)) {
        if (pendingMeasurementNodeIds.delete(nodeId)) {
          didChange = true;
        }
        continue;
      }

      if (!pendingMeasurementNodeIds.has(nodeId)) {
        pendingMeasurementNodeIds.add(nodeId);
        didChange = true;
      }
    }

    if (didChange) {
      this.pendingMeasurementNodeIds = pendingMeasurementNodeIds;
    }
    this.areNodesMeasured = pendingMeasurementNodeIds.size === 0;
  }

  reconcilePendingMeasurements() {
    if (this.pendingMeasurementNodeIds.size === 0) {
      this.areNodesMeasured = true;
      return;
    }

    const pendingMeasurementNodeIds = new Set(this.pendingMeasurementNodeIds);
    let didChange = false;

    for (const nodeId of this.pendingMeasurementNodeIds) {
      const node = this.getNodeById(nodeId);
      if (!node || hasRenderableNodeSize(node)) {
        pendingMeasurementNodeIds.delete(nodeId);
        didChange = true;
      }
    }

    if (didChange) {
      this.pendingMeasurementNodeIds = pendingMeasurementNodeIds;
    }
    this.areNodesMeasured = pendingMeasurementNodeIds.size === 0;
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
    return [];
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

  applyNodeUpdates(updates: WorkspaceNodeUpdate[]): void {
    if (updates.length === 0) {
      return;
    }

    const updatesById = new Map(updates);
    let didChange = false;
    const nextNodes = this.nodes.map(node => {
      const update = updatesById.get(node.id);
      if (!update) {
        return node;
      }

      const nextData = update.data ? { ...node.data, ...update.data } : node.data;
      const nextNode = update.data
        ? { ...node, ...update, data: nextData }
        : { ...node, ...update };
      let changed = false;
      for (const [key, value] of Object.entries(update)) {
        if (key === "data") {
          for (const [dataKey, dataValue] of Object.entries(value ?? {})) {
            if (node.data[dataKey] !== dataValue) {
              changed = true;
              break;
            }
          }
          if (changed) {
            break;
          }
          continue;
        }

        if (node[key] !== value) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return node;
      }

      didChange = true;
      return nextNode as FlowNode;
    });

    if (didChange) {
      this.nodes = nextNodes;
    }
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

  updateViewportZoom(zoom: number): void {
    if (this.viewportZoom !== zoom) {
      this.viewportZoom = zoom;
    }
  }
}

export const workspace = new Workspace();

export function applyGraphEdit(edit: NodeEditorGraphEdit) {
  const beforeDocument = workspace.committedGraphDocument;
  if (!beforeDocument) {
    throw new Error("Cannot create an undoable edit before the document has been initialized.");
  }

  const clientEditId = workspace.nextClientEditId + 1;
  workspace.nextClientEditId = clientEditId;
  workspace.pendingLocalEditId = clientEditId;
  const afterDocument = structuredClone(beforeDocument);
  applyNodeEditorGraphEdit(afterDocument, edit);
  workspace.committedGraphDocument = afterDocument;
  queuePostGraphEditActions(edit);
  postGraphEdit(edit, clientEditId);
}

/** Serializes current document state and applies changes with VSCode.
 * This effectively marks the view as dirty and adds the serialization to the undo tree. */
export function applyDocumentState(reason: NodeEditorDocumentEditKind = "document-edited") {
  const beforeDocument = workspace.committedGraphDocument;
  if (!beforeDocument) {
    throw new Error("Cannot create an undoable edit before the document has been initialized.");
  }

  const graphEdit = buildGraphEdit(reason, beforeDocument);

  if (graphEdit) {
    applyGraphEdit(graphEdit);
    return;
  }

  if (isGraphEditKind(reason)) {
    workspace.pendingLocalEditId = undefined;
    return;
  }

  const clientEditId = workspace.nextClientEditId + 1;
  workspace.nextClientEditId = clientEditId;
  workspace.pendingLocalEditId = clientEditId;
  const afterDocument = workspaceStateToGraphDocument(
    {
      nodes: workspace.nodes,
      edges: workspace.edges,
      rootNodeId: workspace.rootNodeId,
    },
    workspace.context.rootMenuName,
  );
  workspace.committedGraphDocument = afterDocument;
  workspace.actionRequests.push({ type: "document-refresh" });
  workspace.vscode.postMessage({
    type: "edit",
    kind: reason as SnapshotNodeEditorGraphEditKind,
    beforeDocument,
    afterDocument,
    sourceVersion: workspace.sourceVersion,
    clientEditId,
  });
}

function buildGraphEdit(
  reason: NodeEditorDocumentEditKind,
  beforeDocument: NodeEditorGraphDocument,
): NodeEditorGraphEdit | undefined {
  switch (reason) {
    case "nodes-moved":
      return buildNodesMovedEdit(beforeDocument, workspace.nodes);
    case "node-renamed":
      return buildNodeRenamedEdit(beforeDocument, workspace.nodes);
    case "node-resized":
      return buildNodeResizedEdit(beforeDocument, workspace.nodes);
    default:
      return undefined;
  }
}

function isGraphEditKind(
  reason: NodeEditorDocumentEditKind,
): reason is NodeEditorGraphEdit["kind"] {
  return reason === "nodes-moved" || reason === "node-renamed" || reason === "node-resized";
}

function postGraphEdit(edit: NodeEditorGraphEdit, clientEditId: number): void {
  switch (edit.kind) {
    case "nodes-moved":
      workspace.vscode.postMessage({
        type: "edit",
        kind: edit.kind,
        changes: edit.changes,
        sourceVersion: workspace.sourceVersion,
        clientEditId,
      } satisfies NodeEditorGraphEditMessage);
      return;
    case "node-renamed":
      workspace.vscode.postMessage({
        type: "edit",
        kind: edit.kind,
        changes: edit.changes,
        sourceVersion: workspace.sourceVersion,
        clientEditId,
      } satisfies NodeEditorGraphEditMessage);
      return;
    case "node-resized":
      workspace.vscode.postMessage({
        type: "edit",
        kind: edit.kind,
        changes: edit.changes,
        sourceVersion: workspace.sourceVersion,
        clientEditId,
      } satisfies NodeEditorGraphEditMessage);
      return;
    case "node-properties-updated":
      workspace.vscode.postMessage({
        type: "edit",
        kind: edit.kind,
        propertyChanges: edit.propertyChanges,
        resizeChanges: edit.resizeChanges,
        sourceVersion: workspace.sourceVersion,
        clientEditId,
      } satisfies NodeEditorGraphEditMessage);
      return;
  }
}

function queuePostGraphEditActions(edit: NodeEditorGraphEdit): void {
  if (graphEditRequiresDocumentRefresh(edit)) {
    workspace.actionRequests.push({ type: "document-refresh" });
  }
}
