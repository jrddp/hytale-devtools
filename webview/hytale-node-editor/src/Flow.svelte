<script>
  import {
    addEdge,
    Background,
    SvelteFlow,
    useSvelteFlow,
  } from "@xyflow/svelte";
  import { createEventDispatcher, tick } from "svelte";
  import "@xyflow/svelte/dist/style.css";

  import AddNodeMenu from "./components/AddNodeMenu.svelte";
  import NodeSearchPanel from "./components/NodeSearchPanel.svelte";
  import NodeHelpPanel from "./components/NodeHelpPanel.svelte";
  import NodeEditorActionMenu from "./components/NodeEditorActionMenu.svelte";
  import CommentMetadataNode from "./nodes/CommentMetadataNode.svelte";
  import CustomMetadataNode from "./nodes/CustomMetadataNode.svelte";
  import GroupMetadataNode from "./nodes/GroupMetadataNode.svelte";
  import LinkMetadataNode from "./nodes/LinkMetadataNode.svelte";
  import RawJsonMetadataNode from "./nodes/RawJsonMetadataNode.svelte";
  import {
    findTemplateByTypeName,
    getDefaultTemplate,
    getTemplateById,
    getTemplates,
    getTemplatesForNodeSelector,
    setActiveWorkspaceContext,
    setActiveTemplateSourceMode,
  } from "./node-editor/templateCatalog.js";
  import { chooseCompatibleInputHandleId } from "./node-editor/connectionSchemaMapper.js";
  import {
    COMMENT_DEFAULT_FONT_SIZE,
    COMMENT_DEFAULT_HEIGHT,
    COMMENT_DEFAULT_NAME,
    COMMENT_DEFAULT_TEXT,
    COMMENT_DEFAULT_WIDTH,
  } from "./node-editor/commentMetadata.js";
  import {
    collectRecursiveDescendantNodeIds,
    layoutDirectedGraphWithNodeSizes,
    readLayoutOriginFromPositions,
  } from "./node-editor/autoLayout.js";
  import { buildNodeSearchGroups } from "./node-editor/nodeSearch.js";
  import {
    COMMENT_NODE_TYPE,
    CUSTOM_NODE_TYPE,
    GENERIC_ACTION_CREATE_LINK,
    GENERIC_ACTION_CREATE_RAW_JSON,
    GENERIC_ACTION_CREATE_COMMENT,
    GENERIC_ACTION_CREATE_GROUP,
    GENERIC_ADD_CATEGORY,
    GROUP_NODE_TYPE,
    LINK_INPUT_HANDLE_ID,
    LINK_NODE_TYPE,
    LINK_OUTPUT_HANDLE_ID,
    RAW_JSON_INPUT_HANDLE_ID,
    RAW_JSON_NODE_TYPE,
  } from "./node-editor/types.js";
  import {
    NODE_EDITOR_QUICK_ACTION_IDS,
    getNodeEditorQuickActionByEventName,
    getNodeEditorQuickActionById,
  } from "./node-editor/nodeEditorQuickActions.ts";

  export let nodes = createDefaultNodes();
  export let edges = [];
  export let loadVersion = 0;
  export let templateSourceMode = "workspace-hg-java";
  export let workspaceContext = {};
  export let rootNodeId = undefined;
  export let quickActionRequest = undefined;

  const ROOT_NODE_ID = "Node-00000000-0000-0000-0000-000000000000";
  const DEFAULT_GROUP_WIDTH = 520;
  const DEFAULT_GROUP_HEIGHT = 320;
  const DEFAULT_GROUP_NAME = "Group";
  const RAW_JSON_DEFAULT_LABEL = "Raw JSON Node";
  const RAW_JSON_FIELD_ID = "Data";
  const RAW_JSON_DEFAULT_DATA = "{\n\n}";
  const INITIAL_FIT_ROOT_DISTANCE_LIMIT = 6500;
  const MIN_FLOW_ZOOM = 0;
  const SEARCH_NODE_FOCUS_DURATION_MS = 100;
  const SEARCH_NODE_FOCUS_ZOOM = 0.9;
  const GROUP_Z_INDEX_UNSELECTED = -10000;
  const MIN_GROUP_WIDTH = 180;
  const MIN_GROUP_HEIGHT = 120;
  const dispatch = createEventDispatcher();

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
    [COMMENT_NODE_TYPE]: CommentMetadataNode,
    [CUSTOM_NODE_TYPE]: CustomMetadataNode,
    [GROUP_NODE_TYPE]: GroupMetadataNode,
    [LINK_NODE_TYPE]: LinkMetadataNode,
    [RAW_JSON_NODE_TYPE]: RawJsonMetadataNode,
  };

  const { fitView, getViewport, screenToFlowPosition, setCenter, setViewport } = useSvelteFlow();

  let lastNormalizedLoadVersion = -1;
  let flowWrapperElement;

  let addMenuOpen = false;
  let addMenuOpenVersion = 0; // Used to trigger re-focusing when menu is re-opened.
  let addMenuPosition = { x: 0, y: 0 };
  let pendingNodePosition = { x: 0, y: 0 };
  let pendingConnection;
  let connectStartSourceNodeId;
  let connectStartSourceHandleId;
  let skipNextPaneClickClose = false;
  let hasAppliedInitialFit = false;
  let initialFitInProgress = false;
  let initialViewportReady = false;
  let allTemplates = [];
  let availableAddEntries = [];
  let pendingSingleSourceReplacement;
  let nodeSearchOpen = false;
  let nodeSearchOpenVersion = 0;
  let nodeSearchInitialViewport = undefined;
  let nodeSearchLastPreviewedNodeId = undefined;
  let nodeHelpOpen = false;
  let nodeHelpOpenVersion = 0;
  let nodeSearchGroups = [];
  let lastHandledQuickActionRequestToken = -1;

  $: {
    setActiveTemplateSourceMode(templateSourceMode);
    setActiveWorkspaceContext(workspaceContext);
    allTemplates = getTemplates(workspaceContext);
  }

  $: availableAddEntries = resolveAvailableAddEntries(pendingConnection);
  $: nodeSearchGroups = buildNodeSearchGroups({
    nodes,
    workspaceContext,
  });

  $: {
    const reconciledEdges = reconcileLinkOutputEdges(edges);
    if (!areEdgeListsEquivalent(edges, reconciledEdges)) {
      edges = reconciledEdges;
      clearPendingSingleSourceReplacement();
      emitFlowChange("link-output-incompatible-edges-pruned");
    }
  }

  $: if (loadVersion !== lastNormalizedLoadVersion) {
    lastNormalizedLoadVersion = loadVersion;
    clearPendingSingleSourceReplacement();
    ensureCustomNodeTypes();
  }

  $: if (!hasAppliedInitialFit && loadVersion > 0) {
    void applyInitialFitOnce();
  }

  $: if (
    Number.isInteger(quickActionRequest?.token) &&
    quickActionRequest.token !== lastHandledQuickActionRequestToken
  ) {
    lastHandledQuickActionRequestToken = quickActionRequest.token;
    if (!isKeyboardShortcutBlockedByFocusedInput()) {
      handleQuickActionById(quickActionRequest?.actionId);
    }
  }

  function emitFlowChange(reason) {
    dispatch("flowchange", {
      reason,
      nodes,
      edges,
    });
  }

  function ensureCustomNodeTypes() {
    const normalizedNodes = Array.isArray(nodes)
      ? nodes.map(node => normalizeNodeForRendering(node))
      : [];

    if (!areNodeListsEquivalent(nodes, normalizedNodes)) {
      nodes = normalizedNodes;
    }
  }

  function normalizeNodeForRendering(node) {
    return {
      ...node,
      type: typeof node?.type === "string" && node.type.trim() ? node.type : CUSTOM_NODE_TYPE,
      data: {
        ...(node?.data ?? {}),
      },
    };
  }

  function areNodeListsEquivalent(leftNodes, rightNodes) {
    if (
      !Array.isArray(leftNodes) ||
      !Array.isArray(rightNodes) ||
      leftNodes.length !== rightNodes.length
    ) {
      return false;
    }

    for (let index = 0; index < leftNodes.length; index += 1) {
      const left = leftNodes[index];
      const right = rightNodes[index];

      if (left?.id !== right?.id || left?.type !== right?.type) {
        return false;
      }

      if (!isObject(left?.data) || !isObject(right?.data)) {
        return false;
      }
    }

    return true;
  }

  function areEdgeListsEquivalent(leftEdges, rightEdges) {
    if (
      !Array.isArray(leftEdges) ||
      !Array.isArray(rightEdges) ||
      leftEdges.length !== rightEdges.length
    ) {
      return false;
    }

    for (let index = 0; index < leftEdges.length; index += 1) {
      const left = leftEdges[index];
      const right = rightEdges[index];
      if (
        normalizeOptionalString(left?.id) !== normalizeOptionalString(right?.id) ||
        normalizeOptionalString(left?.source) !== normalizeOptionalString(right?.source) ||
        normalizeOptionalString(left?.target) !== normalizeOptionalString(right?.target) ||
        normalizeOptionalString(left?.sourceHandle) !== normalizeOptionalString(right?.sourceHandle) ||
        normalizeOptionalString(left?.targetHandle) !== normalizeOptionalString(right?.targetHandle)
      ) {
        return false;
      }
    }

    return true;
  }

  function handleConnect(connection) {
    const normalizedConnection = normalizeConnection(connection);
    if (!normalizedConnection) {
      restorePendingSingleSourceReplacement();
      return;
    }

    edges = addEdge(
      normalizedConnection,
      pruneConflictingInputEdges(edges, normalizedConnection)
    );
    clearPendingSingleSourceReplacement();
    emitFlowChange("edge-created");
  }

  function reconcileLinkOutputEdges(edgeCandidates) {
    const normalizedEdges = Array.isArray(edgeCandidates) ? edgeCandidates : [];
    if (normalizedEdges.length === 0) {
      return normalizedEdges;
    }

    const linkNodeIds = new Set(
      (Array.isArray(nodes) ? nodes : [])
        .map((node) =>
          normalizeOptionalString(node?.type) === LINK_NODE_TYPE
            ? normalizeOptionalString(node?.id)
            : undefined
        )
        .filter(Boolean)
    );
    if (linkNodeIds.size === 0) {
      return normalizedEdges;
    }

    const outgoingLinkEdgesByNodeId = new Map();
    for (const edge of normalizedEdges) {
      const sourceNodeId = normalizeOptionalString(edge?.source);
      if (!sourceNodeId || !linkNodeIds.has(sourceNodeId)) {
        continue;
      }

      if (!isLinkOutputHandleId(edge?.sourceHandle)) {
        continue;
      }

      if (!outgoingLinkEdgesByNodeId.has(sourceNodeId)) {
        outgoingLinkEdgesByNodeId.set(sourceNodeId, []);
      }
      outgoingLinkEdgesByNodeId.get(sourceNodeId).push(edge);
    }
    if (outgoingLinkEdgesByNodeId.size === 0) {
      return normalizedEdges;
    }

    const disallowedEdgeKeys = new Set();
    const allowedTemplateIdsBySelector = new Map();
    for (const [linkNodeId, outgoingLinkEdges] of outgoingLinkEdgesByNodeId.entries()) {
      const sourceDescriptor = resolveSourceDescriptorForLinkOutput(linkNodeId);
      const connectionMultiplicity = sourceDescriptor?.connectionMultiplicity ?? "single";
      const sourcePinType = normalizeOptionalString(sourceDescriptor?.pinType);
      const nodeSelector = normalizeOptionalString(sourceDescriptor?.nodeSelector);
      const compatibleOutgoingEdges = [];

      for (const outgoingLinkEdge of outgoingLinkEdges) {
        if (
          !isCompatibleLinkOutputEdge(outgoingLinkEdge, {
            sourcePinType,
            nodeSelector,
            allowedTemplateIdsBySelector,
          })
        ) {
          disallowedEdgeKeys.add(readEdgeIdentityKey(outgoingLinkEdge));
          continue;
        }

        compatibleOutgoingEdges.push(outgoingLinkEdge);
      }

      if (connectionMultiplicity === "single" && compatibleOutgoingEdges.length > 1) {
        for (let index = 1; index < compatibleOutgoingEdges.length; index += 1) {
          disallowedEdgeKeys.add(readEdgeIdentityKey(compatibleOutgoingEdges[index]));
        }
      }
    }

    if (disallowedEdgeKeys.size === 0) {
      return normalizedEdges;
    }

    return normalizedEdges.filter(
      (edge) => !disallowedEdgeKeys.has(readEdgeIdentityKey(edge))
    );
  }

  function isCompatibleLinkOutputEdge(edge, context = {}) {
    const targetNodeId = normalizeOptionalString(edge?.target);
    if (!targetNodeId) {
      return false;
    }

    const targetNode = findNodeById(targetNodeId);
    if (!targetNode) {
      return false;
    }

    const targetNodeType = normalizeOptionalString(targetNode?.type);
    const sourcePinType = normalizeOptionalString(context?.sourcePinType);
    const nodeSelector = normalizeOptionalString(context?.nodeSelector);

    if (targetNodeType === LINK_NODE_TYPE) {
      return isLinkInputHandleId(edge?.targetHandle);
    }

    if (targetNodeType === RAW_JSON_NODE_TYPE) {
      const targetHandleId = normalizeOptionalString(edge?.targetHandle);
      return !targetHandleId || targetHandleId === RAW_JSON_INPUT_HANDLE_ID;
    }

    if (targetNodeType !== CUSTOM_NODE_TYPE) {
      return false;
    }

    const targetTemplate = findTemplateForNodeId(targetNodeId);
    if (!targetTemplate) {
      return false;
    }

    if (nodeSelector) {
      const allowedTemplateIds = readAllowedTemplateIdsForSelector(
        nodeSelector,
        context?.allowedTemplateIdsBySelector
      );
      const targetTemplateId = normalizeOptionalString(targetTemplate?.templateId);
      if (!targetTemplateId || !allowedTemplateIds.has(targetTemplateId)) {
        return false;
      }
    }

    const compatibleTargetHandleId = chooseCompatibleInputHandleId(sourcePinType, targetTemplate);
    if (!compatibleTargetHandleId) {
      return false;
    }

    const targetHandleId = normalizeOptionalString(edge?.targetHandle);
    if (targetHandleId && targetHandleId !== compatibleTargetHandleId) {
      return false;
    }

    return true;
  }

  function readAllowedTemplateIdsForSelector(selector, cache) {
    const normalizedSelector = normalizeOptionalString(selector);
    if (!normalizedSelector) {
      return new Set();
    }

    if (cache instanceof Map && cache.has(normalizedSelector)) {
      return cache.get(normalizedSelector);
    }

    const templates = getTemplatesForNodeSelector(normalizedSelector, workspaceContext);
    const allowedTemplateIds = new Set(
      (Array.isArray(templates) ? templates : [])
        .map((template) => normalizeOptionalString(template?.templateId))
        .filter(Boolean)
    );

    if (cache instanceof Map) {
      cache.set(normalizedSelector, allowedTemplateIds);
    }

    return allowedTemplateIds;
  }

  function readEdgeIdentityKey(edge) {
    const edgeId = normalizeOptionalString(edge?.id);
    if (edgeId) {
      return `id:${edgeId}`;
    }

    const sourceNodeId = normalizeOptionalString(edge?.source) ?? "";
    const sourceHandleId = normalizeOptionalString(edge?.sourceHandle) ?? "";
    const targetNodeId = normalizeOptionalString(edge?.target) ?? "";
    const targetHandleId = normalizeOptionalString(edge?.targetHandle) ?? "";
    return `edge:${sourceNodeId}:${sourceHandleId}->${targetNodeId}:${targetHandleId}`;
  }

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
    const quickAction = getNodeEditorQuickActionById(normalizeOptionalString(actionIdCandidate));
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
    const rootNode = resolveRootNodeForNavigation();
    const rootPosition = readAbsoluteNodePosition(rootNode);
    if (!rootPosition) {
      console.info("[node-editor] Quick action could not resolve a root node position.");
      return;
    }
    const rootDimensions = readNodeDimensions(rootNode);
    const targetX = rootPosition.x + (rootDimensions?.width ?? 0);
    const targetY = rootPosition.y + (rootDimensions?.height ?? 0) / 2;

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
    const allowedNodeIds = (Array.isArray(nodes) ? nodes : [])
      .filter((nodeCandidate) => isAutoLayoutEligibleNode(nodeCandidate))
      .map((nodeCandidate) => normalizeOptionalString(nodeCandidate?.id))
      .filter(Boolean);
    const targetNodeIds = collectRecursiveDescendantNodeIds({
      seedNodeIds: autoLayoutSeedNodeIds,
      edges,
      allowedNodeIds,
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

    const layoutOrigin = readLayoutOriginFromPositions(Array.from(absolutePositionByNodeId.values()));
    const layoutEdges = (Array.isArray(edges) ? edges : [])
      .map((edge) => ({
        source: normalizeOptionalString(edge?.source),
        target: normalizeOptionalString(edge?.target),
      }))
      .filter(
        (edge) =>
          edge.source &&
          edge.target &&
          targetNodeIdSet.has(edge.source) &&
          targetNodeIdSet.has(edge.target)
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
    nodes = (Array.isArray(nodes) ? nodes : []).map((nodeCandidate) => {
      const nodeId = normalizeOptionalString(nodeCandidate?.id);
      if (!nodeId || !targetNodeIdSet.has(nodeId)) {
        return nodeCandidate;
      }

      const layoutedAbsolutePosition = layoutedPositionByNodeId.get(nodeId);
      if (!layoutedAbsolutePosition) {
        return nodeCandidate;
      }

      const nextRelativePosition = convertAbsolutePositionToNodeSpace(
        nodeCandidate,
        layoutedAbsolutePosition
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
    dispatch("viewrawjson");
  }

  function handleQuickActionHelpAndHotkeys() {
    if (nodeHelpOpen) {
      closeNodeHelpMenu();
      return;
    }

    openNodeHelpMenu();
  }

  function handleMetadataMutation(event) {
    const mutationReason = normalizeOptionalString(event?.detail?.reason);
    emitFlowChange(mutationReason ?? "metadata-updated");
  }

  function handleWindowKeyDown(event) {
    if (!nodeHelpOpen || normalizeOptionalString(event?.key) !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeNodeHelpMenu();
  }

  function handleWindowKeyUp(event) {
    if (!isDeleteKey(event) || isKeyboardShortcutBlockedByFocusedInput(event?.target)) {
      return;
    }

    queueMicrotask(() => emitFlowChange("elements-deleted"));
  }

  function closeAddNodeMenu() {
    addMenuOpen = false;
    pendingConnection = undefined;
    restorePendingSingleSourceReplacement();
  }

  function openNodeSearchMenu() {
    closeAddNodeMenu();
    closeNodeHelpMenu();
    const currentViewport = getViewport();
    nodeSearchInitialViewport = isViewport(currentViewport)
      ? { ...currentViewport }
      : undefined;
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

    if (restoreViewport && isViewport(initialViewport)) {
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
    dispatch("customizekeybinds");
  }

  function handleNodeSearchPreview(event) {
    const nodeId = normalizeOptionalString(event?.detail?.nodeId);
    if (!nodeId || nodeId === nodeSearchLastPreviewedNodeId) {
      return;
    }

    nodeSearchLastPreviewedNodeId = nodeId;
    centerViewportOnNode(nodeId);
  }

  function handleNodeSearchSelect(event) {
    const nodeId = normalizeOptionalString(event?.detail?.nodeId);
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

  function centerViewportOnNode(nodeIdCandidate) {
    const targetNode = findNodeById(nodeIdCandidate);
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

  function selectOnlyNodeById(nodeIdCandidate) {
    const nodeId = normalizeOptionalString(nodeIdCandidate);
    if (!nodeId) {
      return false;
    }

    let hasSelectionChanges = false;
    nodes = (Array.isArray(nodes) ? nodes : []).map((nodeCandidate) => {
      const candidateNodeId = normalizeOptionalString(nodeCandidate?.id);
      const shouldSelect = candidateNodeId === nodeId;
      if (Boolean(nodeCandidate?.selected) === shouldSelect) {
        return nodeCandidate;
      }

      hasSelectionChanges = true;
      return {
        ...nodeCandidate,
        selected: shouldSelect,
      };
    });

    edges = (Array.isArray(edges) ? edges : []).map((edgeCandidate) => {
      if (edgeCandidate?.selected !== true) {
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

    return event.composedPath().some((target) => {
      if (typeof target?.getAttribute !== "function") {
        return false;
      }

      return target.getAttribute("data-node-search-menu") === "true";
    });
  }

  function handleWindowPointerDown(event) {
    if (addMenuOpen && !didEventOccurInsideAddMenu(event)) {
      closeAddNodeMenu();
    }

    if (nodeSearchOpen && !didEventOccurInsideNodeSearchMenu(event)) {
      closeNodeSearchMenu({ restoreViewport: true });
    }
  }

  function openAddNodeMenu(
    pointerEvent,
    sourceNodeId = undefined,
    sourceHandleId = undefined
  ) {
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

    const isGroupNode = normalizeOptionalString(node?.type) === GROUP_NODE_TYPE;
    const isSelected = node?.selected === true;
    const isTitleBar = Boolean(
      typeof pointerEvent?.target?.closest === "function" &&
        pointerEvent.target.closest(".group-title-drag-handle")
    );

    if (!isGroupNode || isSelected || isTitleBar) {
      return;
    }

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    openAddNodeMenu(pointerEvent);
  }

  function handlePaneClick() {
    if (skipNextPaneClickClose) {
      skipNextPaneClickClose = false;
      return;
    }

    closeAddNodeMenu();
  }

  function handleConnectStart(_pointerEvent, params) {
    const sourceNodeId = normalizeOptionalString(params?.nodeId);
    const sourceHandleId = normalizeOptionalString(params?.handleId);
    const handleType = normalizeOptionalString(params?.handleType);
    if (handleType && handleType !== "source") {
      connectStartSourceNodeId = undefined;
      connectStartSourceHandleId = undefined;
      clearPendingSingleSourceReplacement();
      return;
    }

    connectStartSourceNodeId = sourceNodeId;
    connectStartSourceHandleId = sourceHandleId;
    beginSingleSourceReplacementPreview(sourceNodeId, sourceHandleId);
  }

  function handleConnectEnd(rawPointerEvent, rawConnectionState) {
    const pointerEvent = extractPointerEvent(rawPointerEvent);
    const connectionState = extractConnectionState(rawPointerEvent, rawConnectionState);
    if (connectionState?.isValid) {
      if (pendingSingleSourceReplacement) {
        restorePendingSingleSourceReplacement();
      }
      connectStartSourceNodeId = undefined;
      connectStartSourceHandleId = undefined;
      return;
    }

    const sourceNodeId =
      connectionState?.fromNode?.id ??
      connectStartSourceNodeId ??
      nodes?.[0]?.id ??
      ROOT_NODE_ID;
    const sourceHandleId =
      extractSourceHandleId(connectionState) ??
      connectStartSourceHandleId;

    const addMenuOpened = openAddNodeMenu(pointerEvent, sourceNodeId, sourceHandleId);
    if (addMenuOpened) {
      // Prevent immediate close when the same mouse-up emits a pane click right after connect-end.
      skipNextPaneClickClose = true;
    } else {
      restorePendingSingleSourceReplacement();
    }
    connectStartSourceNodeId = undefined;
    connectStartSourceHandleId = undefined;
  }

  function handleMenuSelect(event) {
    const entry = event?.detail?.template;
    if (!entry) {
      return;
    }

    if (isGenericGroupCreationEntry(entry)) {
      const newGroupNode = {
        id: `Group-${createUuid()}`,
        type: GROUP_NODE_TYPE,
        data: {
          $groupName: DEFAULT_GROUP_NAME,
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
      const newCommentNode = {
        id: `Comment-${createUuid()}`,
        type: COMMENT_NODE_TYPE,
        data: {
          $commentName: COMMENT_DEFAULT_NAME,
          $commentText: COMMENT_DEFAULT_TEXT,
          $fontSize: COMMENT_DEFAULT_FONT_SIZE,
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
      const newRawJsonNode = {
        id: `Generic-${createUuid()}`,
        type: RAW_JSON_NODE_TYPE,
        data: {
          label: RAW_JSON_DEFAULT_LABEL,
          $fieldValues: {
            [RAW_JSON_FIELD_ID]: RAW_JSON_DEFAULT_DATA,
          },
        },
        position: {
          ...pendingNodePosition,
        },
        origin: [0.5, 0.0],
      };

      nodes = [...nodes, newRawJsonNode];

      const connection = pendingConnection;
      if (connection?.sourceNodeId) {
        const normalizedConnection = normalizeConnection({
          id: createEdgeId({
            sourceNodeId: connection.sourceNodeId,
            sourceHandleId: connection.sourceHandleId,
            targetNodeId: newRawJsonNode.id,
            targetHandleId: RAW_JSON_INPUT_HANDLE_ID,
          }),
          source: connection.sourceNodeId,
          ...(connection.sourceHandleId
            ? { sourceHandle: connection.sourceHandleId }
            : {}),
          target: newRawJsonNode.id,
          targetHandle: RAW_JSON_INPUT_HANDLE_ID,
        });

        if (normalizedConnection) {
          edges = addEdge(
            normalizedConnection,
            pruneConflictingInputEdges(edges, normalizedConnection)
          );
        }

        clearPendingSingleSourceReplacement();
      }

      closeAddNodeMenu();
      emitFlowChange("raw-json-node-created");
      return;
    }

    if (isGenericLinkCreationEntry(entry)) {
      const newLinkNode = {
        id: `Link-${createUuid()}`,
        type: LINK_NODE_TYPE,
        data: {
          label: "Link",
        },
        position: {
          ...pendingNodePosition,
        },
        origin: [0.5, 0.0],
      };

      nodes = [...nodes, newLinkNode];

      const connection = pendingConnection;
      if (connection?.sourceNodeId) {
        const normalizedConnection = normalizeConnection({
          id: createEdgeId({
            sourceNodeId: connection.sourceNodeId,
            sourceHandleId: connection.sourceHandleId,
            targetNodeId: newLinkNode.id,
            targetHandleId: LINK_INPUT_HANDLE_ID,
          }),
          source: connection.sourceNodeId,
          ...(connection.sourceHandleId
            ? { sourceHandle: connection.sourceHandleId }
            : {}),
          target: newLinkNode.id,
          targetHandle: LINK_INPUT_HANDLE_ID,
        });

        if (normalizedConnection) {
          edges = addEdge(
            normalizedConnection,
            pruneConflictingInputEdges(edges, normalizedConnection)
          );
        }

        clearPendingSingleSourceReplacement();
      }

      closeAddNodeMenu();
      emitFlowChange("link-node-created");
      return;
    }

    const template = entry;

    const newNodeId = `${normalizeNodeType(template.schemaType ?? template.defaultTypeName)}-${createUuid()}`;
    const newNode = {
      id: newNodeId,
      type: CUSTOM_NODE_TYPE,
      data: buildNodeDataFromTemplate(template),
      position: {
        ...pendingNodePosition,
      },
      origin: [0.5, 0.0],
    };

    nodes = [...nodes, newNode];

    const connection = pendingConnection;
    if (connection?.sourceNodeId) {
      const targetHandleId = chooseTargetHandleForConnection(
        connection.sourceNodeId,
        connection.sourceHandleId,
        template
      );
      const normalizedConnection = normalizeConnection({
        id: createEdgeId({
          sourceNodeId: connection.sourceNodeId,
          sourceHandleId: connection.sourceHandleId,
          targetNodeId: newNodeId,
          targetHandleId,
        }),
        source: connection.sourceNodeId,
        ...(connection.sourceHandleId
          ? { sourceHandle: connection.sourceHandleId }
          : {}),
        target: newNodeId,
        ...(targetHandleId ? { targetHandle: targetHandleId } : {}),
      });

      if (normalizedConnection) {
        edges = addEdge(
          normalizedConnection,
          pruneConflictingInputEdges(edges, normalizedConnection)
        );
      }

      clearPendingSingleSourceReplacement();
    }

    closeAddNodeMenu();
    emitFlowChange("node-created");
  }

  function createDefaultNodes() {
    const defaultTemplate = getDefaultTemplate(workspaceContext);
    if (!defaultTemplate) {
      return [];
    }

    return [
      {
        id: ROOT_NODE_ID,
        type: CUSTOM_NODE_TYPE,
        data: buildNodeDataFromTemplate(defaultTemplate),
        position: { x: 0, y: 50 },
      },
    ];
  }

  function createAddNodeMenuRequest(pointerEvent, sourceNodeId, sourceHandleId) {
    const { clientX, clientY } = readPointerCoordinates(pointerEvent);
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
      connection: createPendingConnection(sourceNodeId, sourceHandleId),
    };
  }

  function readPointerCoordinates(event) {
    if (!event || typeof event !== "object") {
      return { clientX: 0, clientY: 0 };
    }

    if ("changedTouches" in event && event.changedTouches.length > 0) {
      const touch = event.changedTouches[0];
      return {
        clientX: touch.clientX,
        clientY: touch.clientY,
      };
    }

    return {
      clientX: Number(event.clientX) || 0,
      clientY: Number(event.clientY) || 0,
    };
  }

  function extractPointerEvent(candidate) {
    if (candidate && typeof candidate === "object" && candidate.event) {
      return candidate.event;
    }

    return candidate;
  }

  function extractConnectionState(firstArg, secondArg) {
    if (secondArg && typeof secondArg === "object") {
      return secondArg;
    }

    if (firstArg && typeof firstArg === "object" && firstArg.connectionState) {
      return firstArg.connectionState;
    }

    return undefined;
  }

  function extractSourceHandleId(connectionState) {
    const candidates = [
      connectionState?.fromHandle?.id,
      connectionState?.fromHandleId,
      connectionState?.sourceHandle,
    ];

    return candidates
      .map(candidate => normalizeOptionalString(candidate))
      .find(Boolean);
  }

  function normalizeConnection(connection) {
    const sourceNodeId = normalizeOptionalString(connection?.source);
    const targetNodeId = normalizeOptionalString(connection?.target);
    if (!sourceNodeId || !targetNodeId) {
      return undefined;
    }

    const normalizedConnection = {
      source: sourceNodeId,
      target: targetNodeId,
    };
    const connectionId = normalizeOptionalString(connection?.id);
    if (connectionId) {
      normalizedConnection.id = connectionId;
    }

    const sourceHandleId = normalizeOptionalString(connection?.sourceHandle);
    if (sourceHandleId) {
      normalizedConnection.sourceHandle = sourceHandleId;
    }

    const targetHandleId = normalizeOptionalString(connection?.targetHandle);
    if (targetHandleId) {
      normalizedConnection.targetHandle = targetHandleId;
    }

    return normalizedConnection;
  }

  function pruneConflictingInputEdges(existingEdges, connection) {
    const targetNodeId = normalizeOptionalString(connection?.target);
    if (!targetNodeId) {
      return Array.isArray(existingEdges) ? existingEdges : [];
    }

    const targetHandleId = normalizeOptionalString(connection?.targetHandle);
    const normalizedEdges = Array.isArray(existingEdges) ? existingEdges : [];

    return normalizedEdges.filter((edge) => {
      const edgeTargetNodeId = normalizeOptionalString(edge?.target);
      if (edgeTargetNodeId !== targetNodeId) {
        return true;
      }

      const edgeTargetHandleId = normalizeOptionalString(edge?.targetHandle);
      if (targetHandleId) {
        return edgeTargetHandleId !== targetHandleId;
      }

      return false;
    });
  }

  function beginSingleSourceReplacementPreview(sourceNodeId, sourceHandleId) {
    clearPendingSingleSourceReplacement();

    const normalizedSourceNodeId = normalizeOptionalString(sourceNodeId);
    const normalizedSourceHandleId = normalizeOptionalString(sourceHandleId);
    if (!normalizedSourceNodeId) {
      return;
    }

    const sourceMultiplicity = readSourceHandleMultiplicity(
      normalizedSourceNodeId,
      normalizedSourceHandleId
    );
    if (sourceMultiplicity !== "single") {
      return;
    }

    const normalizedEdges = Array.isArray(edges) ? edges : [];
    const retainedEdges = [];
    const removedEdges = [];
    for (const edge of normalizedEdges) {
      if (isEdgeFromSourceHandle(edge, normalizedSourceNodeId, normalizedSourceHandleId)) {
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
      sourceNodeId: normalizedSourceNodeId,
      sourceHandleId: normalizedSourceHandleId,
      removedEdges,
    };
  }

  function readSourceHandleMultiplicity(sourceNodeId, sourceHandleId) {
    const sourceNode = findNodeById(sourceNodeId);
    if (normalizeOptionalString(sourceNode?.type) === LINK_NODE_TYPE) {
      const linkSourceDescriptor = resolveSourceDescriptorForLinkOutput(
        sourceNodeId
      );
      return linkSourceDescriptor?.connectionMultiplicity ?? "single";
    }

    const sourceTemplate = findTemplateForNodeId(sourceNodeId);
    const outputPins = Array.isArray(sourceTemplate?.outputPins) ? sourceTemplate.outputPins : [];
    const sourcePin = outputPins.find(
      (pin) => normalizeOptionalString(pin?.id) === sourceHandleId
    );
    if (sourcePin?.isMap === true) {
      return "map";
    }

    if (sourcePin?.multiple === true) {
      return "multiple";
    }

    return "single";
  }

  function resolveSourceDescriptorForLinkOutput(linkNodeId, visitedLinkNodeIds = new Set()) {
    const normalizedLinkNodeId = normalizeOptionalString(linkNodeId);
    if (!normalizedLinkNodeId || visitedLinkNodeIds.has(normalizedLinkNodeId)) {
      return undefined;
    }

    const nextVisitedLinkNodeIds = new Set(visitedLinkNodeIds);
    nextVisitedLinkNodeIds.add(normalizedLinkNodeId);

    const inputEdge = findInputEdgeForLinkNode(normalizedLinkNodeId);
    if (!inputEdge) {
      return undefined;
    }

    const sourceNodeId = normalizeOptionalString(inputEdge?.source);
    if (!sourceNodeId) {
      return undefined;
    }

    const sourceNode = findNodeById(sourceNodeId);
    if (normalizeOptionalString(sourceNode?.type) === LINK_NODE_TYPE) {
      return resolveSourceDescriptorForLinkOutput(
        sourceNodeId,
        nextVisitedLinkNodeIds
      );
    }

    const sourceTemplate = findTemplateForNodeId(sourceNodeId);
    const sourceOutputPins = Array.isArray(sourceTemplate?.outputPins)
      ? sourceTemplate.outputPins
      : [];
    if (sourceOutputPins.length === 0) {
      return undefined;
    }

    const normalizedSourceHandleId = normalizeOptionalString(inputEdge?.sourceHandle);
    let sourcePin = sourceOutputPins.find(
      (pin) => normalizeOptionalString(pin?.id) === normalizedSourceHandleId
    );
    if (!sourcePin && !normalizedSourceHandleId && sourceOutputPins.length === 1) {
      sourcePin = sourceOutputPins[0];
    }
    if (!sourcePin) {
      sourcePin = sourceOutputPins[0];
    }
    if (!sourcePin) {
      return undefined;
    }

    return {
      connectionMultiplicity: readOutputPinConnectionMultiplicity(sourcePin),
      pinType: normalizeOptionalString(sourcePin?.type),
      nodeSelector: normalizeOptionalString(
        readSourceConnectionDescriptor(sourceTemplate, sourcePin?.id)?.nodeSelector
      ),
    };
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
    const normalizedLinkNodeId = normalizeOptionalString(linkNodeId);
    if (!normalizedLinkNodeId) {
      return undefined;
    }

    const normalizedEdges = Array.isArray(edges) ? edges : [];
    return normalizedEdges.find(
      (edge) =>
        normalizeOptionalString(edge?.target) === normalizedLinkNodeId &&
        isLinkInputHandleId(edge?.targetHandle)
    );
  }

  function isLinkInputHandleId(candidateHandleId) {
    const normalizedHandleId = normalizeOptionalString(candidateHandleId);
    return normalizedHandleId === undefined || normalizedHandleId === LINK_INPUT_HANDLE_ID;
  }

  function isLinkOutputHandleId(candidateHandleId) {
    const normalizedHandleId = normalizeOptionalString(candidateHandleId);
    return normalizedHandleId === undefined || normalizedHandleId === LINK_OUTPUT_HANDLE_ID;
  }

  function findNodeById(nodeId) {
    const normalizedNodeId = normalizeOptionalString(nodeId);
    if (!normalizedNodeId) {
      return undefined;
    }

    const normalizedNodes = Array.isArray(nodes) ? nodes : [];
    return normalizedNodes.find((node) => normalizeOptionalString(node?.id) === normalizedNodeId);
  }

  function isEdgeFromSourceHandle(edge, sourceNodeId, sourceHandleId) {
    if (normalizeOptionalString(edge?.source) !== sourceNodeId) {
      return false;
    }

    return normalizeOptionalString(edge?.sourceHandle) === sourceHandleId;
  }

  function restorePendingSingleSourceReplacement() {
    const removedEdges = Array.isArray(pendingSingleSourceReplacement?.removedEdges)
      ? pendingSingleSourceReplacement.removedEdges
      : [];
    if (removedEdges.length === 0) {
      pendingSingleSourceReplacement = undefined;
      return;
    }

    const normalizedEdges = Array.isArray(edges) ? edges : [];
    const existingEdgeIds = new Set(
      normalizedEdges
        .map((edge) => normalizeOptionalString(edge?.id))
        .filter((edgeId) => Boolean(edgeId))
    );
    const restoredEdges = [];

    for (const removedEdge of removedEdges) {
      const edgeId = normalizeOptionalString(removedEdge?.id);
      if (edgeId && existingEdgeIds.has(edgeId)) {
        continue;
      }

      if (edgeId) {
        existingEdgeIds.add(edgeId);
      }

      restoredEdges.push(removedEdge);
    }

    edges = [...normalizedEdges, ...restoredEdges];
    pendingSingleSourceReplacement = undefined;
  }

  function clearPendingSingleSourceReplacement() {
    pendingSingleSourceReplacement = undefined;
  }

  function chooseTargetHandleForConnection(sourceNodeId, sourceHandleId, targetTemplate) {
    const sourceNode = findNodeById(sourceNodeId);
    if (normalizeOptionalString(sourceNode?.type) === LINK_NODE_TYPE) {
      const linkSourceDescriptor = resolveSourceDescriptorForLinkOutput(sourceNodeId);
      return chooseCompatibleInputHandleId(linkSourceDescriptor?.pinType, targetTemplate);
    }

    const sourceTemplate = findTemplateForNodeId(sourceNodeId);
    const sourcePins = Array.isArray(sourceTemplate?.outputPins) ? sourceTemplate.outputPins : [];
    const sourcePin = sourcePins.find((pin) => pin.id === sourceHandleId);
    const sourcePinType =
      typeof sourcePin?.type === "string" && sourcePin.type.trim() ? sourcePin.type.trim() : undefined;

    return chooseCompatibleInputHandleId(sourcePinType, targetTemplate);
  }

  function readSourceConnectionDescriptor(sourceTemplate, sourceHandleId) {
    const sourceConnectionDescriptors = Array.isArray(sourceTemplate?.schemaConnections)
      ? sourceTemplate.schemaConnections
      : [];
    if (sourceConnectionDescriptors.length === 0) {
      return undefined;
    }

    const normalizedSourceHandleId = normalizeOptionalString(sourceHandleId);
    let matchedDescriptor = sourceConnectionDescriptors.find(
      (descriptor) =>
        normalizeOptionalString(descriptor?.outputPinId) === normalizedSourceHandleId
    );
    if (!matchedDescriptor && !normalizedSourceHandleId && sourceConnectionDescriptors.length === 1) {
      matchedDescriptor = sourceConnectionDescriptors[0];
    }

    return matchedDescriptor;
  }

  function resolveNodeSelectorForSourceConnection(sourceNodeId, sourceHandleId) {
    const sourceNode = findNodeById(sourceNodeId);
    if (normalizeOptionalString(sourceNode?.type) === LINK_NODE_TYPE) {
      const linkSourceDescriptor = resolveSourceDescriptorForLinkOutput(sourceNodeId);
      return normalizeOptionalString(linkSourceDescriptor?.nodeSelector);
    }

    const sourceTemplate = findTemplateForNodeId(sourceNodeId);
    const matchedDescriptor = readSourceConnectionDescriptor(sourceTemplate, sourceHandleId);
    return normalizeOptionalString(matchedDescriptor?.nodeSelector);
  }

  function findTemplateForNodeId(nodeId) {
    const normalizedNodeId = normalizeOptionalString(nodeId);
    if (!normalizedNodeId) {
      return undefined;
    }

    const sourceNode = Array.isArray(nodes)
      ? nodes.find((node) => node?.id === normalizedNodeId)
      : undefined;
    if (!sourceNode) {
      return undefined;
    }

    const templateId = normalizeOptionalString(sourceNode?.data?.$templateId);

    return (
      (templateId ? getTemplateById(templateId, workspaceContext) : undefined) ??
      findTemplateByTypeName(sourceNode?.data?.Type, workspaceContext)
    );
  }

  function resolveAvailableAddEntries(connection) {
    const sourceNodeId = normalizeOptionalString(connection?.sourceNodeId);
    const sourceHandleId = normalizeOptionalString(connection?.sourceHandleId);
    const genericEntries = resolveGenericAddEntries(sourceNodeId);
    if (!Array.isArray(allTemplates) || allTemplates.length === 0) {
      return genericEntries;
    }

    if (!sourceNodeId || !sourceHandleId) {
      return [...genericEntries, ...allTemplates];
    }

    const selector = resolveNodeSelectorForSourceConnection(sourceNodeId, sourceHandleId);
    if (!selector) {
      return [...genericEntries, ...allTemplates];
    }

    const filteredTemplates = getTemplatesForNodeSelector(selector, workspaceContext);
    return Array.isArray(filteredTemplates) && filteredTemplates.length > 0
      ? [...genericEntries, ...filteredTemplates]
      : genericEntries;
  }

  function resolveGenericAddEntries(sourceNodeId) {
    if (!sourceNodeId) {
      return [...GENERIC_ADD_MENU_ENTRIES];
    }

    return GENERIC_ADD_MENU_ENTRIES.filter(
      (entry) =>
        !isGenericGroupCreationEntry(entry) &&
        !isGenericCommentCreationEntry(entry)
    );
  }

  function createEdgeId({
    sourceNodeId,
    sourceHandleId,
    targetNodeId,
    targetHandleId,
  }) {
    const sourcePart = sourceHandleId ? `${sourceNodeId}:${sourceHandleId}` : sourceNodeId;
    const targetPart = targetHandleId ? `${targetNodeId}:${targetHandleId}` : targetNodeId;
    return `${sourcePart}--${targetPart}--${createUuid()}`;
  }

  function normalizeNodeType(candidate) {
    if (typeof candidate === "string") {
      const cleaned = candidate.trim().replace(/\s+/g, "");
      if (cleaned) {
        return cleaned;
      }
    }

    return "Node";
  }

  function normalizeOptionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function buildNodeDataFromTemplate(template) {
    return {
      label: template.label,
      $templateId: template.templateId,
      $fieldValues: template.buildInitialValues(),
    };
  }

  function createPendingConnection(sourceNodeId, sourceHandleId) {
    const normalizedSourceNodeId = normalizeOptionalString(sourceNodeId);
    if (!normalizedSourceNodeId) {
      return undefined;
    }

    return {
      sourceNodeId: normalizedSourceNodeId,
      sourceHandleId: normalizeOptionalString(sourceHandleId),
    };
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

    const initialFitNodeIds = resolveInitialFitNodeIds(nodes, rootNodeId);
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
    const nodeList = Array.isArray(nodesCandidate) ? nodesCandidate : [];
    if (nodeList.length === 0) {
      return [];
    }

    const resolvedRootNodeId =
      normalizeOptionalString(rootNodeIdCandidate) ?? ROOT_NODE_ID;
    const rootNode = nodeList.find(
      (node) => normalizeOptionalString(node?.id) === resolvedRootNodeId
    );
    if (!rootNode) {
      return [];
    }

    const rootPosition = readNodePosition(rootNode);
    if (!rootPosition) {
      return [];
    }

    const fitNodeIdSet = new Set([resolvedRootNodeId]);
    for (const node of nodeList) {
      const nodeId = normalizeOptionalString(node?.id);
      if (!nodeId) {
        continue;
      }

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

    return Array.from(fitNodeIdSet, (nodeId) => ({ id: nodeId }));
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
      nodeCandidate?.measured?.width
    );
    const height = readFiniteDimension(
      nodeCandidate?.height,
      nodeCandidate?.initialHeight,
      nodeCandidate?.measured?.height
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

  function resolveRootNodeForNavigation() {
    const explicitRootNodeId = normalizeOptionalString(rootNodeId);
    const candidateRootNodeIds = [explicitRootNodeId, ROOT_NODE_ID].filter(Boolean);
    for (const candidateRootNodeId of candidateRootNodeIds) {
      const candidateRootNode = findNodeById(candidateRootNodeId);
      if (candidateRootNode) {
        return candidateRootNode;
      }
    }

    const normalizedNodes = Array.isArray(nodes) ? nodes : [];
    const firstRuntimeNode = normalizedNodes.find((node) => {
      const nodeType = normalizeOptionalString(node?.type);
      return nodeType !== GROUP_NODE_TYPE && nodeType !== COMMENT_NODE_TYPE;
    });
    if (firstRuntimeNode) {
      return firstRuntimeNode;
    }

    return normalizedNodes[0];
  }

  function readAbsoluteNodePosition(nodeCandidate, visitedNodeIds = new Set()) {
    const relativePosition = readNodePosition(nodeCandidate);
    if (!relativePosition) {
      return undefined;
    }

    const nodeId = normalizeOptionalString(nodeCandidate?.id);
    const parentNodeId = normalizeOptionalString(nodeCandidate?.parentId);
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
    const normalizedNodes = Array.isArray(nodes) ? nodes : [];
    const selectedNodeIds = normalizedNodes
      .filter((nodeCandidate) => nodeCandidate?.selected === true && isAutoLayoutEligibleNode(nodeCandidate))
      .map((nodeCandidate) => normalizeOptionalString(nodeCandidate?.id))
      .filter(Boolean);

    if (selectedNodeIds.length > 0) {
      return Array.from(new Set(selectedNodeIds));
    }

    const rootNode = resolveRootNodeForNavigation();
    const rootNodeId =
      isAutoLayoutEligibleNode(rootNode) ? normalizeOptionalString(rootNode?.id) : undefined;
    return rootNodeId ? [rootNodeId] : [];
  }

  function isAutoLayoutEligibleNode(nodeCandidate) {
    const nodeType = normalizeOptionalString(nodeCandidate?.type);
    return nodeType !== GROUP_NODE_TYPE && nodeType !== COMMENT_NODE_TYPE;
  }

  function convertAbsolutePositionToNodeSpace(nodeCandidate, absolutePositionCandidate) {
    const absolutePosition = readNodePosition({ position: absolutePositionCandidate });
    if (!absolutePosition) {
      return undefined;
    }

    const parentNodeId = normalizeOptionalString(nodeCandidate?.parentId);
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
    const width = normalizeGroupDimension(widthCandidate, DEFAULT_GROUP_WIDTH, MIN_GROUP_WIDTH);
    const height = normalizeGroupDimension(heightCandidate, DEFAULT_GROUP_HEIGHT, MIN_GROUP_HEIGHT);
    const area = width * height;
    return GROUP_Z_INDEX_UNSELECTED - Math.round(area);
  }

  function normalizeGroupDimension(candidateValue, fallbackValue, minValue) {
    const normalizedValue = Number(candidateValue);
    if (!Number.isFinite(normalizedValue)) {
      return fallbackValue;
    }

    return Math.max(minValue, normalizedValue);
  }

  function isViewport(candidateViewport) {
    return (
      Number.isFinite(candidateViewport?.x) &&
      Number.isFinite(candidateViewport?.y) &&
      Number.isFinite(candidateViewport?.zoom)
    );
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isGenericGroupCreationEntry(candidate) {
    return (
      normalizeOptionalString(candidate?.kind) === "generic-action" &&
      normalizeOptionalString(candidate?.actionId) === GENERIC_ACTION_CREATE_GROUP
    );
  }

  function isGenericCommentCreationEntry(candidate) {
    return (
      normalizeOptionalString(candidate?.kind) === "generic-action" &&
      normalizeOptionalString(candidate?.actionId) === GENERIC_ACTION_CREATE_COMMENT
    );
  }

  function isGenericRawJsonCreationEntry(candidate) {
    return (
      normalizeOptionalString(candidate?.kind) === "generic-action" &&
      normalizeOptionalString(candidate?.actionId) === GENERIC_ACTION_CREATE_RAW_JSON
    );
  }

  function isGenericLinkCreationEntry(candidate) {
    return (
      normalizeOptionalString(candidate?.kind) === "generic-action" &&
      normalizeOptionalString(candidate?.actionId) === GENERIC_ACTION_CREATE_LINK
    );
  }

  function isDeleteKey(event) {
    const key = normalizeOptionalString(event?.key);
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

    const tagName = normalizeOptionalString(target?.tagName)?.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return true;
    }

    if (target?.isContentEditable === true) {
      return true;
    }

    const role = normalizeOptionalString(
      typeof target?.getAttribute === "function" ? target.getAttribute("role") : undefined
    )?.toLowerCase();
    if (role === "textbox" || role === "searchbox" || role === "combobox" || role === "spinbutton") {
      return true;
    }

    if (typeof target?.closest === "function") {
      const editableAncestor = target.closest(
        "input, textarea, select, [contenteditable], [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton']"
      );
      if (editableAncestor) {
        const contentEditableValue = normalizeOptionalString(
          typeof editableAncestor.getAttribute === "function"
            ? editableAncestor.getAttribute("contenteditable")
            : undefined
        )?.toLowerCase();
        if (contentEditableValue !== "false") {
          return true;
        }
      }
    }

    return false;
  }
</script>

<svelte:window
  on:keydown|capture={handleWindowKeyDown}
  on:pointerdown|capture={handleWindowPointerDown}
  on:keyup={handleWindowKeyUp}
  on:hytale-node-editor-group-mutation={handleMetadataMutation}
  on:hytale-node-editor-comment-mutation={handleMetadataMutation}
  on:hytale-node-editor-custom-mutation={handleMetadataMutation}
  on:hytale-node-editor-raw-json-mutation={handleMetadataMutation}
  on:hytale-node-editor-link-mutation={handleMetadataMutation}
/>

<div
  class="relative w-full h-full overflow-hidden"
  class:invisible={!initialViewportReady}
  bind:this={flowWrapperElement}
>
  <SvelteFlow
    bind:nodes
    bind:edges
    disableKeyboardA11y={addMenuOpen || nodeSearchOpen || nodeHelpOpen}
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
    templates={availableAddEntries}
    on:close={closeAddNodeMenu}
    on:select={handleMenuSelect}
  />

  <NodeHelpPanel
    open={nodeHelpOpen}
    openVersion={nodeHelpOpenVersion}
    on:close={handleNodeHelpCloseRequest}
    on:customizekeybinds={handleNodeHelpCustomizeKeybindsRequest}
  />
</div>
