import type { SvelteFlowStore, XYPosition } from "@xyflow/svelte";
import type { FlowEdge, FlowNode } from "src/common";
import { GROUP_NODE_TYPE } from "src/constants";
import { asCssColor, resolveComputedColor } from "src/node-editor/utils/colors";
import { getAbsolutePosition } from "src/node-editor/utils/nodeUtils.svelte";
import { workspace, type NodeRenderDetailMode } from "src/workspace.svelte";

export type LowDetailRenderItem = {
  id: string;
  kind: "group" | "node";
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accentColor?: string;
};

export type LowDetailEdgeRenderItem = {
  id: string;
  path: string;
  selected: boolean;
  animated: boolean;
};

function areNodeIdSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const nodeId of left) {
    if (!right.has(nodeId)) {
      return false;
    }
  }

  return true;
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export class LowDetailController {
  canvasOverlayReady = $state(false);
  canvasOverlayReadyToken = 0;
  renderCache = $state.raw<LowDetailRenderItem[]>([]);
  edgeRenderCache = $state.raw<LowDetailEdgeRenderItem[]>([]);
  selectedNodeIds = $state.raw<string[]>([]);
  draggedNodeIds = $state.raw<string[]>([]);
  dragDelta = $state<XYPosition>({ x: 0, y: 0 });
  dragActive = $state(false);
  forcedSelectionMode = $state(false);
  hiddenNodeIds = $state.raw<Set<string>>(new Set());
  hiddenEdgeIds = $state.raw<Set<string>>(new Set());
  searchCacheLocked = $state(false);
  renderDetailTransitionOverride = $state<NodeRenderDetailMode | undefined>();
  renderDetailTransitionToken = $state(0);
  renderDetailTransitionSwitchTargetMode = $state<NodeRenderDetailMode | undefined>();
  renderDetailTransitionSwitchZoom = $state<number | undefined>();

  renderCacheById = $derived(new Map(this.renderCache.map(item => [item.id, item])));
  activeRenderDetailMode = $derived(this.renderDetailTransitionOverride ?? workspace.renderDetailMode);

  getRenderableNodeSize(node: FlowNode) {
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (typeof width !== "number" || width <= 0 || typeof height !== "number" || height <= 0) {
      return null;
    }
    return { width, height };
  }

  isNodeHiddenByDebug(node: FlowNode) {
    return node.type === GROUP_NODE_TYPE
      ? workspace.debugState.hideGroups
      : workspace.debugState.hideNodes;
  }

  isNodePendingMeasurement(node: FlowNode) {
    return workspace.isNodePendingMeasurement(node.id);
  }

  isCanvasSourceNode(node: FlowNode) {
    return !this.isNodeHiddenByDebug(node) && (this.hiddenNodeIds.has(node.id) || !node.hidden);
  }

  isCanvasSourceEdge(edge: Pick<FlowEdge, "id" | "hidden">) {
    return !workspace.debugState.hideEdges && (this.hiddenEdgeIds.has(edge.id) || !edge.hidden);
  }

  getCanvasSelectableNodeAtPoint(
    flowPosition: XYPosition,
    flowStore: Pick<SvelteFlowStore<FlowNode, FlowEdge>, "elementsSelectable">,
  ) {
    const matchingNodeIds = new Set(
      workspace
        .searchNodesCollidingWith({
          minX: flowPosition.x,
          minY: flowPosition.y,
          maxX: flowPosition.x,
          maxY: flowPosition.y,
        })
        .map(node => node.id),
    );
    if (matchingNodeIds.size === 0) {
      return undefined;
    }

    for (let index = workspace.nodes.length - 1; index >= 0; index--) {
      const node = workspace.nodes[index];
      if (
        !matchingNodeIds.has(node.id) ||
        !this.isCanvasSourceNode(node) ||
        (node.selectable ?? flowStore.elementsSelectable) === false
      ) {
        continue;
      }

      const size = this.getRenderableNodeSize(node);
      if (!size) {
        continue;
      }

      const position = getAbsolutePosition(node);
      if (
        flowPosition.x >= position.x &&
        flowPosition.x <= position.x + size.width &&
        flowPosition.y >= position.y &&
        flowPosition.y <= position.y + size.height
      ) {
        return node;
      }
    }

    return undefined;
  }

  buildRenderCache() {
    const absolutePositionsById = new Map<string, XYPosition>();
    const resolveAbsolutePosition = (node: FlowNode): XYPosition => {
      const cached = absolutePositionsById.get(node.id);
      if (cached) {
        return cached;
      }

      const position = node.parentId
        ? (() => {
            const parent = workspace.getNodeById(node.parentId);
            const parentPosition = resolveAbsolutePosition(parent);
            return {
              x: parentPosition.x + node.position.x,
              y: parentPosition.y + node.position.y,
            };
          })()
        : node.position;

      absolutePositionsById.set(node.id, position);
      return position;
    };

    const nextCache: LowDetailRenderItem[] = [];
    for (const node of workspace.nodes) {
      if (!this.isCanvasSourceNode(node)) {
        continue;
      }

      const size = this.getRenderableNodeSize(node);
      if (!size) {
        continue;
      }

      const position = resolveAbsolutePosition(node);
      nextCache.push({
        id: node.id,
        kind: node.type === GROUP_NODE_TYPE ? "group" : "node",
        title: node.data.titleOverride ?? node.data.defaultTitle,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        accentColor:
          node.type === GROUP_NODE_TYPE
            ? undefined
            : resolveComputedColor(asCssColor(node.data.nodeColor)),
      });
    }

    this.renderCache = nextCache;
    this.updateSelectedNodeIds(workspace.nodes.flatMap(node => (node.selected ? [node.id] : [])));
  }

  syncSelectionMode(
    useCanvasLowDetailOverlay: boolean,
    flowStore: Pick<SvelteFlowStore<FlowNode, FlowEdge>, "selectionRectMode" | "selectionRect">,
  ) {
    if (!useCanvasLowDetailOverlay || flowStore.selectionRectMode === "user") {
      return;
    }

    if (this.selectedNodeIds.length > 0) {
      if (flowStore.selectionRectMode !== "nodes") {
        flowStore.selectionRect = null;
        flowStore.selectionRectMode = "nodes";
        this.forcedSelectionMode = true;
      }
      return;
    }

    if (this.forcedSelectionMode && flowStore.selectionRectMode === "nodes") {
      flowStore.selectionRectMode = null;
      this.forcedSelectionMode = false;
    }
  }

  updateDragDelta(
    draggedNodes: FlowNode[],
    flowStore: Pick<SvelteFlowStore<FlowNode, FlowEdge>, "nodeLookup">,
  ) {
    for (const node of draggedNodes) {
      const cachedNode = this.renderCacheById.get(node.id);
      if (!cachedNode) {
        continue;
      }

      const absolutePosition = flowStore.nodeLookup.get(node.id)?.internals.positionAbsolute;
      if (!absolutePosition) {
        continue;
      }

      this.dragDelta = {
        x: absolutePosition.x - cachedNode.x,
        y: absolutePosition.y - cachedNode.y,
      };
      return;
    }

    this.dragDelta = { x: 0, y: 0 };
  }

  updateHiddenNodeIds(nextHiddenNodeIds: Set<string>) {
    if (!areNodeIdSetsEqual(this.hiddenNodeIds, nextHiddenNodeIds)) {
      this.hiddenNodeIds = nextHiddenNodeIds;
    }
  }

  updateHiddenEdgeIds(nextHiddenEdgeIds: Set<string>) {
    if (!areNodeIdSetsEqual(this.hiddenEdgeIds, nextHiddenEdgeIds)) {
      this.hiddenEdgeIds = nextHiddenEdgeIds;
    }
  }

  updateSelectedNodeIds(nextSelectedNodeIds: string[]) {
    if (!areStringArraysEqual(this.selectedNodeIds, nextSelectedNodeIds)) {
      this.selectedNodeIds = nextSelectedNodeIds;
    }
  }

  resetWhenCanvasDisabled(
    flowStore: Pick<SvelteFlowStore<FlowNode, FlowEdge>, "selectionRectMode">,
  ) {
    this.dragActive = false;
    this.dragDelta = { x: 0, y: 0 };
    this.selectedNodeIds = [];
    this.draggedNodeIds = [];
    this.hiddenNodeIds = new Set();
    this.hiddenEdgeIds = new Set();
    if (!this.searchCacheLocked) {
      this.renderCache = [];
      this.edgeRenderCache = [];
    }
    if (this.forcedSelectionMode && flowStore.selectionRectMode === "nodes") {
      flowStore.selectionRectMode = null;
    }
    this.forcedSelectionMode = false;
  }

  lockSearchCache() {
    if (!this.canvasOverlayReady || this.searchCacheLocked) {
      return;
    }

    this.buildRenderCache();
    this.searchCacheLocked = true;
  }

  unlockSearchCache() {
    this.searchCacheLocked = false;
  }

  beginRenderDetailTransition(mode: NodeRenderDetailMode = workspace.renderDetailMode) {
    const token = ++this.renderDetailTransitionToken;
    this.renderDetailTransitionOverride = mode;
    this.renderDetailTransitionSwitchTargetMode = undefined;
    this.renderDetailTransitionSwitchZoom = undefined;
    return token;
  }

  beginThresholdRenderDetailTransition(targetMode: NodeRenderDetailMode, switchZoom: number) {
    const token = ++this.renderDetailTransitionToken;
    this.renderDetailTransitionOverride = this.activeRenderDetailMode;
    this.renderDetailTransitionSwitchTargetMode = targetMode;
    this.renderDetailTransitionSwitchZoom = switchZoom;
    return token;
  }

  syncRenderDetailTransitionForZoom(zoom: number) {
    const targetMode = this.renderDetailTransitionSwitchTargetMode;
    const switchZoom = this.renderDetailTransitionSwitchZoom;
    if (!targetMode || switchZoom === undefined || this.renderDetailTransitionOverride === targetMode) {
      return;
    }

    const shouldSwitch = targetMode === "full" ? zoom >= switchZoom : zoom < switchZoom;
    if (shouldSwitch) {
      this.renderDetailTransitionOverride = targetMode;
      this.renderDetailTransitionSwitchTargetMode = undefined;
      this.renderDetailTransitionSwitchZoom = undefined;
    }
  }

  clearRenderDetailTransition() {
    this.renderDetailTransitionToken++;
    this.renderDetailTransitionOverride = undefined;
    this.renderDetailTransitionSwitchTargetMode = undefined;
    this.renderDetailTransitionSwitchZoom = undefined;
  }

  endRenderDetailTransitionAfter(viewportChange: Promise<boolean>, token: number) {
    void viewportChange.finally(() => {
      if (token === this.renderDetailTransitionToken) {
        this.renderDetailTransitionOverride = undefined;
        this.renderDetailTransitionSwitchTargetMode = undefined;
        this.renderDetailTransitionSwitchZoom = undefined;
      }
    });
  }

  beginSearchPreviewTransition() {
    return this.beginRenderDetailTransition();
  }

  clearSearchPreviewTransition() {
    this.clearRenderDetailTransition();
  }

  resetSearchPreviewState() {
    this.unlockSearchCache();
    this.clearSearchPreviewTransition();
  }

  endSearchPreviewTransitionAfter(viewportChange: Promise<boolean>, token: number) {
    this.endRenderDetailTransitionAfter(viewportChange, token);
  }
}

export function createLowDetailController() {
  return new LowDetailController();
}
