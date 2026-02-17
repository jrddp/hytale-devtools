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
  import CommentMetadataNode from "./nodes/CommentMetadataNode.svelte";
  import CustomMetadataNode from "./nodes/CustomMetadataNode.svelte";
  import GroupMetadataNode from "./nodes/GroupMetadataNode.svelte";
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
    COMMENT_NODE_TYPE,
    CUSTOM_NODE_TYPE,
    GENERIC_ACTION_CREATE_COMMENT,
    GENERIC_ACTION_CREATE_GROUP,
    GENERIC_ADD_CATEGORY,
    GROUP_NODE_TYPE,
  } from "./node-editor/types.js";

  export let nodes = createDefaultNodes();
  export let edges = [];
  export let loadVersion = 0;
  export let templateSourceMode = "workspace-hg-java";
  export let workspaceContext = {};

  const ROOT_NODE_ID = "Node-00000000-0000-0000-0000-000000000000";
  const DEFAULT_GROUP_WIDTH = 520;
  const DEFAULT_GROUP_HEIGHT = 320;
  const DEFAULT_GROUP_NAME = "Group";
  const MIN_FLOW_ZOOM = 0;
  const GROUP_Z_INDEX_UNSELECTED = -10000;
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
  ];

  const nodeTypes = {
    [COMMENT_NODE_TYPE]: CommentMetadataNode,
    [CUSTOM_NODE_TYPE]: CustomMetadataNode,
    [GROUP_NODE_TYPE]: GroupMetadataNode,
  };

  const { screenToFlowPosition, fitView } = useSvelteFlow();

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

  $: {
    setActiveTemplateSourceMode(templateSourceMode);
    setActiveWorkspaceContext(workspaceContext);
    allTemplates = getTemplates(workspaceContext);
  }

  $: availableAddEntries = resolveAvailableAddEntries(pendingConnection);

  $: if (loadVersion !== lastNormalizedLoadVersion) {
    lastNormalizedLoadVersion = loadVersion;
    clearPendingSingleSourceReplacement();
    ensureCustomNodeTypes();
  }

  $: if (!hasAppliedInitialFit && loadVersion > 0) {
    void applyInitialFitOnce();
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

  function handleNodeDragStop() {
    emitFlowChange("node-moved");
  }

  function handleMetadataMutation(event) {
    const mutationReason = normalizeOptionalString(event?.detail?.reason);
    emitFlowChange(mutationReason ?? "metadata-updated");
  }

  function handleWindowKeyUp(event) {
    if (!isDeleteKey(event) || isEditableTarget(event?.target)) {
      return;
    }

    queueMicrotask(() => emitFlowChange("elements-deleted"));
  }

  function closeAddNodeMenu() {
    addMenuOpen = false;
    pendingConnection = undefined;
    restorePendingSingleSourceReplacement();
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

  function handleWindowPointerDown(event) {
    if (!addMenuOpen) {
      return;
    }

    if (didEventOccurInsideAddMenu(event)) {
      return;
    }

    closeAddNodeMenu();
  }

  function openAddNodeMenu(
    pointerEvent,
    sourceNodeId = undefined,
    sourceHandleId = undefined
  ) {
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
        zIndex: GROUP_Z_INDEX_UNSELECTED,
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
    const sourceTemplate = findTemplateForNodeId(sourceNodeId);
    const sourcePins = Array.isArray(sourceTemplate?.outputPins) ? sourceTemplate.outputPins : [];
    const sourcePin = sourcePins.find((pin) => pin.id === sourceHandleId);
    const sourcePinType =
      typeof sourcePin?.type === "string" && sourcePin.type.trim() ? sourcePin.type.trim() : undefined;

    return chooseCompatibleInputHandleId(sourcePinType, targetTemplate);
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
    const genericEntries = [...GENERIC_ADD_MENU_ENTRIES];
    if (!Array.isArray(allTemplates) || allTemplates.length === 0) {
      return genericEntries;
    }

    const sourceNodeId = normalizeOptionalString(connection?.sourceNodeId);
    const sourceHandleId = normalizeOptionalString(connection?.sourceHandleId);
    if (!sourceNodeId || !sourceHandleId) {
      return [...genericEntries, ...allTemplates];
    }

    const sourceTemplate = findTemplateForNodeId(sourceNodeId);
    const sourceConnectionDescriptors = Array.isArray(sourceTemplate?.schemaConnections)
      ? sourceTemplate.schemaConnections
      : [];
    const matchedDescriptor = sourceConnectionDescriptors.find(
      (descriptor) => descriptor?.outputPinId === sourceHandleId
    );
    const selector = normalizeOptionalString(matchedDescriptor?.nodeSelector);
    if (!selector) {
      return [...genericEntries, ...allTemplates];
    }

    const filteredTemplates = getTemplatesForNodeSelector(selector, workspaceContext);
    return Array.isArray(filteredTemplates) && filteredTemplates.length > 0
      ? [...genericEntries, ...filteredTemplates]
      : genericEntries;
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

    if (Array.isArray(nodes) && nodes.length > 0) {
      fitView({
        padding: 0.2,
        minZoom: MIN_FLOW_ZOOM,
        duration: 0,
      });
    }

    hasAppliedInitialFit = true;
    initialViewportReady = true;
    initialFitInProgress = false;
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

  function isDeleteKey(event) {
    const key = normalizeOptionalString(event?.key);
    return key === "Delete" || key === "Backspace";
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

    return false;
  }
</script>

<svelte:window
  on:pointerdown|capture={handleWindowPointerDown}
  on:keyup={handleWindowKeyUp}
  on:hytale-node-editor-group-mutation={handleMetadataMutation}
  on:hytale-node-editor-comment-mutation={handleMetadataMutation}
/>

<div
  class="relative w-full h-full overflow-hidden"
  class:invisible={!initialViewportReady}
  bind:this={flowWrapperElement}
>
  <SvelteFlow
    bind:nodes
    bind:edges
    disableKeyboardA11y={addMenuOpen}
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
  </SvelteFlow>

  <AddNodeMenu
    open={addMenuOpen}
    openVersion={addMenuOpenVersion}
    position={addMenuPosition}
    templates={availableAddEntries}
    on:close={closeAddNodeMenu}
    on:select={handleMenuSelect}
  />
</div>
