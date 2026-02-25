<script lang="ts">
  import {
    addEdge,
    Background,
    type Connection,
    type OnConnect,
    type OnConnectEnd,
    SelectionMode,
    SvelteFlow,
    useSvelteFlow,
    type XYPosition,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { type Component, tick } from "svelte";

  import { type NodePin } from "@shared/node-editor/workspaceTypes";
  import type {
    CommentNodeType,
    DataNodeType,
    FlowEdge,
    FlowNode,
    GroupNodeType,
    LinkNodeType,
    RawJsonNodeType,
  } from "./node-editor/graph/graphTypes";
  import {
    COMMENT_NODE_TYPE,
    DATA_NODE_TYPE,
    GENERIC_ACTION_CREATE_COMMENT,
    GENERIC_ACTION_CREATE_GROUP,
    GENERIC_ACTION_CREATE_LINK,
    GENERIC_ACTION_CREATE_RAW_JSON,
    GENERIC_ADD_CATEGORY,
    GROUP_NODE_TYPE,
    INPUT_HANDLE_ID,
    LINK_INPUT_HANDLE_ID,
    LINK_NODE_TYPE,
    LINK_OUTPUT_HANDLE_ID,
    RAW_JSON_INPUT_HANDLE_ID,
    RAW_JSON_NODE_TYPE,
  } from "./node-editor/graph/graphTypes";
  import {
    collectRecursiveDescendantNodeIds,
    layoutDirectedGraphWithNodeSizes,
    readLayoutOriginFromPositions,
  } from "./node-editor/layout/autoLayout";
  import {
    getNodeEditorQuickActionByEventName,
    getNodeEditorQuickActionById,
    NODE_EDITOR_QUICK_ACTION_IDS,
  } from "./node-editor/ui/nodeEditorQuickActions";
  import {
    COMMENT_DEFAULT_FONT_SIZE,
    COMMENT_DEFAULT_HEIGHT,
    COMMENT_DEFAULT_NAME,
    COMMENT_DEFAULT_TEXT,
    COMMENT_DEFAULT_WIDTH,
  } from "./node-editor/utils/commentMetadata";
  import CommentNode from "./nodes/CommentNode.svelte";
  import DataNode from "./nodes/DataNode.svelte";
  import GroupNode from "./nodes/GroupNode.svelte";
  import LinkNode from "./nodes/LinkNode.svelte";
  import RawJsonNode from "./nodes/RawJsonNode.svelte";
  import { workspace } from "./workspaceState.svelte";
  import NodeEditorActionMenu from "src/components/NodeEditorActionMenu.svelte";
  import NodeSearchPanel from "src/components/NodeSearchPanel.svelte";
  import AddNodeMenu from "src/components/AddNodeMenu.svelte";
  import NodeHelpPanel from "src/components/NodeHelpPanel.svelte";

  let {
    nodes = $bindable([]),
    edges = $bindable([]),
    loadVersion = 0,
    quickActionRequest = undefined,
    revealNodeId = undefined,
    revealNodeRequestVersion = 0,
    onflowchange,
    onviewrawjson,
    oncustomizekeybinds,
  }: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    loadVersion?: number;
    quickActionRequest?: { token: number; actionId: string; commandId: string };
    revealNodeId?: string;
    revealNodeRequestVersion?: number;
    onflowchange?: (event: string, nodes: FlowNode[], edges: FlowEdge[]) => void;
    onviewrawjson?: () => void;
    oncustomizekeybinds?: () => void;
  } = $props();

  const ROOT_NODE_ID = "Node-00000000-0000-0000-0000-000000000000";
  const DEFAULT_GROUP_WIDTH = 520;
  const DEFAULT_GROUP_HEIGHT = 320;
  const DEFAULT_GROUP_NAME = "Group";
  const RAW_JSON_DEFAULT_DATA = "{\n\n}";
  const INITIAL_FIT_ROOT_DISTANCE_LIMIT = 6500;
  const MIN_FLOW_ZOOM = 0;
  const SEARCH_NODE_FOCUS_DURATION_MS = 100;
  const SEARCH_NODE_FOCUS_ZOOM = 0.9;
  const GROUP_Z_INDEX_UNSELECTED = -10000;
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;

  const GENERIC_ADD_MENU_ENTRIES = [
    {
      kind: "generic-action",
      actionId: GENERIC_ACTION_CREATE_GROUP,
      category: GENERIC_ADD_CATEGORY,
      label: "Create New Group",
      nodeColor: "var(--vscode-focusBorder)",
    },
    {
      kind: "generic-action",
      actionId: GENERIC_ACTION_CREATE_COMMENT,
      category: GENERIC_ADD_CATEGORY,
      label: "Create New Comment",
      nodeColor: "var(--vscode-descriptionForeground)",
    },
    {
      kind: "generic-action",
      actionId: GENERIC_ACTION_CREATE_RAW_JSON,
      category: GENERIC_ADD_CATEGORY,
      label: "Raw JSON Node",
      nodeColor: "var(--vscode-focusBorder)",
    },
    {
      kind: "generic-action",
      actionId: GENERIC_ACTION_CREATE_LINK,
      category: GENERIC_ADD_CATEGORY,
      label: "Link",
      nodeColor: "var(--vscode-descriptionForeground)",
    },
  ];

  const nodeTypes = {
    [COMMENT_NODE_TYPE]: CommentNode,
    [DATA_NODE_TYPE]: DataNode,
    [GROUP_NODE_TYPE]: GroupNode,
    [LINK_NODE_TYPE]: LinkNode,
    [RAW_JSON_NODE_TYPE]: RawJsonNode,
  } as Record<string, Component>;

  const { fitView, getViewport, screenToFlowPosition, setCenter, setViewport } = useSvelteFlow();

  interface PendingConnection {
    source: string;
    sourceHandle: string;
  }

  let lastHandledLoadVersion = -1;
  let flowWrapperElement: HTMLDivElement | undefined = undefined;

  let addMenuOpen = false;
  let addMenuOpenVersion = 0; // Used to trigger re-focusing when menu is re-opened.
  let addMenuPosition: XYPosition = { x: 0, y: 0 };
  let pendingNodePosition: XYPosition = { x: 0, y: 0 };
  let pendingConnection: PendingConnection | undefined;
  let hasAppliedInitialFit = false;
  let initialFitInProgress = false;
  let initialViewportReady = false;
  let pendingSingleSourceReplacement;
  let nodeSearchOpen = false;
  let nodeSearchOpenVersion = 0;
  let nodeSearchInitialViewport = undefined;
  let nodeSearchLastPreviewedNodeId = undefined;
  let nodeHelpOpen = false;
  let nodeHelpOpenVersion = 0;
  let nodeSearchGroups = [];
  let lastHandledQuickActionRequestToken = -1;
  let lastPointerClientPosition = undefined;
  let pendingRestoredSessionState = undefined;
  let lastRevealNodeRequestVersion = -1;

  $effect(() => {
    if (loadVersion !== lastHandledLoadVersion) {
      lastHandledLoadVersion = loadVersion;
      clearPendingSingleSourceReplacement();
    }
  });

  $effect(() => {
    if (revealNodeRequestVersion !== lastRevealNodeRequestVersion) {
      lastRevealNodeRequestVersion = revealNodeRequestVersion;
      if (loadVersion > 0) {
        void revealNodeFromDocumentSelection(revealNodeId);
      }
    }
  });

  $effect(() => {
    if (
      Number.isInteger(quickActionRequest?.token) &&
      quickActionRequest.token !== lastHandledQuickActionRequestToken
    ) {
      lastHandledQuickActionRequestToken = quickActionRequest.token;
      if (!isKeyboardShortcutBlockedByFocusedInput()) {
        handleQuickActionById(quickActionRequest?.actionId);
      }
    }
  });

  $effect(() => {
    if (!hasAppliedInitialFit && loadVersion > 0 && !pendingRestoredSessionState) {
      void applyInitialFitOnce();
    }
  });

  function emitFlowChange(reason) {
    onflowchange(reason, nodes, edges);
  }

  const handleConnect: OnConnect = connection => {
    edges = addEdge(connection, pruneConflictingInputEdges(edges, connection));
    clearPendingSingleSourceReplacement();
    emitFlowChange("edge-created");
  };

  function handleNodeDragStop() {
    emitFlowChange("node-moved");
  }

  function handleQuickActionMenuEvent(event) {
    const quickAction = getNodeEditorQuickActionByEventName(event?.type);
    if (!quickAction) {
      return;
    }

    handleQuickActionById(quickAction.id);
  }

  function handleQuickActionById(actionIdCandidate) {
    const quickAction = getNodeEditorQuickActionById(actionIdCandidate);
    if (!quickAction) {
      return;
    }

    switch (quickAction.id) {
      case NODE_EDITOR_QUICK_ACTION_IDS.GO_TO_ROOT:
        handleQuickActionGoToRoot();
        return;
      case NODE_EDITOR_QUICK_ACTION_IDS.FIT_FULL_VIEW:
        handleQuickActionFitFullView();
        return;
      case NODE_EDITOR_QUICK_ACTION_IDS.SEARCH_NODES:
        handleQuickActionSearchNodes();
        return;
      case NODE_EDITOR_QUICK_ACTION_IDS.AUTO_POSITION_NODES:
        handleQuickActionAutoPositionNodes();
        return;
      case NODE_EDITOR_QUICK_ACTION_IDS.VIEW_RAW_JSON:
        handleQuickActionViewRawJson();
        return;
      case NODE_EDITOR_QUICK_ACTION_IDS.HELP_AND_HOTKEYS:
        handleQuickActionHelpAndHotkeys();
        return;
      default:
        return;
    }
  }

  function handleQuickActionFitFullView() {
    void fitView({
      padding: 0.2,
      minZoom: MIN_FLOW_ZOOM,
      duration: 250,
    });
  }

  function handleQuickActionGoToRoot() {
    const root = findNodeById(workspace.state.rootNodeId);
    const targetX = root.position.x + root.width;
    const targetY = root.position.y + root.height / 2;

    void setCenter(targetX, targetY, {
      zoom: 1.2,
      duration: 250,
    });
  }

  function handleQuickActionSearchNodes() {
    openNodeSearchMenu();
  }

  function handleQuickActionAutoPositionNodes() {
    const autoLayoutSeedNodeIds = resolveAutoLayoutSeedNodeIds();
    const nodeIds = nodes.map(nodeCandidate => nodeCandidate.id);
    const targetNodeIds = collectRecursiveDescendantNodeIds({
      seedNodeIds: autoLayoutSeedNodeIds,
      edges,
      allowedNodeIds: nodeIds,
    });
    if (targetNodeIds.length === 0) {
      console.info("[node-editor] Quick action could not resolve nodes for auto-layout.");
      return;
    }

    const targetNodeIdSet = new Set(targetNodeIds);
    const targetNodesById = new Map();
    const absolutePositionByNodeId = new Map();
    for (const targetNodeId of targetNodeIds) {
      const targetNode = findNodeById(targetNodeId);
      if (!targetNode) {
        continue;
      }

      const absolutePosition = readAbsoluteNodePosition(targetNode);
      if (!absolutePosition) {
        continue;
      }

      targetNodesById.set(targetNodeId, targetNode);
      absolutePositionByNodeId.set(targetNodeId, absolutePosition);
    }

    if (targetNodesById.size === 0 || absolutePositionByNodeId.size === 0) {
      return;
    }

    const layoutOrigin = readLayoutOriginFromPositions(
      Array.from(absolutePositionByNodeId.values()),
    );
    const layoutEdges = edges.filter(
      edge =>
        edge.source &&
        edge.target &&
        targetNodeIdSet.has(edge.source) &&
        targetNodeIdSet.has(edge.target),
    );
    const layoutNodes = Array.from(targetNodesById.entries()).map(([nodeId, nodeCandidate]) => {
      const nodeDimensions = readNodeDimensions(nodeCandidate);
      return {
        id: nodeId,
        width: nodeDimensions?.width,
        height: nodeDimensions?.height,
      };
    });
    const layoutedPositionByNodeId = layoutDirectedGraphWithNodeSizes({
      nodes: layoutNodes,
      edges: layoutEdges,
      spacing: {
        marginX: 0,
        marginY: 0,
      },
      origin: layoutOrigin,
    });

    let hasPositionUpdates = false;
    nodes = nodes.map(nodeCandidate => {
      const nodeId = nodeCandidate.id;
      if (!nodeId || !targetNodeIdSet.has(nodeId)) {
        return nodeCandidate;
      }

      const layoutedAbsolutePosition = layoutedPositionByNodeId.get(nodeId);
      if (!layoutedAbsolutePosition) {
        return nodeCandidate;
      }

      const nextRelativePosition = convertAbsolutePositionToNodeSpace(
        nodeCandidate,
        layoutedAbsolutePosition,
      );
      if (!nextRelativePosition) {
        return nodeCandidate;
      }

      const currentPosition = readNodePosition(nodeCandidate);
      if (!currentPosition || areNodePositionsDifferent(currentPosition, nextRelativePosition)) {
        hasPositionUpdates = true;
        return {
          ...nodeCandidate,
          position: nextRelativePosition,
        };
      }

      return nodeCandidate;
    });

    if (hasPositionUpdates) {
      emitFlowChange("auto-layout-applied");
    }
  }

  function handleQuickActionViewRawJson() {
    onviewrawjson();
  }

  function handleQuickActionHelpAndHotkeys() {
    if (nodeHelpOpen) {
      closeNodeHelpMenu();
      return;
    }

    openNodeHelpMenu();
  }

  function handleMetadataMutation(event) {
    const mutationReason = event?.detail?.reason;
    emitFlowChange(mutationReason ?? "metadata-updated");
  }

  function handleWindowKeyDown(event) {
    if (isDebugSchemaKeyShortcut(event)) {
      if (isKeyboardShortcutBlockedByFocusedInput(event?.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      logDebugInfo();
      return;
    }

    if (!nodeHelpOpen || event?.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeNodeHelpMenu();
  }

  function isDebugSchemaKeyShortcut(event) {
    const key = event?.key?.toLowerCase();
    if (key !== "d") {
      return false;
    }

    const hasPrimaryModifier = Boolean(event?.metaKey || event?.ctrlKey);
    if (!hasPrimaryModifier) {
      return false;
    }

    return event?.altKey !== true && event?.shiftKey !== true;
  }

  function logDebugInfo() {
    const selectedNodes = nodes.filter(node => node.selected);
    console.log(workspace.context);
    console.log(workspace.state);
    for (const node of selectedNodes) {
      console.log(node);
    }
  }

  function handleWindowKeyUp(event) {
    if (!isDeleteKey(event) || isKeyboardShortcutBlockedByFocusedInput(event?.target)) {
      return;
    }

    queueMicrotask(() => emitFlowChange("elements-deleted"));
  }

  function handleWindowCopy(event) {
    if (isKeyboardShortcutBlockedByFocusedInput(event?.target)) {
      return;
    }
    // TODO implement

    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowCut(event) {
    if (isKeyboardShortcutBlockedByFocusedInput(event?.target)) {
      return;
    }
    // TODO implement

    clearPendingSingleSourceReplacement();
    emitFlowChange("nodes-cut");
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowPaste(event) {
    // TODO implement
    if (isKeyboardShortcutBlockedByFocusedInput(event?.target)) {
      return;
    }

    const pasteAnchor = resolvePasteAnchorFlowPosition();
    if (!pasteAnchor) {
      return;
    }

    emitFlowChange("nodes-pasted");
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowPointerMove(event) {
    updateLastPointerClientPosition(event);
  }

  function closeAddNodeMenu() {
    addMenuOpen = false;
    pendingConnection = undefined;
    restorePendingSingleSourceReplacement();
  }

  function openNodeSearchMenu() {
    closeAddNodeMenu();
    closeNodeHelpMenu();
    nodeSearchLastPreviewedNodeId = undefined;
    nodeSearchOpen = true;
    nodeSearchOpenVersion += 1;
  }

  function closeNodeSearchMenu({ restoreViewport = false } = {}) {
    if (!nodeSearchOpen) {
      return;
    }

    const initialViewport = nodeSearchInitialViewport;
    nodeSearchOpen = false;
    nodeSearchInitialViewport = undefined;
    nodeSearchLastPreviewedNodeId = undefined;

    if (restoreViewport) {
      void setViewport(initialViewport, {
        duration: 250,
      });
    }
  }

  function handleNodeSearchCloseRequest() {
    closeNodeSearchMenu({ restoreViewport: true });
  }

  function openNodeHelpMenu() {
    closeAddNodeMenu();
    closeNodeSearchMenu({ restoreViewport: false });
    nodeHelpOpen = true;
    nodeHelpOpenVersion += 1;
  }

  function closeNodeHelpMenu() {
    if (!nodeHelpOpen) {
      return;
    }

    nodeHelpOpen = false;
  }

  function handleNodeHelpCloseRequest() {
    closeNodeHelpMenu();
  }

  function handleNodeHelpCustomizeKeybindsRequest() {
    closeNodeHelpMenu();
    oncustomizekeybinds();
  }

  function handleNodeSearchPreview(event) {
    const nodeId = event?.detail?.nodeId;
    if (!nodeId || nodeId === nodeSearchLastPreviewedNodeId) {
      return;
    }

    nodeSearchLastPreviewedNodeId = nodeId;
    centerViewportOnNode(nodeId);
  }

  function handleNodeSearchSelect(event) {
    const nodeId = event?.detail?.nodeId;
    if (!nodeId) {
      return;
    }

    nodeSearchLastPreviewedNodeId = nodeId;
    centerViewportOnNode(nodeId);
    const didSelectionChange = selectOnlyNodeById(nodeId);
    closeNodeSearchMenu({ restoreViewport: false });
    if (didSelectionChange) {
      emitFlowChange("node-search-selected");
    }
  }

  function centerViewportOnNode(nodeId) {
    const targetNode = findNodeById(nodeId);
    const targetPosition = readAbsoluteNodePosition(targetNode);
    if (!targetPosition) {
      return false;
    }

    const targetDimensions = readNodeDimensions(targetNode);
    const targetX = targetPosition.x + (targetDimensions?.width ?? 0) / 2;
    const targetY = targetPosition.y + (targetDimensions?.height ?? 0) / 2;
    void setCenter(targetX, targetY, {
      zoom: SEARCH_NODE_FOCUS_ZOOM,
      duration: SEARCH_NODE_FOCUS_DURATION_MS,
    });
    return true;
  }

  function selectOnlyNodeById(nodeId) {
    if (!nodeId) {
      return false;
    }

    let hasSelectionChanges = false;
    nodes = nodes.map(nodeCandidate => {
      const candidateNodeId = nodeCandidate.id;
      const shouldSelect = candidateNodeId === nodeId;
      if (Boolean(nodeCandidate.selected) === shouldSelect) {
        return nodeCandidate;
      }

      hasSelectionChanges = true;
      return {
        ...nodeCandidate,
        selected: shouldSelect,
      };
    });

    edges = edges.map(edgeCandidate => {
      if (edgeCandidate.selected !== true) {
        return edgeCandidate;
      }

      hasSelectionChanges = true;
      return {
        ...edgeCandidate,
        selected: false,
      };
    });

    return hasSelectionChanges;
  }

  async function revealNodeFromDocumentSelection(nodeId) {
    if (!nodeId) {
      return;
    }

    await tick();
    const didCenterViewport = centerViewportOnNode(nodeId);
    const didSelectionChange = selectOnlyNodeById(nodeId);
    if (didSelectionChange) {
      emitFlowChange("document-selection-revealed");
      return;
    }
  }

  function didEventOccurInsideAddMenu(event) {
    if (typeof event?.composedPath !== "function") {
      return false;
    }

    return event.composedPath().some(target => {
      if (typeof target?.getAttribute !== "function") {
        return false;
      }

      return target.getAttribute("data-add-node-menu") === "true";
    });
  }

  function didEventOccurInsideNodeSearchMenu(event) {
    if (typeof event?.composedPath !== "function") {
      return false;
    }

    return event.composedPath().some(target => {
      if (typeof target?.getAttribute !== "function") {
        return false;
      }

      return target.getAttribute("data-node-search-menu") === "true";
    });
  }

  function updateLastPointerClientPosition(event) {
    if (!didEventOccurInsideFlowWrapper(event)) {
      return;
    }

    const { clientX, clientY } = event;
    lastPointerClientPosition = {
      x: clientX,
      y: clientY,
    };
  }

  function didEventOccurInsideFlowWrapper(event) {
    if (!flowWrapperElement) {
      return false;
    }

    if (typeof event?.composedPath === "function") {
      return event.composedPath().includes(flowWrapperElement);
    }

    if (!event?.target || typeof flowWrapperElement.contains !== "function") {
      return false;
    }

    return flowWrapperElement.contains(event.target);
  }

  function handleWindowPointerDown(event) {
    updateLastPointerClientPosition(event);

    if (addMenuOpen && !didEventOccurInsideAddMenu(event)) {
      closeAddNodeMenu();
    }

    if (nodeSearchOpen && !didEventOccurInsideNodeSearchMenu(event)) {
      closeNodeSearchMenu({ restoreViewport: true });
    }
  }

  function openAddNodeMenu(pointerEvent, sourceNodeId = undefined, sourceHandleId = undefined) {
    closeNodeSearchMenu({ restoreViewport: false });
    closeNodeHelpMenu();
    const addMenuRequest = createAddNodeMenuRequest(pointerEvent, sourceNodeId, sourceHandleId);
    if (!addMenuRequest) {
      return false;
    }

    addMenuPosition = addMenuRequest.position;
    pendingNodePosition = addMenuRequest.nodePosition;
    pendingConnection = addMenuRequest.connection;
    addMenuOpen = true;
    addMenuOpenVersion += 1;
    return true;
  }

  function handlePaneContextMenu(payload) {
    const pointerEvent = payload?.event;
    if (!pointerEvent) {
      return;
    }

    pointerEvent.preventDefault();
    openAddNodeMenu(pointerEvent);
  }

  function handleNodeContextMenu(payload) {
    const pointerEvent = payload?.event;
    const node = payload?.node;
    if (!pointerEvent || !node) {
      return;
    }

    const isGroupNode = node?.type === GROUP_NODE_TYPE;
    const isSelected = node?.selected === true;
    const isTitleBar = Boolean(
      typeof pointerEvent?.target?.closest === "function" &&
        pointerEvent.target.closest(".group-title-drag-handle"),
    );

    if (!isGroupNode || isSelected || isTitleBar) {
      return;
    }

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    openAddNodeMenu(pointerEvent);
  }

  const handlePaneClick = () => {
    closeAddNodeMenu();
  };

  function handleConnectStart(_pointerEvent, params) {
    const sourceNodeId = params?.nodeId;
    const sourceHandleId = params?.handleId;
    const handleType = params?.handleType;
    if (handleType && handleType !== "source") {
      clearPendingSingleSourceReplacement();
      return;
    }

    beginSingleSourceReplacementPreview(sourceNodeId, sourceHandleId);
  }

  const handleConnectEnd: OnConnectEnd = (event, connectionState) => {
    const addMenuOpened = openAddNodeMenu(
      event,
      connectionState.fromNode,
      connectionState.fromHandle,
    );
    if (!addMenuOpened) {
      restorePendingSingleSourceReplacement();
    }
  };

  function handleMenuSelect(event) {
    const entry = event?.detail?.template;
    if (!entry) {
      return;
    }

    if (isGenericGroupCreationEntry(entry)) {
      const newGroupNode: GroupNodeType = {
        id: `Group-${createUuid()}`,
        type: GROUP_NODE_TYPE,
        data: {
          name: DEFAULT_GROUP_NAME,
        },
        position: {
          ...pendingNodePosition,
        },
        width: DEFAULT_GROUP_WIDTH,
        height: DEFAULT_GROUP_HEIGHT,
        selected: false,
        draggable: false,
        zIndex: readGroupUnselectedZIndex(DEFAULT_GROUP_WIDTH, DEFAULT_GROUP_HEIGHT),
      };

      nodes = [newGroupNode, ...nodes];
      closeAddNodeMenu();
      emitFlowChange("group-created");
      return;
    }

    if (isGenericCommentCreationEntry(entry)) {
      const newCommentNode: CommentNodeType = {
        id: `Comment-${createUuid()}`,
        type: COMMENT_NODE_TYPE,
        data: {
          name: COMMENT_DEFAULT_NAME,
          text: COMMENT_DEFAULT_TEXT,
          fontSize: COMMENT_DEFAULT_FONT_SIZE,
        },
        position: {
          ...pendingNodePosition,
        },
        width: COMMENT_DEFAULT_WIDTH,
        height: COMMENT_DEFAULT_HEIGHT,
        selected: false,
      };

      nodes = [newCommentNode, ...nodes];
      closeAddNodeMenu();
      emitFlowChange("comment-created");
      return;
    }

    if (isGenericRawJsonCreationEntry(entry)) {
      const newRawJsonNode: RawJsonNodeType = {
        id: `Generic-${createUuid()}`,
        type: RAW_JSON_NODE_TYPE,
        data: {
          data: RAW_JSON_DEFAULT_DATA,
        },
        position: {
          ...pendingNodePosition,
        },
        origin: [0.5, 0],
      };

      nodes = [...nodes, newRawJsonNode];

      if (pendingConnection) {
        const connection: Connection = {
          ...pendingConnection,
          target: newRawJsonNode.id,
          targetHandle: RAW_JSON_INPUT_HANDLE_ID,
        };

        edges = addEdge(connection, pruneConflictingInputEdges(edges, connection));

        clearPendingSingleSourceReplacement();
      }

      closeAddNodeMenu();
      emitFlowChange("raw-json-node-created");
      return;
    }

    if (isGenericLinkCreationEntry(entry)) {
      const newLinkNode: LinkNodeType = {
        id: `Link-${createUuid()}`,
        type: LINK_NODE_TYPE,
        data: {},
        position: {
          ...pendingNodePosition,
        },
        origin: [0.5, 0.0],
      };

      nodes = [...nodes, newLinkNode];

      if (pendingConnection) {
        const connection: Connection = {
          ...pendingConnection,
          target: newLinkNode.id,
          targetHandle: LINK_INPUT_HANDLE_ID,
        };

        edges = addEdge(connection, pruneConflictingInputEdges(edges, connection));
        clearPendingSingleSourceReplacement();
      }

      closeAddNodeMenu();
      emitFlowChange("link-node-created");
      return;
    }

    const template = entry;

    const newNodeId = `${template}-${createUuid()}`;
    const newNode: DataNodeType = {
      id: newNodeId,
      type: DATA_NODE_TYPE,
      data: {
        ...template,
      },
      position: {
        ...pendingNodePosition,
      },
      origin: [0.5, 0.0],
    };

    nodes = [...nodes, newNode];

    if (pendingConnection) {
      const connection: Connection = {
        ...pendingConnection,
        target: newNodeId,
        targetHandle: INPUT_HANDLE_ID,
      };

      edges = addEdge(connection, pruneConflictingInputEdges(edges, connection));
      clearPendingSingleSourceReplacement();
    }

    closeAddNodeMenu();
    emitFlowChange("node-created");
  }

  function createAddNodeMenuRequest(pointerEvent, sourceNodeId, sourceHandleId) {
    const { clientX, clientY } = pointerEvent;
    const paneBounds = flowWrapperElement?.getBoundingClientRect?.();
    if (!paneBounds) {
      return undefined;
    }

    return {
      position: {
        x: clientX - paneBounds.left,
        y: clientY - paneBounds.top - 60,
      },
      nodePosition: screenToFlowPosition({
        x: clientX,
        y: clientY,
      }),
      connection: { source: sourceNodeId, sourceHandle: sourceHandleId } as PendingConnection,
    };
  }

  function pruneConflictingInputEdges(existingEdges, connection) {
    const targetNodeId = connection?.target;
    if (!targetNodeId) {
      return existingEdges;
    }

    const targetHandleId = connection?.targetHandle;

    return existingEdges.filter(edge => {
      if (edge.target !== targetNodeId) {
        return true;
      }

      if (targetHandleId) {
        return edge.targetHandle !== targetHandleId;
      }

      return false;
    });
  }

  function beginSingleSourceReplacementPreview(sourceNodeId, sourceHandleId) {
    clearPendingSingleSourceReplacement();

    if (!sourceNodeId) {
      return;
    }

    const sourceMultiplicity = readSourceHandleMultiplicity(sourceNodeId, sourceHandleId);
    if (sourceMultiplicity !== "single") {
      return;
    }

    const retainedEdges = [];
    const removedEdges = [];
    for (const edge of edges) {
      if (isEdgeFromSourceHandle(edge, sourceNodeId, sourceHandleId)) {
        removedEdges.push(edge);
        continue;
      }

      retainedEdges.push(edge);
    }

    if (removedEdges.length === 0) {
      return;
    }

    edges = retainedEdges;
    pendingSingleSourceReplacement = {
      sourceNodeId,
      sourceHandleId,
      removedEdges,
    };
  }

  function readSourceHandleMultiplicity(sourceNodeId, sourceHandleId) {
    const sourceNode = findNodeById(sourceNodeId);
    const outputPins: NodePin[] | undefined = (sourceNode.data as any).outputPins;
    const sourcePin = outputPins?.find(pin => pin.schemaKey === sourceHandleId);

    if (sourcePin?.isMap === true) {
      return "map";
    }

    if (sourcePin?.multiple === true) {
      return "multiple";
    }

    return "single";
  }

  function readOutputPinConnectionMultiplicity(pin) {
    if (pin?.isMap === true) {
      return "map";
    }

    if (pin?.multiple === true) {
      return "multiple";
    }

    return "single";
  }

  function findInputEdgeForLinkNode(linkNodeId) {
    if (!linkNodeId) {
      return undefined;
    }

    return edges.find(edge => edge.target === linkNodeId && isLinkInputHandleId(edge.targetHandle));
  }

  function isLinkInputHandleId(candidateHandleId) {
    return candidateHandleId == null || candidateHandleId === LINK_INPUT_HANDLE_ID;
  }

  function isLinkOutputHandleId(candidateHandleId) {
    return candidateHandleId == null || candidateHandleId === LINK_OUTPUT_HANDLE_ID;
  }

  function findNodeById(nodeId: string) {
    if (!nodeId) {
      return undefined;
    }
    return nodes.find(node => node.id === nodeId);
  }

  function findHandle(nodeId: string, handleId: string) {
    const node = findNodeById(nodeId);
    if (!node) {
      return undefined;
    }

    return node.handles.find(handle => handle.id === handleId);
  }

  function isEdgeFromSourceHandle(edge, sourceNodeId, sourceHandleId) {
    if (edge?.source !== sourceNodeId) {
      return false;
    }

    return edge?.sourceHandle === sourceHandleId;
  }

  function restorePendingSingleSourceReplacement() {
    const removedEdges = pendingSingleSourceReplacement?.removedEdges ?? [];
    if (removedEdges.length === 0) {
      pendingSingleSourceReplacement = undefined;
      return;
    }

    const currentEdges = edges;
    const existingEdgeIds = new Set(currentEdges.map(edge => edge.id).filter(Boolean));
    const restoredEdges = [];

    for (const removedEdge of removedEdges) {
      const edgeId = removedEdge.id;
      if (edgeId && existingEdgeIds.has(edgeId)) {
        continue;
      }

      if (edgeId) {
        existingEdgeIds.add(edgeId);
      }

      restoredEdges.push(removedEdge);
    }

    edges = [...currentEdges, ...restoredEdges];
    pendingSingleSourceReplacement = undefined;
  }

  function clearPendingSingleSourceReplacement() {
    pendingSingleSourceReplacement = undefined;
  }

  function readSourceConnectionDescriptor(sourceTemplate, sourceHandleId) {
    const sourceConnectionDescriptors = sourceTemplate?.schemaConnections ?? [];
    if (sourceConnectionDescriptors.length === 0) {
      return undefined;
    }

    let matchedDescriptor = sourceConnectionDescriptors.find(
      descriptor => descriptor?.outputPinId === sourceHandleId,
    );
    if (!matchedDescriptor && !sourceHandleId && sourceConnectionDescriptors.length === 1) {
      matchedDescriptor = sourceConnectionDescriptors[0];
    }

    return matchedDescriptor;
  }

  function findTemplateForNodeId(nodeId) {
    const node = nodes.find(node => node.id === nodeId);
    return node.data.templateId;
  }

  function resolvePasteAnchorFlowPosition() {
    if (
      Number.isFinite(lastPointerClientPosition?.x) &&
      Number.isFinite(lastPointerClientPosition?.y)
    ) {
      return screenToFlowPosition({
        x: lastPointerClientPosition.x,
        y: lastPointerClientPosition.y,
      });
    }

    const paneBounds = flowWrapperElement?.getBoundingClientRect?.();
    if (!paneBounds) {
      return undefined;
    }

    return screenToFlowPosition({
      x: paneBounds.left + paneBounds.width / 2,
      y: paneBounds.top + paneBounds.height / 2,
    });
  }

  function readNodeType(candidate) {
    if (typeof candidate === "string") {
      const cleaned = candidate.trim().replace(/\s+/g, "");
      if (cleaned) {
        return cleaned;
      }
    }

    return "Node";
  }

  function createUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }

  async function applyInitialFitOnce() {
    if (hasAppliedInitialFit || initialFitInProgress) {
      return;
    }

    initialFitInProgress = true;
    await tick();

    const initialFitNodeIds = resolveInitialFitNodeIds(nodes, workspace.state.rootNodeId);
    if (initialFitNodeIds.length > 0) {
      fitView({
        nodes: initialFitNodeIds,
        padding: 0.2,
        minZoom: MIN_FLOW_ZOOM,
        duration: 0,
      });
    }

    hasAppliedInitialFit = true;
    initialViewportReady = true;
    initialFitInProgress = false;
  }

  function resolveInitialFitNodeIds(nodesCandidate, rootNodeIdCandidate) {
    const nodeList = nodesCandidate;
    if (nodeList.length === 0) {
      return [];
    }

    const resolvedRootNodeId = rootNodeIdCandidate ?? ROOT_NODE_ID;
    const rootNode = nodeList.find(node => node.id === resolvedRootNodeId);
    if (!rootNode) {
      return [];
    }

    const rootPosition = readNodePosition(rootNode);
    if (!rootPosition) {
      return [];
    }

    const fitNodeIdSet = new Set([resolvedRootNodeId]);
    for (const node of nodeList) {
      const nodeId = node.id;
      const nodePosition = readNodePosition(node);
      if (!nodePosition) {
        continue;
      }

      const dx = nodePosition.x - rootPosition.x;
      const dy = nodePosition.y - rootPosition.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= INITIAL_FIT_ROOT_DISTANCE_LIMIT) {
        fitNodeIdSet.add(nodeId);
      }
    }

    return Array.from(fitNodeIdSet, nodeId => ({ id: nodeId }));
  }

  function readNodePosition(nodeCandidate) {
    const x = nodeCandidate?.position?.x;
    const y = nodeCandidate?.position?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return undefined;
    }

    return { x, y };
  }

  function readNodeDimensions(nodeCandidate) {
    const width = readFiniteDimension(
      nodeCandidate?.width,
      nodeCandidate?.initialWidth,
      nodeCandidate?.measured?.width,
    );
    const height = readFiniteDimension(
      nodeCandidate?.height,
      nodeCandidate?.initialHeight,
      nodeCandidate?.measured?.height,
    );

    return width === undefined && height === undefined
      ? undefined
      : { width: width ?? 0, height: height ?? 0 };
  }

  function readFiniteDimension(...candidates) {
    for (const candidate of candidates) {
      if (Number.isFinite(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  function readAbsoluteNodePosition(nodeCandidate, visitedNodeIds = new Set()) {
    const relativePosition = readNodePosition(nodeCandidate);
    if (!relativePosition) {
      return undefined;
    }

    const nodeId = nodeCandidate?.id;
    const parentNodeId = nodeCandidate?.parentId;
    if (!parentNodeId) {
      return relativePosition;
    }

    if (nodeId && visitedNodeIds.has(nodeId)) {
      return relativePosition;
    }

    const parentNode = findNodeById(parentNodeId);
    if (!parentNode) {
      return relativePosition;
    }

    const nextVisitedNodeIds = new Set(visitedNodeIds);
    if (nodeId) {
      nextVisitedNodeIds.add(nodeId);
    }
    const parentAbsolutePosition = readAbsoluteNodePosition(parentNode, nextVisitedNodeIds);
    if (!parentAbsolutePosition) {
      return relativePosition;
    }

    return {
      x: parentAbsolutePosition.x + relativePosition.x,
      y: parentAbsolutePosition.y + relativePosition.y,
    };
  }

  function resolveAutoLayoutSeedNodeIds() {
    const selectedNodeIds = nodes
      .filter(nodeCandidate => nodeCandidate?.selected === true)
      .map(nodeCandidate => nodeCandidate.id);

    if (selectedNodeIds.length > 0) {
      return Array.from(new Set(selectedNodeIds));
    }

    const rootNodeId = workspace.state?.rootNodeId;
    return rootNodeId ? [rootNodeId] : [];
  }

  function convertAbsolutePositionToNodeSpace(nodeCandidate, absolutePositionCandidate) {
    const absolutePosition = readNodePosition({ position: absolutePositionCandidate });
    if (!absolutePosition) {
      return undefined;
    }

    const parentNodeId = nodeCandidate?.parentId;
    if (!parentNodeId) {
      return absolutePosition;
    }

    const parentNode = findNodeById(parentNodeId);
    if (!parentNode) {
      return absolutePosition;
    }

    const parentAbsolutePosition = readAbsoluteNodePosition(parentNode);
    if (!parentAbsolutePosition) {
      return absolutePosition;
    }

    return {
      x: absolutePosition.x - parentAbsolutePosition.x,
      y: absolutePosition.y - parentAbsolutePosition.y,
    };
  }

  function areNodePositionsDifferent(leftPosition, rightPosition) {
    return (
      Math.abs(leftPosition.x - rightPosition.x) > 0.001 ||
      Math.abs(leftPosition.y - rightPosition.y) > 0.001
    );
  }

  function readGroupUnselectedZIndex(widthCandidate, heightCandidate) {
    const width = readGroupDimension(widthCandidate, DEFAULT_GROUP_WIDTH, MIN_GROUP_WIDTH);
    const height = readGroupDimension(heightCandidate, DEFAULT_GROUP_HEIGHT, MIN_GROUP_HEIGHT);
    const area = width * height;
    return GROUP_Z_INDEX_UNSELECTED - Math.round(area);
  }

  function readGroupDimension(candidateValue, fallbackValue, minValue) {
    const currentValue = Number(candidateValue);
    if (!Number.isFinite(currentValue)) {
      return fallbackValue;
    }

    return Math.max(minValue, currentValue);
  }

  function isGenericGroupCreationEntry(candidate) {
    return (
      candidate?.kind === "generic-action" && candidate?.actionId === GENERIC_ACTION_CREATE_GROUP
    );
  }

  function isGenericCommentCreationEntry(candidate) {
    return (
      candidate?.kind === "generic-action" && candidate?.actionId === GENERIC_ACTION_CREATE_COMMENT
    );
  }

  function isGenericRawJsonCreationEntry(candidate) {
    return (
      candidate?.kind === "generic-action" && candidate?.actionId === GENERIC_ACTION_CREATE_RAW_JSON
    );
  }

  function isGenericLinkCreationEntry(candidate) {
    return (
      candidate?.kind === "generic-action" && candidate?.actionId === GENERIC_ACTION_CREATE_LINK
    );
  }

  function isDeleteKey(event) {
    const key = event?.key;
    return key === "Delete" || key === "Backspace";
  }

  function isKeyboardShortcutBlockedByFocusedInput(eventTarget = undefined) {
    if (isEditableTarget(eventTarget)) {
      return true;
    }

    const activeElement = globalThis?.document?.activeElement;
    return isEditableTarget(activeElement);
  }

  function isEditableTarget(target) {
    if (!target || typeof target !== "object") {
      return false;
    }

    const tagName = typeof target?.tagName === "string" ? target.tagName.toLowerCase() : undefined;
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return true;
    }

    if (target?.isContentEditable === true) {
      return true;
    }

    const roleValue =
      typeof target?.getAttribute === "function" ? target.getAttribute("role") : undefined;
    const role = typeof roleValue === "string" ? roleValue.toLowerCase() : undefined;
    if (
      role === "textbox" ||
      role === "searchbox" ||
      role === "combobox" ||
      role === "spinbutton"
    ) {
      return true;
    }

    if (typeof target?.closest === "function") {
      const editableAncestor = target.closest(
        "input, textarea, select, [contenteditable], [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton']",
      );
      if (editableAncestor) {
        const contentEditableValue =
          typeof editableAncestor.getAttribute === "function"
            ? editableAncestor.getAttribute("contenteditable")
            : undefined;
        if (
          typeof contentEditableValue !== "string" ||
          contentEditableValue.toLowerCase() !== "false"
        ) {
          return true;
        }
      }
    }

    return false;
  }
</script>

<svelte:window
  on:keydown|capture={handleWindowKeyDown}
  on:copy|capture={handleWindowCopy}
  on:cut|capture={handleWindowCut}
  on:paste|capture={handleWindowPaste}
  on:pointermove|capture={handleWindowPointerMove}
  on:pointerdown|capture={handleWindowPointerDown}
  on:keyup={handleWindowKeyUp}
/>

<div
  class="relative w-full h-full overflow-hidden"
  bind:this={flowWrapperElement}
>
  <SvelteFlow
    bind:nodes
    bind:edges
    disableKeyboardA11y={addMenuOpen || nodeSearchOpen || nodeHelpOpen}
    selectionMode={SelectionMode.Full}
    multiSelectionKey={"Shift"}
    panActivationKey={"Shift"}
    selectNodesOnDrag={false}
    minZoom={MIN_FLOW_ZOOM}
    {nodeTypes}
    onconnect={handleConnect}
    onconnectstart={handleConnectStart}
    onconnectend={handleConnectEnd}
    onnodedragstop={handleNodeDragStop}
    onnodecontextmenu={handleNodeContextMenu}
    onpaneclick={handlePaneClick}
    onpanecontextmenu={handlePaneContextMenu}
  >
    <Background bgColor={"var(--vscode-editor-background)"} />
    <NodeEditorActionMenu
      on:gotoroot={handleQuickActionMenuEvent}
      on:fitfullview={handleQuickActionMenuEvent}
      on:searchnodes={handleQuickActionMenuEvent}
      on:autopositionnodes={handleQuickActionMenuEvent}
      on:viewrawjson={handleQuickActionMenuEvent}
      on:helphotkeys={handleQuickActionMenuEvent}
    />
    <NodeSearchPanel
      open={nodeSearchOpen}
      openVersion={nodeSearchOpenVersion}
      groups={nodeSearchGroups}
      on:close={handleNodeSearchCloseRequest}
      on:preview={handleNodeSearchPreview}
      on:select={handleNodeSearchSelect}
    />
  </SvelteFlow>

  <AddNodeMenu
    open={addMenuOpen}
    openVersion={addMenuOpenVersion}
    position={addMenuPosition}
    onclose={closeAddNodeMenu}
    onselect={handleMenuSelect}
  />

  <NodeHelpPanel
    open={nodeHelpOpen}
    openVersion={nodeHelpOpenVersion}
    on:close={handleNodeHelpCloseRequest}
    on:customizekeybinds={handleNodeHelpCustomizeKeybindsRequest}
  />
</div>
