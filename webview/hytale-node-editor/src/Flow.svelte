<script lang="ts">
  import {
    Background,
    Position,
    SelectionMode,
    SvelteFlow,
    useConnection,
    type SvelteFlowProps,
    useStore,
    useSvelteFlow,
    useViewport,
    type Viewport,
    type XYPosition,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { getOverlappingArea, pointToRendererPoint } from "@xyflow/system";
  import RBush from "rbush";

  import { type NodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
  import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
  import AddNodeMenu, { type AddMenuProps } from "src/components/AddNodeMenu.svelte";
  import DebugPanel from "src/components/DebugPanel.svelte";
  import LowDetailNodeCanvasOverlay from "src/components/LowDetailNodeCanvasOverlay.svelte";
  import NodeEditorActionMenu from "src/components/NodeEditorActionMenu.svelte";
  import NodeHelpPanel from "src/components/NodeHelpPanel.svelte";
  import NodeSearchPanel from "src/components/NodeSearchPanel.svelte";
  import { CONNECTION_RADIUS, GROUP_NODE_TYPE, MULTISELECT_KEY, nodeTypes } from "src/constants";
  import { getAutoPositionNodeUpdates } from "src/node-editor/layout/autoLayout";
  import { asCssColor, resolveComputedColor } from "src/node-editor/utils/colors";
  import {
    buildIndexedBezierEdgeGeometry,
    createEdgeSelectionBounds,
    edgeGeometryIntersectsRect,
    type IndexedBezierEdgeGeometry,
  } from "src/node-editor/utils/edgeGeometry";
  import { isShortcutBlockedByEditableTarget } from "src/node-editor/utils/flowKeyboard";
  import { createUuidV4 } from "src/node-editor/utils/idUtils";
  import {
    getAbsoluteCenterPosition,
    getAbsolutePosition,
    getAllSiblingOrderUpdates,
    isValidConnection,
    pruneConflictingEdges,
    recalculateGroupParents,
    resolveFitViewNodeIds,
  } from "src/node-editor/utils/nodeUtils.svelte";
  import { applyDocumentState, type NodeRenderDetailMode, workspace } from "src/workspace.svelte";
  import { tick, untrack } from "svelte";
  import { innerHeight, innerWidth } from "svelte/reactivity/window";
  import type { FlowEdge, FlowNode } from "./common";
  import { createNodeFromTemplate } from "./node-editor/utils/nodeFactory.svelte";

  const {
    fitView,
    screenToFlowPosition,
    setCenter: setViewportCenter,
    setViewport,
    deleteElements,
  } = useSvelteFlow();
  const flowStore = $derived(useStore<FlowNode, FlowEdge>());
  const liveConnection = useConnection();

  const viewport = useViewport();
  const getViewportCenter = (viewport: Viewport) => ({
    x: ((innerWidth.current ?? 0) / 2 - viewport.x) / viewport.zoom,
    y: ((innerHeight.current ?? 0) / 2 - viewport.y) / viewport.zoom,
  });

  let {
    nodes = $bindable([]),
    edges = $bindable([]),
    initialViewport,
    onviewportchange,
  }: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    initialViewport?: Viewport;
    onviewportchange?: (viewport: Viewport) => void;
  } = $props();

  const MIN_FLOW_ZOOM = 0;
  const SEARCH_NODE_FOCUS_DURATION_MS = 100;
  const SEARCH_NODE_FOCUS_ZOOM = 0.9;

  let flowWrapperElement: HTMLDivElement | undefined = undefined;
  let multiselectModifierPressed = $state(false);
  let lastUserSelectionRect = $state<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  let cursorPos = $state<XYPosition>();
  let pendingSourceConnection: { source: string; sourceHandle: string } | undefined;
  let pendingSourceConflictingEdges: FlowEdge[] = [];
  let pendingTargetConnection: { target: string; targetHandle: string } | undefined;
  let pendingTargetConflictingEdges: FlowEdge[] = [];
  let pendingConnectionPreviewKey = $state<string | undefined>();

  let addMenuInstance:
    | { screenPosition: XYPosition; spawnPosition: XYPosition; connectionFilter?: string }
    | undefined = $state();
  let searchMenuInstance:
    | {
        initialViewport: Viewport;
      }
    | undefined = $state();
  let helpMenuOpen = $state(false);
  let showDebugOverlay = $state(false);
  let canvasOverlayReady = $state(false);
  let canvasOverlayReadyToken = 0;
  let lowDetailRenderCache = $state.raw<
    Array<{
      id: string;
      kind: "group" | "node";
      title: string;
      x: number;
      y: number;
      width: number;
      height: number;
      accentColor?: string;
    }>
  >([]);
  let lowDetailEdgeRenderCache = $state.raw<
    Array<{
      id: string;
      path: string;
      selected: boolean;
      animated: boolean;
    }>
  >([]);
  let lowDetailSelectedNodeIds = $state.raw<string[]>([]);
  let lowDetailDraggedNodeIds = $state.raw<string[]>([]);
  let lowDetailDragDelta = $state<XYPosition>({ x: 0, y: 0 });
  let lowDetailDragActive = $state(false);
  let forcedLowDetailSelectionMode = $state(false);
  let lowDetailHiddenNodeIds = $state.raw<Set<string>>(new Set());
  let lowDetailHiddenEdgeIds = $state.raw<Set<string>>(new Set());
  let searchLowDetailCacheLocked = $state(false);
  let searchPreviewRenderDetailOverride = $state<NodeRenderDetailMode | undefined>();
  let searchPreviewTransitionToken = $state(0);
  const activeRenderDetailMode = $derived(
    searchPreviewRenderDetailOverride ?? workspace.renderDetailMode,
  );

  const useCanvasLowDetailOverlay = $derived(
    canvasOverlayReady && activeRenderDetailMode === "low",
  );
  const useVisibleElementCulling = $derived(workspace.hasCompletedInitialMeasurement);
  const lowDetailRenderCacheById = $derived(
    new Map(lowDetailRenderCache.map(item => [item.id, item])),
  );
  const visibleEdgeGeometries = $derived.by(() => {
    void flowStore.visible.edges;
    return Array.from(flowStore.visible.edges.values()).map(edge =>
      buildIndexedBezierEdgeGeometry(edge),
    );
  });
  const visibleEdgeGeometryIndex = $derived.by(() => {
    const index = new RBush<IndexedBezierEdgeGeometry>();
    index.load(visibleEdgeGeometries);
    return index;
  });

  function getRenderableNodeSize(node: FlowNode) {
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (typeof width !== "number" || width <= 0 || typeof height !== "number" || height <= 0) {
      return null;
    }
    return { width, height };
  }

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

  function isNodeHiddenByDebug(node: FlowNode) {
    return node.type === GROUP_NODE_TYPE
      ? workspace.debugState.hideGroups
      : workspace.debugState.hideNodes;
  }

  function isNodePendingMeasurement(node: FlowNode) {
    return workspace.isNodePendingMeasurement(node.id);
  }

  function isLowDetailCanvasSourceNode(node: FlowNode) {
    return !isNodeHiddenByDebug(node) && (lowDetailHiddenNodeIds.has(node.id) || !node.hidden);
  }

  function isLowDetailCanvasSourceEdge(edge: Pick<FlowEdge, "id" | "hidden">) {
    return !workspace.debugState.hideEdges && (lowDetailHiddenEdgeIds.has(edge.id) || !edge.hidden);
  }

  function getCanvasSelectableNodeAtPoint(flowPosition: XYPosition) {
    if (!useCanvasLowDetailOverlay) {
      return undefined;
    }

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
        !isLowDetailCanvasSourceNode(node) ||
        (node.selectable ?? flowStore.elementsSelectable) === false
      ) {
        continue;
      }

      const size = getRenderableNodeSize(node);
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

  function buildLowDetailRenderCache() {
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

    const nextCache = [];
    for (const node of workspace.nodes) {
      if (!isLowDetailCanvasSourceNode(node)) {
        continue;
      }

      const size = getRenderableNodeSize(node);
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

    lowDetailRenderCache = nextCache;
    lowDetailSelectedNodeIds = workspace.nodes.flatMap(node => (node.selected ? [node.id] : []));
  }

  function syncLowDetailSelectionMode(selectedNodeCount: number) {
    if (!useCanvasLowDetailOverlay || flowStore.selectionRectMode === "user") {
      return;
    }

    if (selectedNodeCount > 0) {
      if (flowStore.selectionRectMode !== "nodes") {
        flowStore.selectionRect = null;
        flowStore.selectionRectMode = "nodes";
        forcedLowDetailSelectionMode = true;
      }
      return;
    }

    if (forcedLowDetailSelectionMode && flowStore.selectionRectMode === "nodes") {
      flowStore.selectionRectMode = null;
      forcedLowDetailSelectionMode = false;
    }
  }

  function updateLowDetailDragDelta(draggedNodes: FlowNode[]) {
    for (const node of draggedNodes) {
      const cachedNode = lowDetailRenderCacheById.get(node.id);
      if (!cachedNode) {
        continue;
      }

      const absolutePosition = flowStore.nodeLookup.get(node.id)?.internals.positionAbsolute;
      if (!absolutePosition) {
        continue;
      }

      lowDetailDragDelta = {
        x: absolutePosition.x - cachedNode.x,
        y: absolutePosition.y - cachedNode.y,
      };
      return;
    }

    lowDetailDragDelta = { x: 0, y: 0 };
  }

  function lockLowDetailSearchCache() {
    if (!canvasOverlayReady || searchLowDetailCacheLocked) {
      return;
    }

    buildLowDetailRenderCache();
    searchLowDetailCacheLocked = true;
  }

  function unlockLowDetailSearchCache() {
    searchLowDetailCacheLocked = false;
  }

  function beginSearchPreviewTransition() {
    const token = ++searchPreviewTransitionToken;
    searchPreviewRenderDetailOverride = workspace.renderDetailMode;
    return token;
  }

  function clearSearchPreviewTransition() {
    searchPreviewTransitionToken++;
    searchPreviewRenderDetailOverride = undefined;
  }

  function resetSearchPreviewState() {
    unlockLowDetailSearchCache();
    clearSearchPreviewTransition();
  }

  function endSearchPreviewTransitionAfter(viewportChange: Promise<boolean>, token: number) {
    void viewportChange.finally(() => {
      if (token === searchPreviewTransitionToken) {
        searchPreviewRenderDetailOverride = undefined;
      }
    });
  }

  $effect(() => {
    const zoom = viewport.current.zoom;
    workspace.updateViewportZoom(zoom);
    const nextDetailMode = zoom >= workspace.debugState.lowDetailZoomThreshold ? "full" : "low";
    if (workspace.renderDetailMode !== nextDetailMode) {
      workspace.renderDetailMode = nextDetailMode;
    }
  });

  $effect(() => {
    if (!workspace.hasCompletedInitialMeasurement) {
      canvasOverlayReadyToken++;
      canvasOverlayReady = false;
      return;
    }

    if (canvasOverlayReady) {
      return;
    }

    const token = ++canvasOverlayReadyToken;
    void tick().then(() => {
      if (token === canvasOverlayReadyToken && workspace.hasCompletedInitialMeasurement) {
        canvasOverlayReady = true;
      }
    });
  });

  $effect(() => {
    if (workspace.areNodesMeasured) {
      return;
    }

    void nodes;
    workspace.reconcilePendingMeasurements();
  });

  $effect(() => {
    const nextHiddenNodeIds = new Set<string>();
    const updates = [];
    for (const node of workspace.nodes) {
      const hiddenByDebug = isNodeHiddenByDebug(node);
      const hiddenByLowDetail =
        useCanvasLowDetailOverlay && !hiddenByDebug && !isNodePendingMeasurement(node);
      if (hiddenByLowDetail) {
        nextHiddenNodeIds.add(node.id);
      }

      const shouldBeHidden = hiddenByDebug || hiddenByLowDetail;
      if (shouldBeHidden && !node.hidden) {
        updates.push([node.id, { hidden: true }]);
      } else if (!shouldBeHidden && node.hidden) {
        updates.push([node.id, { hidden: false }]);
      }
    }

    if (!areNodeIdSetsEqual(lowDetailHiddenNodeIds, nextHiddenNodeIds)) {
      lowDetailHiddenNodeIds = nextHiddenNodeIds;
    }
    if (updates.length > 0) {
      workspace.applyNodeUpdates(updates);
    }
  });

  $effect(() => {
    const nextHiddenEdgeIds = new Set<string>();
    const hideEdgesByDebug = workspace.debugState.hideEdges;
    for (const edge of workspace.edges) {
      if (
        useCanvasLowDetailOverlay &&
        !hideEdgesByDebug &&
        !workspace.isNodePendingMeasurement(edge.source) &&
        !workspace.isNodePendingMeasurement(edge.target)
      ) {
        nextHiddenEdgeIds.add(edge.id);
      }
    }

    if (!areNodeIdSetsEqual(lowDetailHiddenEdgeIds, nextHiddenEdgeIds)) {
      lowDetailHiddenEdgeIds = nextHiddenEdgeIds;
    }

    let didChange = false;
    const nextEdges = edges.map(edge => {
      const shouldBeHidden = hideEdgesByDebug || nextHiddenEdgeIds.has(edge.id);
      if (!!edge.hidden === shouldBeHidden) {
        return edge;
      }

      didChange = true;
      return { ...edge, hidden: shouldBeHidden };
    });

    if (didChange) {
      edges = nextEdges;
    }
  });

  $effect(() => {
    if (!useCanvasLowDetailOverlay) {
      lowDetailDragActive = false;
      lowDetailDragDelta = { x: 0, y: 0 };
      lowDetailSelectedNodeIds = [];
      lowDetailDraggedNodeIds = [];
      lowDetailHiddenNodeIds = new Set();
      lowDetailHiddenEdgeIds = new Set();
      if (!searchLowDetailCacheLocked) {
        lowDetailRenderCache = [];
        lowDetailEdgeRenderCache = [];
      }
      if (forcedLowDetailSelectionMode && flowStore.selectionRectMode === "nodes") {
        flowStore.selectionRectMode = null;
      }
      forcedLowDetailSelectionMode = false;
      return;
    }

    if (lowDetailDragActive || searchLowDetailCacheLocked) {
      return;
    }

    void workspace.nodes;
    buildLowDetailRenderCache();
  });

  $effect(() => {
    if (!useCanvasLowDetailOverlay) {
      return;
    }

    lowDetailEdgeRenderCache = visibleEdgeGeometries.flatMap(edge => {
      if (!isLowDetailCanvasSourceEdge(edge)) {
        return [];
      }

      return [
        {
          id: edge.id,
          path: edge.path,
          selected: edge.selected,
          animated: edge.animated,
        },
      ];
    });
  });

  $effect(() => {
    void lowDetailSelectedNodeIds.length;
    syncLowDetailSelectionMode(lowDetailSelectedNodeIds.length);
  });

  $effect(() => {
    void pendingSourceConnection;
    void pendingTargetConnection;
    void liveConnection.current;
    syncPendingConnectionPreview();
  });

  // # Handle actions requests
  $effect(() => {
    void workspace.areNodesMeasured;
    if (workspace.actionRequests.length > 0) untrack(() => handleActionRequests());
  });

  // custom box-selection handling
  // edges + nodes intersect partially, groups only intersect with full selection
  function applySelectionBoxOverrides(domSelectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const selectionOrigin = pointToRendererPoint({ x: domSelectionRect.x, y: domSelectionRect.y }, [
      flowStore.viewport.x,
      flowStore.viewport.y,
      flowStore.viewport.zoom,
    ]);
    const selectionRect = {
      x: selectionOrigin.x,
      y: selectionOrigin.y,
      width: domSelectionRect.width / flowStore.viewport.zoom,
      height: domSelectionRect.height / flowStore.viewport.zoom,
    };
    const defaultNodeSelectable = flowStore.elementsSelectable;
    const defaultEdgeSelectable = flowStore.defaultEdgeOptions.selectable ?? true;

    const selectedNodeIds = new Set<string>();
    for (const node of workspace.searchNodesCollidingWith({
      minX: selectionRect.x,
      minY: selectionRect.y,
      maxX: selectionRect.x + selectionRect.width,
      maxY: selectionRect.y + selectionRect.height,
    })) {
      const isSelectable = node.selectable ?? defaultNodeSelectable;
      if (!isSelectable || !isLowDetailCanvasSourceNode(node)) {
        continue;
      }

      const size = getRenderableNodeSize(node);
      if (!size) {
        continue;
      }

      const position = getAbsolutePosition(node);
      const nodeRect = {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };
      const nodeArea = nodeRect.width * nodeRect.height;
      const overlappingArea = getOverlappingArea(selectionRect, nodeRect);
      if (node.type === GROUP_NODE_TYPE) {
        if (overlappingArea >= nodeArea) {
          selectedNodeIds.add(node.id);
        }
      } else if (overlappingArea > 0) {
        selectedNodeIds.add(node.id);
      }
    }

    const nextNodes = flowStore.nodes.map(node => {
      const shouldSelect = selectedNodeIds.has(node.id);
      if (!!node.selected === shouldSelect) {
        return node;
      }

      return { ...node, selected: shouldSelect };
    });

    const selectedEdgeIds = new Set<string>();
    const edgeSelectionBounds = createEdgeSelectionBounds(selectionRect);
    for (const edge of visibleEdgeGeometryIndex.search(edgeSelectionBounds)) {
      const isSelectable = edge.selectable ?? defaultEdgeSelectable;
      if (!isSelectable || !isLowDetailCanvasSourceEdge(edge)) {
        continue;
      }

      if (edgeGeometryIntersectsRect(edge, edgeSelectionBounds)) {
        selectedEdgeIds.add(edge.id);
      }
    }

    const nextEdges = flowStore.edges.map(edge => {
      const shouldSelect = selectedEdgeIds.has(edge.id);
      if (!!edge.selected === shouldSelect) {
        return edge;
      }

      return { ...edge, selected: shouldSelect };
    });

    if (nextNodes.some((node, index) => node !== flowStore.nodes[index])) {
      flowStore.nodes = nextNodes;
    }
    if (nextEdges.some((edge, index) => edge !== flowStore.edges[index])) {
      flowStore.edges = nextEdges;
    }
  }

  $effect(() => {
    if (
      !workspace.debugState.useCustomSelectionBoxLogic ||
      flowStore.selectionRectMode !== "user" ||
      !flowStore.selectionRect
    ) {
      return;
    }

    lastUserSelectionRect = { ...flowStore.selectionRect };
    applySelectionBoxOverrides(flowStore.selectionRect);
  });

  function handleActionRequests() {
    // retain any actions that are not able to be processed yet
    const retained = [];
    for (const action of workspace.actionRequests) {
      switch (action.type) {
        case "reveal-node":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          const targetNodeId = action.nodeId ?? workspace.rootNodeId;
          if (!targetNodeId) {
            break;
          }

          const node = workspace.getNodeById(targetNodeId);
          if (!node) {
            console.warn(`Attempted to reveal node ${targetNodeId} but it was not found.`);
            continue;
          }
          const absolutePosition = getAbsolutePosition(node);
          const width = node.measured!.width!;
          const height = node.measured!.height!;
          const maxZoom = Math.min(
            ((innerWidth.current ?? width) / width) * 0.8,
            ((innerHeight.current ?? height) / height) * 0.8,
          );
          const previewTransitionToken = searchMenuInstance
            ? beginSearchPreviewTransition()
            : undefined;
          const viewportChange = setViewportCenter(
            absolutePosition.x + width / 2,
            absolutePosition.y + height / 2,
            {
              zoom: Math.min(1.2, maxZoom),
              duration: action.duration ?? 250,
            },
          );
          if (previewTransitionToken !== undefined) {
            endSearchPreviewTransitionAfter(viewportChange, previewTransitionToken);
          }
          break;

        case "fit-view":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          const fitNodes = resolveFitViewNodeIds({
            nodes: workspace.nodes,
            rootNodeId: workspace.rootNodeId,
            maxDistanceToRoot: action.maxDistanceToRoot,
          });
          fitView({
            nodes: fitNodes.length > 0 ? fitNodes : undefined,
            padding: 0.2,
            minZoom: MIN_FLOW_ZOOM,
            duration: action.duration ?? 250,
          });
          break;

        case "select-all":
          workspace.selectNodes(
            workspace.nodes.map(node => node.id),
            "replace",
          );
          break;

        case "search-nodes":
          lockLowDetailSearchCache();
          searchMenuInstance = { initialViewport: $state.snapshot(viewport.current) };
          break;

        case "auto-position-nodes":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          let targetNodes = workspace.getEffectivelySelectedNodes();
          if (targetNodes.length === 0) {
            const rootNode = workspace.getRootNode();
            if (rootNode) {
              targetNodes = [rootNode];
            } else if (workspace.nodes.length > 0) {
              targetNodes = workspace.nodes;
            } else {
              break;
            }
          }

          const updates = getAutoPositionNodeUpdates(targetNodes);
          if (updates.length > 0) {
            workspace.applyNodeUpdates(updates);
            recalculateGroupParents();
            applyDocumentState("nodes-moved");
          }
          break;

        case "view-raw-json":
          workspace.vscode.postMessage({ type: "openRawJson" });
          break;

        case "help-and-hotkeys":
          helpMenuOpen = !helpMenuOpen;
          break;

        case "customize-keybinds":
          workspace.vscode.postMessage({ type: "openKeybindings", query: "Hytale Node Editor" });
          break;
        case "document-refresh":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          workspace.applyNodeUpdates(
            getAllSiblingOrderUpdates().map(([nodeId, data]) => [nodeId, { data }]),
          );

          clearPendingConnection("both", true);
          recalculateGroupParents();
          break;
        case "reveal-selection":
          break;
        default:
          const _exhaustiveCheck: never = action;
      }
    }
    // length check to avoid trigger reactivity when there is no change
    if (retained.length !== workspace.actionRequests.length) workspace.actionRequests = retained;
  }

  /** @returns true if there were conflicts to restore/remove */
  function clearPendingConnection(
    type: "source" | "target" | "both",
    restoreConflicts: boolean,
  ): boolean {
    let hadConflicts = false;
    pendingConnectionPreviewKey = undefined;
    if (type === "source" || type === "both") {
      pendingSourceConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(pendingSourceConflictingEdges);
      }
      hadConflicts = pendingSourceConflictingEdges.length > 0;
      pendingSourceConflictingEdges = [];
    }
    if (type === "target" || type === "both") {
      pendingTargetConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(pendingTargetConflictingEdges);
      }
      hadConflicts = hadConflicts || pendingTargetConflictingEdges.length > 0;
      pendingTargetConflictingEdges = [];
    }
    return hadConflicts;
  }

  function syncPendingConnectionPreview() {
    const currentConnection = liveConnection.current;
    if (!currentConnection.inProgress) {
      return;
    }

    const nextPreviewConnection = pendingSourceConnection
      ? {
          ...pendingSourceConnection,
          target: currentConnection.toNode?.id,
          targetHandle: currentConnection.toHandle?.id,
        }
      : pendingTargetConnection
        ? {
            ...pendingTargetConnection,
            source: currentConnection.toNode?.id,
            sourceHandle: currentConnection.toHandle?.id,
          }
        : undefined;

    if (!nextPreviewConnection) {
      return;
    }

    const nextPreviewKey = pendingSourceConnection
      ? [
          "source",
          nextPreviewConnection.source,
          nextPreviewConnection.sourceHandle,
          nextPreviewConnection.target ?? "",
          nextPreviewConnection.targetHandle ?? "",
        ].join(":")
      : [
          "target",
          nextPreviewConnection.source ?? "",
          nextPreviewConnection.sourceHandle ?? "",
          nextPreviewConnection.target,
          nextPreviewConnection.targetHandle,
        ].join(":");

    if (nextPreviewKey === pendingConnectionPreviewKey) {
      return;
    }

    if (pendingSourceConflictingEdges.length > 0) {
      workspace.addEdges(pendingSourceConflictingEdges);
      pendingSourceConflictingEdges = [];
    }
    if (pendingTargetConflictingEdges.length > 0) {
      workspace.addEdges(pendingTargetConflictingEdges);
      pendingTargetConflictingEdges = [];
    }

    pendingConnectionPreviewKey = nextPreviewKey;
    if (pendingSourceConnection) {
      pendingSourceConflictingEdges = pruneConflictingEdges(nextPreviewConnection);
    } else {
      pendingTargetConflictingEdges = pruneConflictingEdges(nextPreviewConnection);
    }
  }

  // ! window event
  function handleWindowKeyDown(event: KeyboardEvent) {
    if (event.key === MULTISELECT_KEY) {
      multiselectModifierPressed = true;
    }

    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      isShortcutBlockedByEditableTarget(event.target)
    ) {
      return;
    }

    let captured = false;

    switch (event.key) {
      case "d":
        if (workspace.isDevelopment && (event.metaKey || event.ctrlKey)) {
          showDebugOverlay = !showDebugOverlay;
          console.log(workspace.nodes.filter(node => node.selected));
          captured = true;
        }
        break;
      case "Escape":
        helpMenuOpen = false;
        addMenuInstance = undefined;
        searchMenuInstance = undefined;
        resetSearchPreviewState();
        captured = true;
        workspace.selectNodes([], "replace");
        break;
    }

    if (captured) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleWindowKeyUp(event: KeyboardEvent) {
    if (event.key === MULTISELECT_KEY) {
      multiselectModifierPressed = false;
    }
  }

  /** @returns deep-copy clones of the nodes with their positions relative to their collective center */
  function normalizeNodePositions(nodes: FlowNode[]) {
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
      const position = getAbsoluteCenterPosition(node);
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x);
      maxY = Math.max(maxY, position.y);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return nodes.map(node => {
      // @ts-ignore - the clone will not have infinite depth.
      const copiedNode = structuredClone($state.snapshot(node)) as FlowNode;
      const absolutePosition = getAbsolutePosition(node);
      return {
        ...copiedNode,
        position: {
          x: absolutePosition.x - centerX,
          y: absolutePosition.y - centerY,
        },
        parentId: undefined,
        selected: false,
      };
    });
  }

  function buildCopiedSelection(nodes: FlowNode[]): NodeEditorClipboardSelection {
    const selectedNodeIds = new Set(nodes.map(node => node.id));
    const copiedEdges = workspace.edges
      .filter(edge => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target))
      .map(edge => {
        // @ts-ignore - the clone will not have infinite depth.
        const copiedEdge = structuredClone($state.snapshot(edge)) as FlowEdge;
        copiedEdge.selected = false;
        return copiedEdge;
      });

    return {
      nodes: normalizeNodePositions(nodes),
      edges: copiedEdges,
    };
  }

  function updateCopiedSelection(copiedSelection: NodeEditorClipboardSelection) {
    workspace.copiedSelection = copiedSelection;
    workspace.vscode.postMessage({ type: "clipboard", clipboard: copiedSelection });
  }

  function handleWindowCopy(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    updateCopiedSelection(buildCopiedSelection(workspace.getEffectivelySelectedNodes()));

    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowCut(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }

    const nodesCut = workspace.getEffectivelySelectedNodes();
    updateCopiedSelection(buildCopiedSelection(nodesCut));

    void deleteElements({ nodes: nodesCut });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowPaste(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    const mouseFlowPosition = screenToFlowPosition(cursorPos);
    const { nodes: copiedNodes, edges: copiedEdges } = workspace.copiedSelection;

    // deselect existing nodes
    workspace.applyNodeUpdates(
      workspace.nodes.filter(node => node.selected).map(node => [node.id, { selected: false }]),
    );

    const pastedNodeIds = new Map<string, string>();
    const pastedNodes = copiedNodes.map(node => {
      // @ts-ignore - the clone will not have infinite depth.
      const pastedNode = structuredClone($state.snapshot(node)) as FlowNode;
      const newNodeId = node.id.split("-")[0] + "-" + createUuidV4();
      pastedNodeIds.set(node.id, newNodeId);

      return {
        ...pastedNode,
        position: {
          x: node.position.x + mouseFlowPosition.x,
          y: node.position.y + mouseFlowPosition.y,
        },
        selected: true,
        id: newNodeId,
      };
    });
    const pastedEdges = copiedEdges.flatMap(edge => {
      const sourceId = pastedNodeIds.get(edge.source);
      const targetId = pastedNodeIds.get(edge.target);
      if (!sourceId || !targetId) {
        return [];
      }

      const pastedEdge = structuredClone($state.snapshot(edge)) as FlowEdge;
      return [
        {
          ...pastedEdge,
          id: `${sourceId}:${pastedEdge.sourceHandle}-${targetId}`,
          source: sourceId,
          target: targetId,
          selected: false,
        },
      ];
    });

    workspace.nodes = [...workspace.nodes, ...pastedNodes];
    workspace.trackMeasurementForNodeIds(pastedNodes.map(node => node.id));
    workspace.addEdges(pastedEdges);
    applyDocumentState("element-list-changed");
    event.preventDefault();
    event.stopPropagation();
  }

  // # Window Events
  const windowEvents = {
    onkeydowncapture: handleWindowKeyDown,
    onkeyupcapture: handleWindowKeyUp,
    oncopycapture: handleWindowCopy,
    oncutcapture: handleWindowCut,
    onpastecapture: handleWindowPaste,
    onpointermovecapture: (event: PointerEvent) => {
      cursorPos = { x: event.clientX, y: event.clientY };
    },
    onpointerdown: (event: PointerEvent) => {
      if (!(event.target as HTMLElement)?.closest("[data-add-menu]")) {
        addMenuInstance = undefined;
        if (clearPendingConnection("both", false)) {
          applyDocumentState("element-list-changed");
        }
      }
      if (!(event.target as HTMLElement)?.closest("[data-search-menu]")) {
        searchMenuInstance = undefined;
        resetSearchPreviewState();
      }
    },
    onblur: () => {
      multiselectModifierPressed = false;
    },
  };

  function handleFlowWrapperClickCapture(event: MouseEvent) {
    if (
      !useCanvasLowDetailOverlay ||
      !(event.target instanceof Element) ||
      event.button !== 0 ||
      event.defaultPrevented ||
      event.target.closest(".svelte-flow__panel, [data-add-menu], [data-search-menu]")
    ) {
      return;
    }

    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const canvasNode = getCanvasSelectableNodeAtPoint(flowPosition);
    if (!canvasNode) {
      return;
    }

    const selectionType = multiselectModifierPressed ? "add" : "replace";
    if (selectionType === "replace" && edges.some(edge => edge.selected)) {
      edges = edges.map(edge => (edge.selected ? { ...edge, selected: false } : edge));
    }
    workspace.selectNode(canvasNode.id, selectionType);
    lowDetailSelectedNodeIds = workspace.nodes.flatMap(node => (node.selected ? [node.id] : []));
    flowStore.selectionRect = null;
    flowStore.selectionRectMode = "nodes";
    forcedLowDetailSelectionMode = true;
    event.preventDefault();
    event.stopPropagation();
  }

  // # Svelte Flow Events
  const svelteFlowEvents: SvelteFlowProps<FlowNode, FlowEdge> = {
    // ## On Connect
    onconnect: connection => {
      pruneConflictingEdges(connection);
      workspace.addEdges([connection]);
      applyDocumentState("element-list-changed");
    },
    // ## On Connect Start
    onconnectstart: (pointerEvent, { nodeId, handleId, handleType }) => {
      switch (handleType) {
        case "source":
          pendingSourceConnection = {
            source: nodeId!,
            sourceHandle: handleId!,
          };
          pendingSourceConflictingEdges = [];
          pendingTargetConnection = undefined;
          pendingTargetConflictingEdges = [];
          pendingConnectionPreviewKey = undefined;
          break;
        case "target":
          pendingTargetConnection = {
            target: nodeId!,
            targetHandle: handleId!,
          };
          pendingTargetConflictingEdges = [];
          pendingSourceConnection = undefined;
          pendingSourceConflictingEdges = [];
          pendingConnectionPreviewKey = undefined;
          break;
      }
    },
    // ## On Connect End
    onconnectend: (event, connectionState) => {
      // spawn add menu if ended not on another pin and started from the parent node
      if (connectionState.fromPosition === Position.Right && connectionState.toNode === null) {
        const fromNode = workspace.getNodeById(connectionState.fromNode!.id);
        const connectionFilter = fromNode.data.childTypes[connectionState.fromHandle!.id];
        addMenuInstance = {
          screenPosition: connectionState.pointer!,
          spawnPosition: screenToFlowPosition(connectionState.pointer!),
          connectionFilter: connectionFilter,
        };
      } else {
        // restore conflicts if invalid
        clearPendingConnection("both", !connectionState.isValid);
      }
    },
    // ## On Node Drag Stop
    onnodedragstop: event => {
      recalculateGroupParents();
      applyDocumentState("nodes-moved");
    },
    // ## On Node Context Menu
    onnodecontextmenu: ({ event: pointerEvent, node }) => {
      // groups should open add menu on right click
      if (node.type === GROUP_NODE_TYPE) {
        const flowPosition = screenToFlowPosition({
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        });
        addMenuInstance = {
          screenPosition: { x: pointerEvent.clientX, y: pointerEvent.clientY },
          spawnPosition: flowPosition,
        };
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
      }
    },
    // ## On Pane Click (left click)
    onpaneclick: ({ event }) => {},
    onmoveend: () => {
      onviewportchange?.($state.snapshot(flowStore.viewport));
    },
    onselectionchange: ({ nodes: selectedNodes }) => {
      lowDetailSelectedNodeIds = selectedNodes.map(node => node.id);
      syncLowDetailSelectionMode(selectedNodes.length);
    },
    onselectionend: () => {
      if (!workspace.debugState.useCustomSelectionBoxLogic || !lastUserSelectionRect) {
        return;
      }

      const selectionRect = lastUserSelectionRect;
      requestAnimationFrame(() => applySelectionBoxOverrides(selectionRect));
    },
    onselectiondragstart: (_event, nodes) => {
      if (!useCanvasLowDetailOverlay || nodes.length === 0) {
        return;
      }

      lowDetailDragActive = true;
      lowDetailDraggedNodeIds = workspace.getEffectivelySelectedNodes().map(node => node.id);
      lowDetailDragDelta = { x: 0, y: 0 };
      updateLowDetailDragDelta(nodes);
    },
    onselectiondrag: (_event, nodes) => {
      if (!useCanvasLowDetailOverlay || !lowDetailDragActive || nodes.length === 0) {
        return;
      }

      updateLowDetailDragDelta(nodes);
    },
    onselectiondragstop: (_event, nodes) => {
      if (!useCanvasLowDetailOverlay) {
        return;
      }

      if (nodes.length > 0) {
        updateLowDetailDragDelta(nodes);
      }
      lowDetailDragActive = false;
      lowDetailDraggedNodeIds = [];
      lowDetailDragDelta = { x: 0, y: 0 };
    },
    // ## On Pane Context Menu (right click)
    onpanecontextmenu: ({ event }) => {
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addMenuInstance = {
        screenPosition: { x: event.clientX, y: event.clientY },
        spawnPosition: flowPosition,
      };
      event.preventDefault();
    },
    ondelete: ({ nodes, edges }) => {
      if (nodes.some(node => node.id === workspace.rootNodeId)) {
        workspace.rootNodeId = undefined;
      }
      applyDocumentState("element-list-changed");
    },
  };

  // # Add Menu Events
  const addMenuEvents: Partial<AddMenuProps> = {
    // ## On Add Menu Cancel
    oncancel: () => {
      clearPendingConnection("both", true);
      addMenuInstance = undefined;
    },

    // ## On Template Selection (create new node)
    onselection: template => {
      const isCreatingRootNode = !workspace.getRootNode();
      const newNode: FlowNode = {
        ...createNodeFromTemplate(template, addMenuInstance!.spawnPosition),
      };
      workspace.nodes = [...workspace.nodes, newNode];
      workspace.trackMeasurementForNodeIds([newNode.id]);
      if (isCreatingRootNode) {
        workspace.rootNodeId = newNode.id;
      } else if (pendingSourceConnection) {
        workspace.addEdges([
          { ...pendingSourceConnection, target: newNode.id, targetHandle: INPUT_HANDLE_ID },
        ]);
      }
      clearPendingConnection("both", false);

      // this is to recalculate group parents - we can't do it immediately because the node does not yet have dimensions
      workspace.actionRequests.push({ type: "document-refresh" });
      addMenuInstance = undefined;
      applyDocumentState("element-list-changed");
    },
  };
</script>

<svelte:window
  // svelte won't let you ...spread window events :'(
  onkeydowncapture={windowEvents.onkeydowncapture}
  onkeyupcapture={windowEvents.onkeyupcapture}
  oncopycapture={windowEvents.oncopycapture}
  oncutcapture={windowEvents.oncutcapture}
  onpastecapture={windowEvents.onpastecapture}
  onpointermovecapture={windowEvents.onpointermovecapture}
  onpointerdown={windowEvents.onpointerdown}
  onblur={windowEvents.onblur}
/>

<div
  class="relative w-full h-full overflow-hidden"
  onclickcapture={handleFlowWrapperClickCapture}
  bind:this={flowWrapperElement}
>
  <SvelteFlow
    bind:nodes
    bind:edges
    {initialViewport}
    {nodeTypes}
    disableKeyboardA11y={!!addMenuInstance || !!searchMenuInstance || helpMenuOpen}
    deleteKey={["Delete", "Backspace"]}
    selectionKey={null}
    selectionMode={SelectionMode.Partial}
    selectNodesOnDrag={false}
    zIndexMode={"auto"}
    panOnDrag={workspace.controlScheme === "mouse" && !multiselectModifierPressed}
    panOnScroll={workspace.controlScheme === "trackpad"}
    multiSelectionKey={MULTISELECT_KEY}
    selectionOnDrag={workspace.controlScheme === "trackpad" || multiselectModifierPressed}
    panActivationKey={null}
    minZoom={MIN_FLOW_ZOOM}
    onlyRenderVisibleElements={useVisibleElementCulling}
    connectionRadius={CONNECTION_RADIUS}
    isValidConnection={connection => {
      // todo abuse validation checking + connection radius detection to trigger events for snap/snapping handles (so we can preview the pruning)
      // todo also while you're at it instead of *removing* conflicting edges we should render them as dashed lines it'll probably look better
      return isValidConnection(connection);
    }}
    {...svelteFlowEvents}
  >
    <Background bgColor={"var(--vscode-editor-background)"} />
    {#if useCanvasLowDetailOverlay}
      <LowDetailNodeCanvasOverlay
        active
        items={lowDetailRenderCache}
        edges={lowDetailEdgeRenderCache}
        selectedNodeIds={lowDetailSelectedNodeIds}
        draggedNodeIds={lowDetailDraggedNodeIds}
        dragDelta={lowDetailDragDelta}
        dragging={lowDetailDragActive}
        edgeWidth={workspace.debugState.lowDetailCanvasEdgeBaseWidth *
          workspace.zoomCompensationScale}
        zoomCompensationScale={workspace.zoomCompensationScale}
      />
    {/if}
    <NodeEditorActionMenu />
    {#if workspace.isDevelopment && showDebugOverlay}
      <DebugPanel />
    {/if}
    {#if searchMenuInstance}
      <NodeSearchPanel
        oncancel={() => {
          const previewTransitionToken = beginSearchPreviewTransition();
          const viewportChange = setViewport(searchMenuInstance!.initialViewport, { duration: 250 });
          searchMenuInstance = undefined;
          unlockLowDetailSearchCache();
          endSearchPreviewTransitionAfter(viewportChange, previewTransitionToken);
        }}
        onselection={(node, inputId) => {
          workspace.actionRequests.push({ type: "reveal-node", nodeId: node.id });
          if (node.type !== GROUP_NODE_TYPE) {
            workspace.selectNode(node.id, "replace");
          }
          searchMenuInstance = undefined;
          resetSearchPreviewState();

          if (inputId) {
            requestAnimationFrame(() => {
              const inputElement = document.getElementById(inputId);
              inputElement.focus();
            });
          }
        }}
        viewportCenter={getViewportCenter(searchMenuInstance!.initialViewport)}
      />
    {/if}
  </SvelteFlow>

  {#if addMenuInstance}
    {@const { screenPosition, connectionFilter } = addMenuInstance}
    <AddNodeMenu {connectionFilter} {screenPosition} {...addMenuEvents} />
  {/if}

  {#if helpMenuOpen}
    <NodeHelpPanel onclose={() => (helpMenuOpen = false)} />
  {/if}
</div>
