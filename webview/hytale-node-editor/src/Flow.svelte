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

  import { type NodeTemplate } from "@shared/node-editor/workspaceTypes";
  import AddNodeMenu from "src/components/AddNodeMenu.svelte";
  import NodeEditorActionMenu from "src/components/NodeEditorActionMenu.svelte";
  import NodeHelpPanel from "src/components/NodeHelpPanel.svelte";
  import NodeSearchPanel from "src/components/NodeSearchPanel.svelte";
  import { getAutoPositionedMappings } from "src/node-editor/layout/autoLayout";
  import { createNodeId } from "src/node-editor/utils/idUtils";
  import {
    getAbsoluteCenterPosition,
    pruneConflictingEdges,
    recalculateGroupParents,
    resolveInitialFitNodeIds,
  } from "src/node-editor/utils/nodeUtils.svelte";
  import { applyDocumentState, workspace } from "src/workspace.svelte";
  import type {
    CommentNodeType,
    DataNodeType,
    FlowEdge,
    FlowNode,
    GroupNodeType,
    LinkNodeType,
    RawJsonNodeType,
  } from "./common";
  import {
    COMMENT_NODE_TYPE,
    COMMENT_TEMPLATE_ID,
    DATA_NODE_TYPE,
    DEFAULT_COMMENT_FONT_SIZE,
    DEFAULT_COMMENT_HEIGHT,
    DEFAULT_COMMENT_WIDTH,
    DEFAULT_GROUP_HEIGHT,
    DEFAULT_GROUP_WIDTH,
    DEFAULT_RAW_JSON_TEXT,
    GROUP_NODE_TYPE,
    GROUP_TEMPLATE_ID,
    INPUT_HANDLE_ID,
    LINK_NODE_TYPE,
    LINK_TEMPLATE_ID,
    RAW_JSON_NODE_TYPE,
    RAW_JSON_TEMPLATE_ID,
  } from "./common";
  import {
    isDebugSchemaKeyShortcut,
    isDeleteOrBackspace,
    isShortcutBlockedByEditableTarget,
  } from "./node-editor/ui/flowKeyboard";
  import {
    getNodeEditorQuickActionByEventName,
    getNodeEditorQuickActionById,
    type NodeEditorQuickActionId,
  } from "./node-editor/ui/nodeEditorQuickActions";
  import CommentNode from "./nodes/CommentNode.svelte";
  import DataNode from "./nodes/DataNode.svelte";
  import GroupNode from "./nodes/GroupNode.svelte";
  import LinkNode from "./nodes/LinkNode.svelte";
  import RawJsonNode from "./nodes/RawJsonNode.svelte";

  let {
    nodes = $bindable([]),
    edges = $bindable([]),
    loadVersion = 0,
    quickActionRequest = undefined,
    revealNodeId = undefined,
    revealNodeRequestVersion = 0,
    onviewrawjson,
    oncustomizekeybinds,
  }: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    loadVersion?: number;
    quickActionRequest?: {
      token: number;
      actionId: NodeEditorQuickActionId;
      commandId: string;
    };
    revealNodeId?: string;
    revealNodeRequestVersion?: number;
    onviewrawjson?: () => void;
    oncustomizekeybinds?: () => void;
  } = $props();

  const ROOT_NODE_ID = "Node-00000000-0000-0000-0000-000000000000";
  const INITIAL_FIT_ROOT_DISTANCE_LIMIT = 6500;
  const MIN_FLOW_ZOOM = 0;
  const SEARCH_NODE_FOCUS_DURATION_MS = 100;
  const SEARCH_NODE_FOCUS_ZOOM = 0.9;
  const GROUP_Z_INDEX_UNSELECTED = -10000;
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;

  const nodeTypes = {
    [COMMENT_NODE_TYPE]: CommentNode,
    [DATA_NODE_TYPE]: DataNode,
    [GROUP_NODE_TYPE]: GroupNode,
    [LINK_NODE_TYPE]: LinkNode,
    [RAW_JSON_NODE_TYPE]: RawJsonNode,
  } as Record<string, Component>;

  const {
    fitView,
    screenToFlowPosition,
    setCenter: setViewportCenter,
    setViewport,
  } = useSvelteFlow();

  interface PendingConnection {
    source: string;
    sourceHandle: string;
  }

  interface PendingSingleSourceReplacement {
    sourceNodeId: string;
    sourceHandleId: string | undefined;
    removedEdges: FlowEdge[];
  }

  let lastHandledLoadVersion = -1;
  let flowWrapperElement: HTMLDivElement | undefined = undefined;

  let addMenuOpen = $state(false);
  let addMenuOpenVersion = $state(0); // Used to trigger re-focusing when menu is re-opened.
  let addMenuPosition: XYPosition = $state({ x: 0, y: 0 });
  let pendingNodePosition: XYPosition = { x: 0, y: 0 };
  let pendingConnection: PendingConnection | undefined;
  let hasAppliedInitialFit = false;
  let initialFitInProgress = false;
  let initialViewportReady = false;
  let pendingSourceReplacement: PendingSingleSourceReplacement | undefined;
  let nodeSearchOpen = $state(false);
  let nodeSearchOpenVersion = $state(0);
  let nodeSearchInitialViewport = undefined;
  let nodeSearchLastPreviewedNodeId = undefined;
  let nodeHelpOpen = $state(false);
  let nodeHelpOpenVersion = $state(0);
  let nodeSearchGroups = [];
  let lastHandledQuickActionRequestToken = -1;
  let lastPointerClientPosition = $state<XYPosition>();
  let pendingRestoredSessionState = undefined;
  let regroupingQueued = $state(true);
  let lastRevealNodeRequestVersion = -1;

  $effect(() => {
    if (regroupingQueued && workspace.getRootNode().measured) {
      recalculateGroupParents();
      regroupingQueued = false;
    }
  });

  $effect(() => {
    if (loadVersion !== lastHandledLoadVersion) {
      lastHandledLoadVersion = loadVersion;
      regroupingQueued = true;
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
      if (!isShortcutBlockedByEditableTarget()) {
        handleQuickActionById(quickActionRequest?.actionId);
      }
    }
  });

  $effect(() => {
    if (!hasAppliedInitialFit && loadVersion > 0 && !pendingRestoredSessionState) {
      void applyInitialFitOnce();
    }
  });

  const handleConnect: OnConnect = connection => {
    pruneConflictingEdges(connection);
    edges = addEdge(connection, edges);
    clearPendingSingleSourceReplacement();
    applyDocumentState("edge-created");
  };

  function handleNodeDragStop() {
    recalculateGroupParents();
    applyDocumentState("node-moved");
  }

  function handleQuickActionMenuEvent(event: Event) {
    const quickAction = getNodeEditorQuickActionByEventName(event.type);
    if (!quickAction) {
      return;
    }

    handleQuickActionById(quickAction.id);
  }

  function handleQuickActionById(actionIdCandidate: NodeEditorQuickActionId | undefined) {
    const quickAction = getNodeEditorQuickActionById(actionIdCandidate);
    if (!quickAction) {
      return;
    }

    switch (quickAction.id) {
      case "go-to-root":
        handleQuickActionGoToRoot();
        return;
      case "fit-full-view":
        handleQuickActionFitFullView();
        return;
      case "search-nodes":
        handleQuickActionSearchNodes();
        return;
      case "auto-position-nodes":
        handleQuickActionAutoPositionNodes();
        return;
      case "view-raw-json":
        handleQuickActionViewRawJson();
        return;
      case "help-and-hotkeys":
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
    const root = workspace.getRootNode();
    const targetX = root.position.x + root.width;
    const targetY = root.position.y + root.height / 2;

    void setViewportCenter(targetX, targetY, {
      zoom: 1.2,
      duration: 250,
    });
  }

  function handleQuickActionSearchNodes() {
    openNodeSearchMenu();
  }

  function handleQuickActionAutoPositionNodes() {
    let targetNodes = workspace.getEffectivelySelectedNodes();

    // autolayout the root tree if no other selection was made
    if (targetNodes.length === 0) {
      targetNodes = [workspace.getRootNode()];
    }

    const nodePositionMappings = getAutoPositionedMappings(targetNodes);

    workspace.nodes = nodes.map(node => {
      const nodeId = node.id;
      const absolutePosition = nodePositionMappings.get(nodeId);
      if (!absolutePosition) {
        return node;
      }
      return {
        ...node,
        parentId: undefined,
        position: absolutePosition,
      };
    });
    recalculateGroupParents();

    applyDocumentState("auto-layout-applied");
  }

  function handleQuickActionViewRawJson() {
    onviewrawjson();
  }

  function handleQuickActionHelpAndHotkeys() {
    if (nodeHelpOpen) {
      nodeHelpOpen = false;
      return;
    }

    openNodeHelpMenu();
  }

  function handleWindowKeyDown(event: KeyboardEvent) {
    if (isDebugSchemaKeyShortcut(event)) {
      if (isShortcutBlockedByEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      logDebugInfo();
      return;
    }

    if (!nodeHelpOpen || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    nodeHelpOpen = false;
  }

  function logDebugInfo() {
    const selectedNodes = nodes.filter(node => node.selected);
    console.log("workspace", workspace);
    for (const node of selectedNodes) {
      console.log(node);
    }
  }

  function handleWindowKeyUp(event: KeyboardEvent) {
    if (!isDeleteOrBackspace(event) || isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }

    queueMicrotask(() => applyDocumentState("elements-deleted"));
  }

  function handleWindowCopy(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    // TODO implement

    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowCut(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    // TODO implement

    clearPendingSingleSourceReplacement();
    applyDocumentState("nodes-cut");
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowPaste(event: ClipboardEvent) {
    // TODO implement
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }

    const pasteAnchor = resolvePasteAnchorFlowPosition();
    if (!pasteAnchor) {
      return;
    }

    applyDocumentState("nodes-pasted");
    event.preventDefault();
    event.stopPropagation();
  }

  function closeAddNodeMenu() {
    addMenuOpen = false;
    pendingConnection = undefined;
    restorePendingSingleSourceReplacement();
  }

  function openNodeSearchMenu() {
    closeAddNodeMenu();
    if (nodeHelpOpen) {
      nodeHelpOpen = false;
    }
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

  function openNodeHelpMenu() {
    closeAddNodeMenu();
    closeNodeSearchMenu({ restoreViewport: false });
    nodeHelpOpen = true;
    nodeHelpOpenVersion += 1;
  }

  function handleNodeHelpCloseRequest() {
    if (nodeHelpOpen) {
      nodeHelpOpen = false;
    }
  }

  function handleNodeHelpCustomizeKeybindsRequest() {
    if (nodeHelpOpen) {
      nodeHelpOpen = false;
    }
    oncustomizekeybinds();
  }

  function handleNodeSearchSelect(event: CustomEvent<{ nodeId: string }>) {
    const nodeId = event.detail?.nodeId;
    if (!nodeId) {
      return;
    }

    nodeSearchLastPreviewedNodeId = nodeId;
    centerViewportOnNode(nodeId);
    workspace.selectNode(nodeId, "replace");
    closeNodeSearchMenu({ restoreViewport: false });
  }

  function centerViewportOnNode(nodeId) {
    const targetNode = workspace.getNodeById(nodeId);
    if (!targetNode) {
      return false;
    }

    const { x: targetX, y: targetY } = getAbsoluteCenterPosition(targetNode);

    void setViewportCenter(targetX, targetY, {
      zoom: SEARCH_NODE_FOCUS_ZOOM,
      duration: SEARCH_NODE_FOCUS_DURATION_MS,
    });
    return true;
  }

  async function revealNodeFromDocumentSelection(nodeId: string | undefined) {
    if (!nodeId) {
      return;
    }

    await tick();
    centerViewportOnNode(nodeId);
    workspace.selectNode(nodeId, "replace");
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

  function updateLastPointerClientPosition(event: PointerEvent) {
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

  function handleWindowPointerDown(event: PointerEvent) {
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
    if (nodeHelpOpen) {
      nodeHelpOpen = false;
    }
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

    startSourceReplacementPreview(sourceNodeId, sourceHandleId);
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

  function handleMenuSelect(template: NodeTemplate) {
    if (template.templateId === GROUP_TEMPLATE_ID) {
      const newGroupNode: GroupNodeType = {
        id: createNodeId("Group"),
        type: GROUP_NODE_TYPE,
        data: {
          name: "Group",
        },
        position: {
          ...pendingNodePosition,
        },
        width: DEFAULT_GROUP_WIDTH,
        height: DEFAULT_GROUP_HEIGHT,
        selected: false,
        draggable: false,
      };

      nodes = [newGroupNode, ...nodes];
      closeAddNodeMenu();
      applyDocumentState("group-created");
      return;
    }

    if (template.templateId === COMMENT_TEMPLATE_ID) {
      const newCommentNode: CommentNodeType = {
        id: createNodeId("Comment"),
        type: COMMENT_NODE_TYPE,
        data: {
          name: "Comment",
          text: "",
          fontSize: DEFAULT_COMMENT_FONT_SIZE,
        },
        position: {
          ...pendingNodePosition,
        },
        width: DEFAULT_COMMENT_WIDTH,
        height: DEFAULT_COMMENT_HEIGHT,
        selected: false,
      };

      nodes = [newCommentNode, ...nodes];
      closeAddNodeMenu();
      applyDocumentState("comment-created");
      return;
    }

    if (template.templateId === RAW_JSON_TEMPLATE_ID) {
      const newRawJsonNode: RawJsonNodeType = {
        id: createNodeId("Generic"),
        type: RAW_JSON_NODE_TYPE,
        data: {
          data: DEFAULT_RAW_JSON_TEXT,
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
          targetHandle: INPUT_HANDLE_ID,
        };

        pruneConflictingEdges(connection);
        workspace.edges = addEdge(connection, edges);

        clearPendingSingleSourceReplacement();
      }

      closeAddNodeMenu();
      applyDocumentState("raw-json-node-created");
      return;
    }

    if (template.templateId === LINK_TEMPLATE_ID) {
      const newLinkNode: LinkNodeType = {
        id: createNodeId(""), // original node editor creates links with blank types as the IDs for some reason
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
          targetHandle: INPUT_HANDLE_ID,
        };

        pruneConflictingEdges(connection);
        edges = addEdge(connection, edges);
        clearPendingSingleSourceReplacement();
      }

      closeAddNodeMenu();
      applyDocumentState("link-node-created");
      return;
    }

    const newNodeId = createNodeId(template.templateId);
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

      pruneConflictingEdges(connection);
      edges = addEdge(connection, edges);
      clearPendingSingleSourceReplacement();
    }

    closeAddNodeMenu();
    applyDocumentState("data-node-created");
  }

  const windowEvents = {
    onkeydowncapture: handleWindowKeyDown,
    oncopycapture: handleWindowCopy,
    oncutcapture: handleWindowCut,
    onpastecapture: handleWindowPaste,
    onpointermovecapture: (event: PointerEvent) => updateLastPointerClientPosition(event),
    onpointerdowncapture: handleWindowPointerDown,
    onkeyup: handleWindowKeyUp,
  };

  const svelteFlowEvents = {
    onconnect: handleConnect,
    onconnectstart: handleConnectStart,
    onconnectend: handleConnectEnd,
    onnodedragstop: handleNodeDragStop,
    onnodecontextmenu: handleNodeContextMenu,
    onpaneclick: handlePaneClick,
    onpanecontextmenu: handlePaneContextMenu,
  };

  const addNodeMenuEvents = {
    onclose: closeAddNodeMenu,
    onselect: handleMenuSelect,
  };

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

  /** Temporarily replaces conflicting edges and stores relevant state.  */
  function startSourceReplacementPreview(sourceNodeId: string, sourceHandleId: string) {
    clearPendingSingleSourceReplacement();

    if (!sourceNodeId) {
      return;
    }

    const removedEdges = pruneConflictingEdges({
      source: sourceNodeId,
      sourceHandle: sourceHandleId,
    });

    pendingSourceReplacement = {
      sourceNodeId,
      sourceHandleId,
      removedEdges,
    };
  }

  function restorePendingSingleSourceReplacement() {
    const removedEdges = pendingSourceReplacement?.removedEdges ?? [];
    if (removedEdges.length === 0) {
      pendingSourceReplacement = undefined;
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
    pendingSourceReplacement = undefined;
  }

  function clearPendingSingleSourceReplacement() {
    pendingSourceReplacement = undefined;
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

  async function applyInitialFitOnce() {
    if (hasAppliedInitialFit || initialFitInProgress) {
      return;
    }

    initialFitInProgress = true;
    await tick();

    const initialFitNodeIds = resolveInitialFitNodeIds({
      nodes,
      rootNodeId: workspace.rootNodeId,
      fallbackRootNodeId: ROOT_NODE_ID,
      distanceLimit: INITIAL_FIT_ROOT_DISTANCE_LIMIT,
    });
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
</script>

<svelte:window
  onkeydowncapture={windowEvents.onkeydowncapture}
  oncopycapture={windowEvents.oncopycapture}
  oncutcapture={windowEvents.oncutcapture}
  onpastecapture={windowEvents.onpastecapture}
  onpointermovecapture={windowEvents.onpointermovecapture}
  onpointerdowncapture={windowEvents.onpointerdowncapture}
  onkeyup={windowEvents.onkeyup}
/>

<div class="relative w-full h-full overflow-hidden" bind:this={flowWrapperElement}>
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    disableKeyboardA11y={addMenuOpen || nodeSearchOpen || nodeHelpOpen}
    deleteKey={["Delete", "Backspace"]}
    selectionMode={SelectionMode.Full}
    selectNodesOnDrag={false}
    zIndexMode={"auto"}
    panOnDrag={workspace.controlScheme === "mouse"}
    panOnScroll={workspace.controlScheme === "trackpad"}
    multiSelectionKey={"Shift"}
    selectionOnDrag={workspace.controlScheme === "trackpad"}
    panActivationKey={workspace.controlScheme === "mouse" ? "Shift" : undefined}
    minZoom={MIN_FLOW_ZOOM}
    {...svelteFlowEvents}
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
      on:close={() => closeNodeSearchMenu({ restoreViewport: true })}
      on:preview={event => {
        const nodeId = event.detail?.nodeId;
        if (!nodeId || nodeId === nodeSearchLastPreviewedNodeId) {
          return;
        }

        nodeSearchLastPreviewedNodeId = nodeId;
        centerViewportOnNode(nodeId);
      }}
      on:select={handleNodeSearchSelect}
    />
  </SvelteFlow>

  <AddNodeMenu
    open={addMenuOpen}
    openVersion={addMenuOpenVersion}
    position={addMenuPosition}
    {...addNodeMenuEvents}
  />

  <NodeHelpPanel
    open={nodeHelpOpen}
    openVersion={nodeHelpOpenVersion}
    on:close={handleNodeHelpCloseRequest}
    on:customizekeybinds={handleNodeHelpCustomizeKeybindsRequest}
  />
</div>
