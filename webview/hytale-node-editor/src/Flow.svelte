<script lang="ts">
  import {
    Background,
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
  import { getOverlappingArea, getViewportForBounds, pointToRendererPoint } from "@xyflow/system";
  import RBush from "rbush";

  import { type NodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
  import AddNodeMenu, {
    type AddMenuConnectionFilter,
    type AddMenuProps,
  } from "@node-editor/components/AddNodeMenu.svelte";
  import DebugPanel from "@node-editor/components/DebugPanel.svelte";
  import LowDetailNodeCanvasOverlay from "@node-editor/components/LowDetailNodeCanvasOverlay.svelte";
  import NodeEditorActionMenu from "@node-editor/components/NodeEditorActionMenu.svelte";
  import NodeHelpPanel from "@node-editor/components/NodeHelpPanel.svelte";
  import NodeSearchPanel from "@node-editor/components/NodeSearchPanel.svelte";
  import { CONNECTION_RADIUS, GROUP_NODE_TYPE, MULTISELECT_KEY, nodeTypes } from "@node-editor/constants";
  import { getAutoPositionNodeUpdates } from "@node-editor/node-editor/layout/autoLayout";
  import { createConnectionPreviewController } from "@node-editor/node-editor/utils/connectionPreview.svelte";
  import {
    buildIndexedBezierEdgeGeometry,
    createEdgeSelectionBounds,
    edgeGeometryIntersectsRect,
    type IndexedBezierEdgeGeometry,
  } from "@node-editor/node-editor/utils/edgeGeometry";
  import { isShortcutBlockedByEditableTarget } from "@node-editor/node-editor/utils/flowKeyboard";
  import { createHandlePriorityController } from "@node-editor/node-editor/utils/handlePriority.svelte";
  import { createUuidV4 } from "@node-editor/node-editor/utils/idUtils";
  import { createLowDetailController } from "@node-editor/node-editor/utils/lowDetailController.svelte";
  import {
    collectConflictingEdges,
    getCompatibleInputHandleId,
    getCompatibleOutputHandleId,
    getAbsoluteCenterPosition,
    getAbsolutePosition,
    getAllSiblingOrderUpdates,
    getInputPin,
    getOutputPin,
    isValidConnection,
    recalculateGroupParents,
    resolveFitViewNodeIds,
  } from "@node-editor/node-editor/utils/nodeUtils.svelte";
  import {
    type NodeRenderDetailMode,
    useNodeEditorSession,
  } from "@node-editor/workspace.svelte";
  import { cloneJsonLike } from "@shared/jsonClone";
  import { tick, untrack } from "svelte";
  import type { FlowEdge, FlowNode } from "./common";
  import {
    createFieldValuePropertyChange,
    createNodePropertiesUpdatedEdit,
  } from "./node-editor/utils/graphDocument";
  import { createNodeFromTemplate } from "./node-editor/utils/nodeFactory.svelte";

  const {
    getNodesBounds,
    screenToFlowPosition,
    setCenter: setViewportCenter,
    setViewport,
    deleteElements,
  } = useSvelteFlow();
  const flowStore = $derived(useStore<FlowNode, FlowEdge>());
  const liveConnection = useConnection();
  const workspace = useNodeEditorSession();
  const connectionPreview = createConnectionPreviewController(workspace);
  const lowDetail = createLowDetailController(workspace);

  const viewport = useViewport();
  const getViewportSize = () => ({
    width: flowStore.width || flowWrapperElement?.clientWidth || 0,
    height: flowStore.height || flowWrapperElement?.clientHeight || 0,
  });
  const getViewportCenter = (viewport: Viewport) => {
    const { width, height } = getViewportSize();
    return {
      x: (width / 2 - viewport.x) / viewport.zoom,
      y: (height / 2 - viewport.y) / viewport.zoom,
    };
  };
  const toFlowWrapperPosition = (screenPosition: XYPosition): XYPosition => {
    const rect = flowWrapperElement?.getBoundingClientRect();
    return {
      x: screenPosition.x - (rect?.left ?? 0),
      y: screenPosition.y - (rect?.top ?? 0),
    };
  };
  const getEventClientPosition = (event: MouseEvent | TouchEvent): XYPosition | undefined => {
    if ("clientX" in event) {
      return { x: event.clientX, y: event.clientY };
    }

    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : undefined;
  };

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
  const MOUSE_MODE_NO_PAN_CLASS = "__mouse-mode-disabled-nopan";
  const FLOW_OVERLAY_TARGET_SELECTOR =
    ".svelte-flow__panel, [data-add-menu], [data-search-menu], [data-node-help-overlay]";
  const NODE_DRAG_RETARGET_BLOCKER_SELECTOR = `${FLOW_OVERLAY_TARGET_SELECTOR}, .svelte-flow__handle, [data-group-body]`;
  const handlePriority = createHandlePriorityController(FLOW_OVERLAY_TARGET_SELECTOR);
  let isRootNodeMissing = $derived(workspace.getRootNode() === undefined);

  let flowWrapperElement: HTMLDivElement | undefined = undefined;
  let multiselectModifierPressed = $state(false);
  let lastUserSelectionRect = $state<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  let cursorPos = $state<XYPosition>();
  let mouseModeRightPointerDownPosition = $state<XYPosition | undefined>();
  let suppressMouseModeContextMenu = $state(false);

  let addMenuInstance:
    | {
        viewportPosition: XYPosition;
        spawnPosition: XYPosition;
        connectionFilter?: AddMenuConnectionFilter;
      }
    | undefined = $state();
  let searchMenuInstance:
    | {
        initialViewport: Viewport;
      }
    | undefined = $state();
  let helpMenuOpen = $state(false);
  let showDebugOverlay = $state(false);
  let isHandlingActionRequests = false;
  const activeRenderDetailMode = $derived(lowDetail.activeRenderDetailMode);

  const useCanvasLowDetailOverlay = $derived(
    lowDetail.canvasOverlayReady && activeRenderDetailMode === "low",
  );
  const useVisibleElementCulling = $derived(workspace.hasCompletedInitialMeasurement);
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

  $effect(() => {
    const zoom = viewport.current.zoom;
    workspace.updateViewportZoom(zoom);
    lowDetail.syncRenderDetailTransitionForZoom(zoom);
    const nextDetailMode = zoom >= workspace.debugState.lowDetailZoomThreshold ? "full" : "low";
    if (workspace.renderDetailMode !== nextDetailMode) {
      workspace.renderDetailMode = nextDetailMode;
    }
  });

  $effect(() => {
    if (!workspace.hasCompletedInitialMeasurement) {
      lowDetail.canvasOverlayReadyToken++;
      lowDetail.canvasOverlayReady = false;
      return;
    }

    if (lowDetail.canvasOverlayReady) {
      return;
    }

    const token = ++lowDetail.canvasOverlayReadyToken;
    void tick().then(() => {
      if (
        token === lowDetail.canvasOverlayReadyToken &&
        workspace.hasCompletedInitialMeasurement
      ) {
        lowDetail.canvasOverlayReady = true;
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
      const hiddenByDebug = lowDetail.isNodeHiddenByDebug(node);
      const hiddenByLowDetail =
        useCanvasLowDetailOverlay && !hiddenByDebug && !lowDetail.isNodePendingMeasurement(node);
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

    lowDetail.updateHiddenNodeIds(nextHiddenNodeIds);
    if (updates.length > 0) {
      workspace.applyNodeUpdates(updates);
    }
  });

  $effect(() => {
    if (workspace.controlScheme !== "mouse" || !flowWrapperElement) {
      return;
    }

    void nodes;
    void edges;
    void flowStore.selectionRectMode;

    queueMicrotask(() => {
      flowWrapperElement
        ?.querySelectorAll(`.${MOUSE_MODE_NO_PAN_CLASS}`)
        .forEach(element => element.classList.remove(MOUSE_MODE_NO_PAN_CLASS));
    });
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

    lowDetail.updateHiddenEdgeIds(nextHiddenEdgeIds);

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
      lowDetail.resetWhenCanvasDisabled(flowStore);
      return;
    }

    if (lowDetail.dragActive || lowDetail.searchCacheLocked) {
      return;
    }

    void workspace.nodes;
    lowDetail.buildRenderCache();
  });

  $effect(() => {
    if (!useCanvasLowDetailOverlay) {
      return;
    }

    lowDetail.edgeRenderCache = visibleEdgeGeometries.flatMap(edge => {
      if (!lowDetail.isCanvasSourceEdge(edge)) {
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
    void lowDetail.selectedNodeIds.length;
    lowDetail.syncSelectionMode(useCanvasLowDetailOverlay, flowStore);
  });

  $effect(() => {
    void connectionPreview.pendingSourceConnection;
    void connectionPreview.pendingTargetConnection;
    void liveConnection.current;
    connectionPreview.updateHover(liveConnection.current);
  });

  // # Handle actions requests
  $effect(() => {
    void workspace.areNodesMeasured;
    if (!isHandlingActionRequests && workspace.actionRequests.length > 0) {
      untrack(() => {
        void handleActionRequests();
      });
    }
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
      if (!isSelectable || !lowDetail.isCanvasSourceNode(node)) {
        continue;
      }

      const size = lowDetail.getRenderableNodeSize(node);
      if (!size) {
        continue;
      }

      const position = getAbsolutePosition(node, workspace);
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
      if (!isSelectable || !lowDetail.isCanvasSourceEdge(edge)) {
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

  async function handleActionRequests() {
    if (isHandlingActionRequests) {
      return;
    }

    isHandlingActionRequests = true;
    // retain any actions that are not able to be processed yet
    const retained = [];
    const initialActionRequests = workspace.actionRequests;
    const initialActions = [...initialActionRequests];
    const initialLength = initialActionRequests.length;

    try {
      for (const action of initialActions) {
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
          const absolutePosition = getAbsolutePosition(node, workspace);
          const width = node.measured!.width!;
          const height = node.measured!.height!;
          const { width: viewportWidth, height: viewportHeight } = getViewportSize();
          const maxZoom = Math.min(
            ((viewportWidth || width) / width) * 0.8,
            ((viewportHeight || height) / height) * 0.8,
          );
          const previewTransitionToken = searchMenuInstance
            ? lowDetail.beginSearchPreviewTransition()
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
            lowDetail.endSearchPreviewTransitionAfter(viewportChange, previewTransitionToken);
          }
          break;

        case "fit-view":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          const fitNodeIds = resolveFitViewNodeIds({
            nodes: workspace.nodes,
            rootNodeId: workspace.rootNodeId,
            maxDistanceToRoot: action.maxDistanceToRoot,
            session: workspace,
          });
          const fitNodeIdSet = new Set(fitNodeIds.map(node => node.id));
          const nodesToFit =
            fitNodeIdSet.size > 0
              ? workspace.nodes.filter(node => fitNodeIdSet.has(node.id))
              : workspace.nodes;
          if (nodesToFit.length === 0) {
            break;
          }
          const fitBounds = getNodesBounds(nodesToFit);
          const nextViewport = getViewportForBounds(
            fitBounds,
            flowStore.width,
            flowStore.height,
            MIN_FLOW_ZOOM,
            flowStore.maxZoom,
            0.2,
          );
          const targetRenderDetailMode: NodeRenderDetailMode =
            nextViewport.zoom >= workspace.debugState.lowDetailZoomThreshold ? "full" : "low";
          const fitViewTransitionToken =
            targetRenderDetailMode === activeRenderDetailMode
              ? lowDetail.beginRenderDetailTransition(targetRenderDetailMode)
              : lowDetail.beginThresholdRenderDetailTransition(
                  targetRenderDetailMode,
                  workspace.debugState.lowDetailZoomThreshold,
                );
          if (targetRenderDetailMode === "low" && lowDetail.canvasOverlayReady) {
            lowDetail.buildRenderCache();
          }
          const fitViewChange = setViewport(nextViewport, {
            duration: action.duration ?? 250,
          });
          lowDetail.endRenderDetailTransitionAfter(fitViewChange, fitViewTransitionToken);
          break;

        case "select-all":
          workspace.selectNodes(
            workspace.nodes.map(node => node.id),
            "replace",
          );
          break;

        case "search-nodes":
          lowDetail.lockSearchCache();
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

          const updates = await getAutoPositionNodeUpdates(targetNodes, workspace);
          if (updates.length > 0) {
            workspace.applyNodeUpdates(updates);
            recalculateGroupParents(workspace);
            workspace.applyDocumentState("nodes-moved");
          }
          break;

        case "view-raw-json":
          if (workspace.allowOpenRawJson) {
            workspace.postMessageToHost({ type: "openRawJson" });
          }
          break;

        case "help-and-hotkeys":
          helpMenuOpen = !helpMenuOpen;
          break;

        case "customize-keybinds":
          workspace.postMessageToHost({ type: "openKeybindings", query: "Hytale Node Editor" });
          break;
        case "set-root":
          workspace.setRootNode(action.nodeId);
          break;
        case "set-field-explicit-empty":
          setFieldExplicitEmpty(action.nodeId, action.schemaKey);
          break;
        case "set-list-item-explicit-empty":
          setListItemExplicitEmpty(action.nodeId, action.schemaKey, action.itemIndex);
          break;
        case "document-refresh":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          workspace.applyNodeUpdates(
            getAllSiblingOrderUpdates(workspace).map(([nodeId, data]) => [nodeId, { data }]),
          );

          connectionPreview.cancel();
          recalculateGroupParents(workspace);
          break;
        case "reveal-selection":
          break;
        default:
          const _exhaustiveCheck: never = action;
        }
      }
    } finally {
      const queuedDuringHandling = workspace.actionRequests.slice(initialLength);
      const shouldKeepExistingQueue =
        retained.length === initialLength && queuedDuringHandling.length === 0;

      if (!shouldKeepExistingQueue) {
        workspace.actionRequests = [...retained, ...queuedDuringHandling];
      }

      isHandlingActionRequests = false;
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
        lowDetail.resetSearchPreviewState();
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
      const position = getAbsoluteCenterPosition(node, workspace);
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
      const absolutePosition = getAbsolutePosition(node, workspace);
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
    workspace.postMessageToHost({ type: "clipboard", clipboard: copiedSelection });
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
    workspace.applyDocumentState("element-list-changed");
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
      handlePriority.trackPointerMove(event);
      if (
        workspace.controlScheme === "mouse" &&
        mouseModeRightPointerDownPosition &&
        (event.buttons & 2) === 2
      ) {
        const dx = event.clientX - mouseModeRightPointerDownPosition.x;
        const dy = event.clientY - mouseModeRightPointerDownPosition.y;
        if (Math.hypot(dx, dy) > 4) {
          suppressMouseModeContextMenu = true;
        }
      }
    },
    onpointerdowncapture: (event: PointerEvent) => {
      if (workspace.controlScheme === "mouse" && event.button === 2) {
        mouseModeRightPointerDownPosition = { x: event.clientX, y: event.clientY };
        suppressMouseModeContextMenu = false;
      } else {
        mouseModeRightPointerDownPosition = undefined;
      }
    },
    onpointerdown: (event: PointerEvent) => {
      if (!(event.target as HTMLElement)?.closest("[data-add-menu]")) {
        addMenuInstance = undefined;
        connectionPreview.cancel();
      }
      if (!(event.target as HTMLElement)?.closest("[data-search-menu]")) {
        searchMenuInstance = undefined;
        lowDetail.resetSearchPreviewState();
      }
    },
    onblur: () => {
      multiselectModifierPressed = false;
      mouseModeRightPointerDownPosition = undefined;
      suppressMouseModeContextMenu = false;
      handlePriority.reset();
    },
    onpointerup: (event: PointerEvent) => {
      if (
        workspace.controlScheme === "mouse" &&
        event.button === 2 &&
        !helpMenuOpen &&
        !suppressMouseModeContextMenu &&
        event.target instanceof Element &&
        !event.target.closest(FLOW_OVERLAY_TARGET_SELECTOR)
      ) {
        const groupNodeTarget = event.target.closest(`.svelte-flow__node-${GROUP_NODE_TYPE}`);
        const nodeTarget = event.target.closest(".svelte-flow__node");
        if (!nodeTarget || groupNodeTarget) {
          addMenuInstance = {
            viewportPosition: toFlowWrapperPosition({ x: event.clientX, y: event.clientY }),
            spawnPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          };
        }
      }

      mouseModeRightPointerDownPosition = undefined;
      suppressMouseModeContextMenu = false;
    },
  };

  function handleFlowWrapperContextMenu(event: MouseEvent) {
    if (workspace.controlScheme !== "mouse") {
      return;
    }
    if (isSetRootNativeContextTarget(event)) {
      return;
    }
    event.preventDefault();
  }

  function isSetRootNativeContextTarget(event: Event): boolean {
    return (
      event.target instanceof Element &&
      (event.target.closest("[data-node-editor-set-root-context='true']") !== null ||
        event.target.closest("[data-node-editor-field-context='true']") !== null)
    );
  }

  function setFieldExplicitEmpty(nodeId: string, schemaKey: string) {
    const node = workspace.getNodeById(nodeId);
    if (!node || node.type !== "datanode") {
      return;
    }

    const field = node.data.fieldsBySchemaKey?.[schemaKey];
    if (
      !field ||
      (field.type !== "string" && field.type !== "text")
    ) {
      return;
    }

    const previousFieldSnapshot = cloneJsonLike($state.snapshot(field));
    const nextField = {
      ...previousFieldSnapshot,
      value: "",
      isImplicit: false,
      isExplicitEmpty: true,
      isSet: true,
    };
    const nextFieldsBySchemaKey = {
      ...node.data.fieldsBySchemaKey,
      [schemaKey]: nextField,
    };

    workspace.applyNodeUpdates([
      [
        nodeId,
        {
          data: {
            fieldsBySchemaKey: nextFieldsBySchemaKey,
          },
        },
      ],
    ]);

    const edit = createNodePropertiesUpdatedEdit([
      createFieldValuePropertyChange({
        nodeId,
        schemaKey,
        beforeField: previousFieldSnapshot,
        afterField: nextField,
      }),
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }

  function setListItemExplicitEmpty(nodeId: string, schemaKey: string, itemIndex: number) {
    const node = workspace.getNodeById(nodeId);
    if (!node || node.type !== "datanode") {
      return;
    }

    const field = node.data.fieldsBySchemaKey?.[schemaKey];
    if (
      !field ||
      field.type !== "list" ||
      !Array.isArray(field.value) ||
      !Number.isInteger(itemIndex) ||
      itemIndex < 0 ||
      itemIndex >= field.value.length ||
      typeof field.value[itemIndex] !== "string"
    ) {
      return;
    }

    const previousFieldSnapshot = cloneJsonLike($state.snapshot(field));
    const previousItems = Array.isArray(previousFieldSnapshot.value)
      ? previousFieldSnapshot.value
      : [];
    const nextItems = previousItems.slice();
    nextItems[itemIndex] = "";
    const nextField = {
      ...previousFieldSnapshot,
      value: nextItems,
      isImplicit: false,
      isExplicitEmpty: false,
      isSet: true,
    };
    const nextFieldsBySchemaKey = {
      ...node.data.fieldsBySchemaKey,
      [schemaKey]: nextField,
    };

    workspace.applyNodeUpdates([
      [
        nodeId,
        {
          data: {
            fieldsBySchemaKey: nextFieldsBySchemaKey,
          },
        },
      ],
    ]);

    const edit = createNodePropertiesUpdatedEdit([
      createFieldValuePropertyChange({
        nodeId,
        schemaKey,
        beforeField: previousFieldSnapshot,
        afterField: nextField,
      }),
    ]);
    if (edit) {
      workspace.applyGraphEdit(edit);
    }
  }

  // In low-detail mode the real node DOM is hidden, so clicks on canvas-rendered nodes still target the pane.
  // We use this to keep XYFlow's pane handlers from treating those presses as empty-pane clicks.
  function getLowDetailCanvasNodeFromPointerEvent(event: PointerEvent | MouseEvent) {
    if (
      helpMenuOpen ||
      !useCanvasLowDetailOverlay ||
      !(event.target instanceof Element) ||
      event.button !== 0 ||
      event.defaultPrevented ||
      event.target.closest(FLOW_OVERLAY_TARGET_SELECTOR)
    ) {
      return undefined;
    }

    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    return lowDetail.getCanvasSelectableNodeAtPoint(flowPosition, flowStore);
  }

  // retargets node drag when we are dragging unselected nodes (to prevent https://github.com/jrddp/hytale-devtools/issues/7)
  function shouldRetargetPrimaryNodeDrag(event: PointerEvent) {
    return (
      !useCanvasLowDetailOverlay &&
      !helpMenuOpen &&
      event.button === 0 &&
      !multiselectModifierPressed &&
      !event.defaultPrevented &&
      event.target instanceof Element &&
      !event.target.closest(NODE_DRAG_RETARGET_BLOCKER_SELECTOR)
    );
  }

  function handleFlowWrapperMouseDownCapture(event: MouseEvent) {
    handlePriority.handleMouseDownCapture(event, {
      useCanvasLowDetailOverlay,
      helpMenuOpen,
      flowStore,
    });
  }

  function handleFlowWrapperPointerDownCapture(event: PointerEvent) {
    if (getLowDetailCanvasNodeFromPointerEvent(event)) {
      event.stopPropagation();
      return;
    }

    if (!shouldRetargetPrimaryNodeDrag(event)) {
      return;
    }

    const nodeElement = (event.target as Element).closest<HTMLDivElement>(".svelte-flow__node");
    if (!nodeElement) {
      return;
    }

    const nodeId = nodeElement.dataset.id;
    const node = nodeId ? flowStore.nodeLookup.get(nodeId) : undefined;
    if (!node || node.selected) {
      return;
    }

    flowStore.handleNodeSelection(nodeId!, false, nodeElement);
  }

  function handleFlowWrapperPointerUpCapture(event: PointerEvent) {
    if (getLowDetailCanvasNodeFromPointerEvent(event)) {
      event.stopPropagation();
    }
  }

  function handleFlowWrapperClickCapture(event: MouseEvent) {
    if (handlePriority.suppressEdgeClick(event)) {
      return;
    }

    const canvasNode = getLowDetailCanvasNodeFromPointerEvent(event);
    if (!canvasNode) {
      return;
    }

    const multiselectActive =
      multiselectModifierPressed || event.getModifierState(MULTISELECT_KEY);
    flowStore.multiselectionKeyPressed = multiselectActive;
    flowStore.handleNodeSelection(canvasNode.id, false);
    lowDetail.updateSelectedNodeIds(flowStore.nodes.flatMap(node => (node.selected ? [node.id] : [])));
    lowDetail.syncSelectionMode(useCanvasLowDetailOverlay, flowStore);
    event.preventDefault();
    event.stopPropagation();
  }

  function commitConnection(connection: {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }) {
    const conflictingEdges = collectConflictingEdges(connection, workspace);
    if (conflictingEdges.length > 0) {
      workspace.removeEdgesByIds(conflictingEdges.map(edge => edge.id));
    }
    workspace.addEdges([connection]);
  }

  // # Svelte Flow Events
  const svelteFlowEvents: SvelteFlowProps<FlowNode, FlowEdge> = {
    // ## On Connect
    onconnect: connection => {
      if (!connection.source || !connection.sourceHandle || !connection.target || !connection.targetHandle) {
        connectionPreview.cancel();
        return;
      }
      commitConnection({
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      });
      connectionPreview.commit();
      workspace.applyDocumentState("element-list-changed");
    },
    // ## On Connect Start
    onconnectstart: (pointerEvent, { nodeId, handleId, handleType }) => {
      if (handleType === "source") {
        connectionPreview.beginSourceDrag(nodeId!, handleId!);
        return;
      }

      connectionPreview.beginTargetDrag(nodeId!, handleId!);
    },
    // ## On Connect End
    onconnectend: (event, connectionState) => {
      const dropClientPosition = getEventClientPosition(event);

      if (connectionState.toNode === null && connectionPreview.pendingSourceConnection) {
        connectionPreview.previewFixedConflicts();
        const sourcePin = getOutputPin(
          connectionPreview.pendingSourceConnection.source,
          connectionPreview.pendingSourceConnection.sourceHandle,
          workspace,
        );
        if (!dropClientPosition) {
          connectionPreview.cancel();
          return;
        }
        addMenuInstance = {
          viewportPosition: toFlowWrapperPosition(dropClientPosition),
          spawnPosition: screenToFlowPosition(dropClientPosition),
          connectionFilter: sourcePin
            ? {
                draggedFrom: "source",
                pinType: sourcePin.connectionType,
              }
            : undefined,
        };
      } else if (connectionState.toNode === null && connectionPreview.pendingTargetConnection) {
        connectionPreview.previewFixedConflicts();
        const targetPin = getInputPin(
          connectionPreview.pendingTargetConnection.target,
          connectionPreview.pendingTargetConnection.targetHandle,
          workspace,
        );
        if (!dropClientPosition) {
          connectionPreview.cancel();
          return;
        }
        addMenuInstance = {
          viewportPosition: toFlowWrapperPosition(dropClientPosition),
          spawnPosition: screenToFlowPosition(dropClientPosition),
          connectionFilter: targetPin
            ? {
                draggedFrom: "target",
                pinType: targetPin.connectionType,
              }
            : undefined,
        };
      } else {
        if (connectionState.isValid !== true) {
          connectionPreview.cancel();
        }
      }
    },
    // ## On Node Drag Stop
    onnodedragstop: event => {
      recalculateGroupParents(workspace);
      workspace.applyDocumentState("nodes-moved");
    },
    // ## On Node Context Menu
    onnodecontextmenu: ({ event: pointerEvent, node }) => {
      if (workspace.controlScheme === "mouse") {
        if (isSetRootNativeContextTarget(pointerEvent)) {
          return;
        }
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
        return;
      }

      // groups should open add menu on right click
      if (node.type === GROUP_NODE_TYPE) {
        const flowPosition = screenToFlowPosition({
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        });
        addMenuInstance = {
          viewportPosition: toFlowWrapperPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
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
      if (!useCanvasLowDetailOverlay) {
        return;
      }

      lowDetail.updateSelectedNodeIds(selectedNodes.map(node => node.id));
      lowDetail.syncSelectionMode(useCanvasLowDetailOverlay, flowStore);
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

      lowDetail.dragActive = true;
      lowDetail.draggedNodeIds = workspace.getEffectivelySelectedNodes().map(node => node.id);
      lowDetail.dragDelta = { x: 0, y: 0 };
      lowDetail.updateDragDelta(nodes, flowStore);
    },
    onselectiondrag: (_event, nodes) => {
      if (!useCanvasLowDetailOverlay || !lowDetail.dragActive || nodes.length === 0) {
        return;
      }

      lowDetail.updateDragDelta(nodes, flowStore);
    },
    onselectiondragstop: (_event, nodes) => {
      if (!useCanvasLowDetailOverlay) {
        return;
      }

      if (nodes.length > 0) {
        lowDetail.updateDragDelta(nodes, flowStore);
      }
      lowDetail.dragActive = false;
      lowDetail.draggedNodeIds = [];
      lowDetail.dragDelta = { x: 0, y: 0 };
    },
    // ## On Pane Context Menu (right click)
    onpanecontextmenu: ({ event }) => {
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addMenuInstance = {
        viewportPosition: toFlowWrapperPosition({ x: event.clientX, y: event.clientY }),
        spawnPosition: flowPosition,
      };
      event.preventDefault();
    },
    ondelete: ({ nodes, edges }) => {
      if (nodes.some(node => node.id === workspace.rootNodeId)) {
        workspace.rootNodeId = undefined;
      }
      workspace.applyDocumentState("element-list-changed");
    },
  };

  // # Add Menu Events
  const addMenuEvents: Partial<AddMenuProps> = {
    // ## On Add Menu Cancel
    oncancel: () => {
      connectionPreview.cancel();
      addMenuInstance = undefined;
    },

    // ## On Template Selection (create new node)
    onselection: template => {
      const menuInstance = addMenuInstance;
      if (!menuInstance) {
        return;
      }

      const isCreatingRootNode = !workspace.getRootNode();
      const newNode: FlowNode = {
        ...createNodeFromTemplate(template, menuInstance.spawnPosition),
      };
      workspace.nodes = [...workspace.nodes, newNode];
      workspace.trackMeasurementForNodeIds([newNode.id]);
      let didCreateReplacementConnection = false;
      if (isCreatingRootNode) {
        workspace.rootNodeId = newNode.id;
      } else if (connectionPreview.pendingSourceConnection) {
        const targetHandle = menuInstance.connectionFilter
          ? getCompatibleInputHandleId(
              newNode.data,
              menuInstance.connectionFilter.pinType,
              workspace.context.connectionTypesById,
            )
          : undefined;
        if (targetHandle) {
          commitConnection({
            ...connectionPreview.pendingSourceConnection,
            target: newNode.id,
            targetHandle,
          });
          didCreateReplacementConnection = true;
        }
      } else if (connectionPreview.pendingTargetConnection) {
        const sourceHandle = menuInstance.connectionFilter
          ? getCompatibleOutputHandleId(
              newNode.data,
              menuInstance.connectionFilter.pinType,
              workspace.context.connectionTypesById,
            )
          : undefined;
        if (sourceHandle) {
          commitConnection({
            source: newNode.id,
            sourceHandle,
            target: connectionPreview.pendingTargetConnection.target,
            targetHandle: connectionPreview.pendingTargetConnection.targetHandle,
          });
          didCreateReplacementConnection = true;
        }
      }
      if (didCreateReplacementConnection) {
        connectionPreview.commit();
      } else {
        connectionPreview.cancel();
      }

      // this is to recalculate group parents - we can't do it immediately because the node does not yet have dimensions
      workspace.actionRequests.push({ type: "document-refresh" });
      addMenuInstance = undefined;
      workspace.applyDocumentState("element-list-changed");
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
  onpointerdowncapture={windowEvents.onpointerdowncapture}
  onpointerdown={windowEvents.onpointerdown}
  onpointerup={windowEvents.onpointerup}
  onblur={windowEvents.onblur}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative w-full h-full overflow-hidden"
  onmousedowncapture={handleFlowWrapperMouseDownCapture}
  onpointerdowncapture={handleFlowWrapperPointerDownCapture}
  onpointerupcapture={handleFlowWrapperPointerUpCapture}
  onclickcapture={handleFlowWrapperClickCapture}
  oncontextmenu={handleFlowWrapperContextMenu}
  bind:this={flowWrapperElement}
>
  <SvelteFlow
    bind:nodes
    bind:edges
    {initialViewport}
    {nodeTypes}
    noPanClass={workspace.controlScheme === "mouse" ? MOUSE_MODE_NO_PAN_CLASS : "nopan"}
    disableKeyboardA11y={!!addMenuInstance || !!searchMenuInstance || helpMenuOpen}
    deleteKey={["Delete", "Backspace"]}
    selectionKey={null}
    selectionMode={SelectionMode.Partial}
    selectNodesOnDrag={false}
    zIndexMode={"auto"}
    panOnDrag={workspace.controlScheme === "mouse" ? [2] : false}
    panOnScroll={workspace.controlScheme === "trackpad"}
    multiSelectionKey={MULTISELECT_KEY}
    selectionOnDrag={true}
    panActivationKey={null}
    minZoom={MIN_FLOW_ZOOM}
    onlyRenderVisibleElements={useVisibleElementCulling}
    connectionRadius={CONNECTION_RADIUS}
    isValidConnection={connection => {
      return isValidConnection(connection, workspace);
    }}
    {...svelteFlowEvents}
  >
    <Background bgColor={"var(--vscode-editor-background)"} />
    {#if useCanvasLowDetailOverlay}
      <LowDetailNodeCanvasOverlay
        active
        items={lowDetail.renderCache}
        edges={lowDetail.edgeRenderCache}
        selectedNodeIds={lowDetail.selectedNodeIds}
        draggedNodeIds={lowDetail.draggedNodeIds}
        dragDelta={lowDetail.dragDelta}
        dragging={lowDetail.dragActive}
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
          const previewTransitionToken = lowDetail.beginSearchPreviewTransition();
          const viewportChange = setViewport(searchMenuInstance!.initialViewport, { duration: 250 });
          searchMenuInstance = undefined;
          lowDetail.unlockSearchCache();
          lowDetail.endSearchPreviewTransitionAfter(viewportChange, previewTransitionToken);
        }}
        onselection={(node, inputId) => {
          workspace.actionRequests.push({ type: "reveal-node", nodeId: node.id });
          if (node.type !== GROUP_NODE_TYPE) {
            workspace.selectNode(node.id, "replace");
          }
          searchMenuInstance = undefined;
          lowDetail.resetSearchPreviewState();

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

  {#if isRootNodeMissing}
    <div
      class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 text-center text-sm font-medium text-vsc-muted"
    >
      No root is set. Right click to add the root node.
    </div>
  {/if}

  {#if addMenuInstance}
    {@const { viewportPosition, connectionFilter } = addMenuInstance}
    <AddNodeMenu
      {connectionFilter}
      {viewportPosition}
      viewportSize={getViewportSize()}
      {...addMenuEvents}
    />
  {/if}

  {#if helpMenuOpen}
    <NodeHelpPanel onclose={() => (helpMenuOpen = false)} />
  {/if}
</div>
