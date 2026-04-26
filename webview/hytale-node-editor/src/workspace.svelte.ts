import {
  createEmptyNodeEditorClipboardSelection,
  type NodeEditorClipboardSelection,
} from "@shared/node-editor/clipboardTypes";
import { createContext } from "svelte";
import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import { applyNodeEditorGraphEdit } from "@shared/node-editor/graphEditUtils";
import {
  canNodeBeSetAsWorkspaceRoot,
  getCreatableRootTemplates,
  getValidTemplatesForTemplateOrVariantId,
} from "@shared/node-editor/rootCompatibility";
import {
  type NodeEditorGraphDocument,
  type NodeEditorGraphEdit,
} from "@shared/node-editor/graphTypes";
import { cloneJsonLike } from "@shared/jsonClone";
import {
  type ActionRequest,
  type NodeEditorControlScheme,
  type NodeEditorGraphEditMessage,
  type NodeEditorPlatform,
  type WebviewToExtensionMessage,
} from "@shared/node-editor/messageTypes";
import {
  type NodeEditorWorkspaceContext,
  type NodeTemplate,
} from "@shared/node-editor/workspaceTypes";
import type { ComputeAutocompleteOption } from "../../shared/components/computeAutocomplete";
import { addEdge, type Connection } from "@xyflow/svelte";
import RBush, { type BBox } from "rbush";
import { type FlowEdge, type FlowNode, type FlowNodeData } from "@node-editor/common";
import {
  buildElementListChangedEdit,
  buildNodeRenamedEdit,
  buildNodeResizedEdit,
  buildNodesMovedEdit,
  graphEditRequiresDocumentRefresh,
} from "@node-editor/node-editor/utils/graphDocument";
import { getAbsolutePosition } from "@node-editor/node-editor/utils/nodeUtils.svelte";

export type SelectionType = "replace" | "add";
export type WorkspaceNodeUpdate = [
  string,
  Omit<Partial<FlowNode>, "data"> & { data?: Partial<FlowNodeData> },
];
export interface RemovedFlowEdge {
  edge: FlowEdge;
  index: number;
}

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

export interface NodeEditorHostBridge {
  postMessage(message: WebviewToExtensionMessage): void | PromiseLike<boolean>;
}

export type NodeEditorPreviewFeatureConsideration = {
  kind: "animation";
  value: string;
};

function hasRenderableNodeSize(node: FlowNode) {
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  return typeof width === "number" && width > 0 && typeof height === "number" && height > 0;
}

class NodeRBush extends RBush<FlowNode> {
  constructor(private readonly session: NodeEditorSession) {
    super();
    this.toBBox = this.toBBox.bind(this);
  }

  toBBox(node: FlowNode) {
    const { x, y } = getAbsolutePosition(node, this.session);
    const { width, height } = node.measured ?? {
      width: node.width,
      height: node.height,
    };
    if (width == undefined || height == undefined) return undefined;
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
}

export class NodeEditorSession {
  isInitialized = $state(false);
  controlScheme = $state<NodeEditorControlScheme>("mouse");
  platform = $state<NodeEditorPlatform>("win");
  context = $state<NodeEditorWorkspaceContext>();
  hostBridge = $state<NodeEditorHostBridge | undefined>();
  allowOpenRawJson = $state(true);
  embeddedGraphFieldPath = $state<string | undefined>();

  actionRequests = $state<ActionRequest[]>([]);

  autocompleteField = $state<string>();
  autocompleteValues = $state<string[]>([]);
  computeAutocompleteOptions = $state<ComputeAutocompleteOption[]>([]);
  consideredPreviewFeature = $state<NodeEditorPreviewFeatureConsideration | null>(null);

  nodes = $state.raw<FlowNode[]>([]);
  edges = $state.raw<FlowEdge[]>([]);
  rootNodeId = $state<string | undefined>();
  sourceVersion = $state(-1);
  committedGraphDocument = $state.raw<NodeEditorGraphDocument | undefined>(undefined);
  pendingLocalEditId = $state<number | undefined>();
  nextClientEditId = $state(0);
  areNodesMeasured = $state(false);
  hasCompletedInitialMeasurement = $state(false);
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
  /** childId -> targetHandleId -> edges */
  private incomingConnections: Map<string, Map<string, FlowEdge[]>> = $derived.by(() => {
    const incomingConnections: Map<string, Map<string, FlowEdge[]>> = new Map();
    this.edges.forEach(edge => {
      if (!incomingConnections.has(edge.target)) {
        incomingConnections.set(edge.target, new Map());
      }
      const targetHandleId = edge.targetHandle ?? INPUT_HANDLE_ID;
      if (!incomingConnections.get(edge.target)!.has(targetHandleId)) {
        incomingConnections.get(edge.target)!.set(targetHandleId, []);
      }
      incomingConnections.get(edge.target)!.get(targetHandleId)!.push(edge);
    });
    return incomingConnections;
  });
  /** Spatially indexed nodes for collision searching (e.g. setting group inheritence) */
  private spatialIndex: NodeRBush = $derived.by(() => {
    const spatialIndex = new NodeRBush(this);
    spatialIndex.load(this.nodes.filter(node => hasRenderableNodeSize(node)));
    return spatialIndex;
  });

  getNodeById(nodeId: string) {
    return this.nodesById.get(nodeId);
  }

  setConsideredPreviewFeature(
    kind: NodeEditorPreviewFeatureConsideration["kind"],
    value: string | null | undefined,
  ) {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
      this.clearConsideredPreviewFeature(kind);
      return;
    }

    if (
      this.consideredPreviewFeature?.kind === kind &&
      this.consideredPreviewFeature.value === trimmedValue
    ) {
      return;
    }

    this.consideredPreviewFeature = {
      kind,
      value: trimmedValue,
    };
  }

  clearConsideredPreviewFeature(kind?: NodeEditorPreviewFeatureConsideration["kind"]) {
    if (!kind || this.consideredPreviewFeature?.kind === kind) {
      this.consideredPreviewFeature = null;
    }
  }

  getRootNode(): FlowNode | undefined {
    return this.rootNodeId ? this.getNodeById(this.rootNodeId) : undefined;
  }

  searchNodesCollidingWith(bbox: BBox) {
    return this.spatialIndex.search(bbox);
  }

  resetMeasurementTracking(nodes: FlowNode[] = this.nodes, resetOptimizationState = false) {
    const pendingMeasurementNodeIds = new Set<string>();
    for (const node of nodes) {
      if (!hasRenderableNodeSize(node)) {
        pendingMeasurementNodeIds.add(node.id);
      }
    }

    this.pendingMeasurementNodeIds = pendingMeasurementNodeIds;
    this.areNodesMeasured = pendingMeasurementNodeIds.size === 0;
    if (resetOptimizationState) {
      this.hasCompletedInitialMeasurement = pendingMeasurementNodeIds.size === 0;
    } else if (pendingMeasurementNodeIds.size === 0) {
      this.hasCompletedInitialMeasurement = true;
    }
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
    if (pendingMeasurementNodeIds.size === 0) {
      this.hasCompletedInitialMeasurement = true;
    }
  }

  reconcilePendingMeasurements() {
    if (this.pendingMeasurementNodeIds.size === 0) {
      this.areNodesMeasured = true;
      this.hasCompletedInitialMeasurement = true;
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
    if (pendingMeasurementNodeIds.size === 0) {
      this.hasCompletedInitialMeasurement = true;
    }
  }

  isNodePendingMeasurement(nodeId: string) {
    return this.pendingMeasurementNodeIds.has(nodeId);
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

  getIncomingConnection(nodeId: string, handleId?: string): FlowEdge | undefined {
    const incomingConnections = this.incomingConnections.get(nodeId);
    if (!incomingConnections) {
      return undefined;
    }

    if (handleId !== undefined) {
      return incomingConnections.get(handleId)?.[0];
    }

    // Legacy callers still ask for a single "parent" edge without specifying a handle.
    // Prefer the default input when present, otherwise fall back to the first incoming edge.
    return incomingConnections.get(INPUT_HANDLE_ID)?.[0] ?? incomingConnections.values().next().value?.[0];
  }

  getIncomingConnectionsForHandle(nodeId: string, handleId: string): FlowEdge[] {
    return [...(this.incomingConnections.get(nodeId)?.get(handleId) ?? [])];
  }

  getValidTemplates(variantKindOrTemplateId: string | undefined): NodeTemplate[] {
    return getValidTemplatesForTemplateOrVariantId(this.context, variantKindOrTemplateId);
  }

  getCreatableRootTemplates(): NodeTemplate[] {
    return getCreatableRootTemplates(this.context);
  }

  setRootNode(nodeId: string): boolean {
    const node = this.getNodeById(nodeId);
    if (
      !node ||
      !canNodeBeSetAsWorkspaceRoot({
        nodeId,
        currentRootNodeId: this.rootNodeId,
        nodeType: node.type,
        template: node.data,
        workspaceContext: this.context,
      })
    ) {
      return false;
    }

    this.rootNodeId = nodeId;
    this.applyDocumentState("element-list-changed");
    return true;
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

  removeEdgesByIds(edgeIds: Iterable<string>): RemovedFlowEdge[] {
    const removedEdges: RemovedFlowEdge[] = [];
    const edgeIdSet = new Set(edgeIds);
    if (edgeIdSet.size === 0) {
      return removedEdges;
    }

    this.edges = this.edges.filter((edge, index) => {
      if (!edgeIdSet.has(edge.id)) {
        return true;
      }

      removedEdges.push({ edge, index });
      return false;
    });

    return removedEdges;
  }

  restoreRemovedEdges(removedEdges: RemovedFlowEdge[]): void {
    if (removedEdges.length === 0) {
      return;
    }

    const nextEdges = [...this.edges];
    const existingEdgeIds = new Set(nextEdges.map(edge => edge.id));
    const sortedRemovedEdges = [...removedEdges].sort((left, right) => left.index - right.index);
    let didChange = false;

    for (const removedEdge of sortedRemovedEdges) {
      if (existingEdgeIds.has(removedEdge.edge.id)) {
        continue;
      }

      nextEdges.splice(Math.min(removedEdge.index, nextEdges.length), 0, removedEdge.edge);
      existingEdgeIds.add(removedEdge.edge.id);
      didChange = true;
    }

    if (didChange) {
      this.edges = nextEdges;
    }
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

  postMessageToHost(message: WebviewToExtensionMessage): void {
    this.hostBridge?.postMessage(message);
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
    this.postMessageToHost(payload);
  }

  updateViewportZoom(zoom: number): void {
    if (this.viewportZoom !== zoom) {
      this.viewportZoom = zoom;
    }
  }
  applyGraphEdit(edit: NodeEditorGraphEdit) {
    const beforeDocument = this.committedGraphDocument;
    if (!beforeDocument) {
      throw new Error("Cannot create an undoable edit before the document has been initialized.");
    }

    const clientEditId = this.nextClientEditId + 1;
    this.nextClientEditId = clientEditId;
    this.pendingLocalEditId = clientEditId;
    const plainEdit = cloneJsonLike($state.snapshot(edit));
    const afterDocument = cloneJsonLike($state.snapshot(beforeDocument));
    applyNodeEditorGraphEdit(afterDocument, plainEdit);
    this.committedGraphDocument = afterDocument;
    this.queuePostGraphEditActions(plainEdit);
    this.postGraphEdit(plainEdit, clientEditId);
  }

  /** Builds an undoable graph edit from current workspace state and posts it to the active host. */
  applyDocumentState(reason: NodeEditorGraphEdit["kind"]) {
    const beforeDocument = this.committedGraphDocument;
    if (!beforeDocument) {
      throw new Error("Cannot create an undoable edit before the document has been initialized.");
    }

    const graphEdit = this.buildGraphEdit(reason, beforeDocument);
    if (!graphEdit) {
      return;
    }

    this.applyGraphEdit(graphEdit);
  }

  private buildGraphEdit(
    reason: NodeEditorGraphEdit["kind"],
    beforeDocument: NodeEditorGraphDocument,
  ): NodeEditorGraphEdit | undefined {
    switch (reason) {
      case "element-list-changed":
        return buildElementListChangedEdit(
          beforeDocument,
          {
            nodes: this.nodes,
            edges: this.edges,
            rootNodeId: this.rootNodeId,
          },
          this.context.rootMenuName,
        );
      case "nodes-moved":
        return buildNodesMovedEdit(beforeDocument, this.nodes);
      case "node-renamed":
        return buildNodeRenamedEdit(beforeDocument, this.nodes);
      case "node-resized":
        return buildNodeResizedEdit(beforeDocument, this.nodes);
    }
  }

  private postGraphEdit(edit: NodeEditorGraphEdit, clientEditId: number): void {
    switch (edit.kind) {
      case "element-list-changed":
        this.postMessageToHost({
          type: "edit",
          kind: edit.kind,
          addedNodes: edit.addedNodes,
          removedNodes: edit.removedNodes,
          addedEdges: edit.addedEdges,
          removedEdges: edit.removedEdges,
          beforeRootNodeId: edit.beforeRootNodeId,
          afterRootNodeId: edit.afterRootNodeId,
          sourceVersion: this.sourceVersion,
          clientEditId,
        } satisfies NodeEditorGraphEditMessage);
        return;
      case "nodes-moved":
        this.postMessageToHost({
          type: "edit",
          kind: edit.kind,
          changes: edit.changes,
          sourceVersion: this.sourceVersion,
          clientEditId,
        } satisfies NodeEditorGraphEditMessage);
        return;
      case "node-renamed":
        this.postMessageToHost({
          type: "edit",
          kind: edit.kind,
          changes: edit.changes,
          sourceVersion: this.sourceVersion,
          clientEditId,
        } satisfies NodeEditorGraphEditMessage);
        return;
      case "node-resized":
        this.postMessageToHost({
          type: "edit",
          kind: edit.kind,
          changes: edit.changes,
          sourceVersion: this.sourceVersion,
          clientEditId,
        } satisfies NodeEditorGraphEditMessage);
        return;
      case "node-properties-updated":
        this.postMessageToHost({
          type: "edit",
          kind: edit.kind,
          propertyChanges: edit.propertyChanges,
          resizeChanges: edit.resizeChanges,
          sourceVersion: this.sourceVersion,
          clientEditId,
        } satisfies NodeEditorGraphEditMessage);
        return;
    }
  }

  private queuePostGraphEditActions(edit: NodeEditorGraphEdit): void {
    if (graphEditRequiresDocumentRefresh(edit)) {
      this.actionRequests.push({ type: "document-refresh" });
    }
  }
}

export function createNodeEditorSession(): NodeEditorSession {
  return new NodeEditorSession();
}

const [useNodeEditorSession, setNodeEditorSessionContext] = createContext<NodeEditorSession>();
export { useNodeEditorSession, setNodeEditorSessionContext };
