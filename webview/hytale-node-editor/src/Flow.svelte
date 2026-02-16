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
  import CustomMetadataNode from "./nodes/CustomMetadataNode.svelte";
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
  import { CUSTOM_NODE_TYPE } from "./node-editor/types.js";

  export let nodes = createDefaultNodes();
  export let edges = [];
  export let loadVersion = 0;
  export let templateSourceMode = "workspace-hg-java";
  export let workspaceContext = {};

  const ROOT_NODE_ID = "Node-00000000-0000-0000-0000-000000000000";
  const dispatch = createEventDispatcher();

  const nodeTypes = {
    [CUSTOM_NODE_TYPE]: CustomMetadataNode,
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
  let availableTemplates = [];

  $: {
    setActiveTemplateSourceMode(templateSourceMode);
    setActiveWorkspaceContext(workspaceContext);
    allTemplates = getTemplates(workspaceContext);
  }

  $: availableTemplates = resolveAvailableTemplates(pendingConnection);

  $: if (loadVersion !== lastNormalizedLoadVersion) {
    lastNormalizedLoadVersion = loadVersion;
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
    edges = addEdge(connection, edges);
    emitFlowChange("edge-created");
  }

  function handleNodeDragStop() {
    emitFlowChange("node-moved");
  }

  function closeAddNodeMenu() {
    addMenuOpen = false;
    pendingConnection = undefined;
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
      return;
    }

    addMenuPosition = addMenuRequest.position;
    pendingNodePosition = addMenuRequest.nodePosition;
    pendingConnection = addMenuRequest.connection;
    addMenuOpen = true;
    addMenuOpenVersion += 1;
  }

  function handlePaneContextMenu(payload) {
    const pointerEvent = payload?.event;
    if (!pointerEvent) {
      return;
    }

    pointerEvent.preventDefault();
    void openAddNodeMenu(pointerEvent);
  }

  function handlePaneClick() {
    if (skipNextPaneClickClose) {
      skipNextPaneClickClose = false;
      return;
    }

    closeAddNodeMenu();
  }

  function handleConnectStart(_pointerEvent, params) {
    connectStartSourceNodeId = normalizeOptionalString(params?.nodeId);
    connectStartSourceHandleId = normalizeOptionalString(params?.handleId);
  }

  function handleConnectEnd(rawPointerEvent, rawConnectionState) {
    const pointerEvent = extractPointerEvent(rawPointerEvent);
    const connectionState = extractConnectionState(rawPointerEvent, rawConnectionState);
    if (connectionState?.isValid) {
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

    // Prevent immediate close when the same mouse-up emits a pane click right after connect-end.
    skipNextPaneClickClose = true;
    void openAddNodeMenu(pointerEvent, sourceNodeId, sourceHandleId);
    connectStartSourceNodeId = undefined;
    connectStartSourceHandleId = undefined;
  }

  function handleMenuSelect(event) {
    const template = event?.detail?.template;
    if (!template) {
      return;
    }

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
      edges = [
        ...edges,
        {
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
        },
      ];
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

  function resolveAvailableTemplates(connection) {
    if (!Array.isArray(allTemplates) || allTemplates.length === 0) {
      return [];
    }

    const sourceNodeId = normalizeOptionalString(connection?.sourceNodeId);
    const sourceHandleId = normalizeOptionalString(connection?.sourceHandleId);
    if (!sourceNodeId || !sourceHandleId) {
      return allTemplates;
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
      return allTemplates;
    }

    const filteredTemplates = getTemplatesForNodeSelector(selector, workspaceContext);
    return Array.isArray(filteredTemplates) && filteredTemplates.length > 0
      ? filteredTemplates
      : [];
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
    const schemaType = normalizeOptionalString(template?.schemaType);
    return {
      label: template.label,
      ...(schemaType ? { Type: schemaType } : {}),
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
</script>

<svelte:window on:pointerdown|capture={handleWindowPointerDown} />

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
    minZoom={0.2}
    {nodeTypes}
    onconnect={handleConnect}
    onconnectstart={handleConnectStart}
    onconnectend={handleConnectEnd}
    onnodedragstop={handleNodeDragStop}
    onpaneclick={handlePaneClick}
    onpanecontextmenu={handlePaneContextMenu}
  >
    <Background bgColor={"var(--vscode-editor-background)"} />
  </SvelteFlow>

  <AddNodeMenu
    open={addMenuOpen}
    openVersion={addMenuOpenVersion}
    position={addMenuPosition}
    templates={availableTemplates}
    on:close={closeAddNodeMenu}
    on:select={handleMenuSelect}
  />
</div>
