<script>
  import {
    addEdge,
    Background,
    MiniMap,
    Controls,
    SvelteFlow,
    useSvelteFlow,
  } from "@xyflow/svelte";
  import { createEventDispatcher, tick } from "svelte";
  import "@xyflow/svelte/dist/style.css";

  import AddNodeMenu from "./components/AddNodeMenu.svelte";
  import CustomMetadataNode from "./nodes/CustomMetadataNode.svelte";
  import { SAMPLE_NODE_TEMPLATES } from "./node-editor/sampleNodeTemplates.js";
  import { CUSTOM_NODE_TYPE } from "./node-editor/types.js";

  export let nodes = createDefaultNodes();
  export let edges = [];
  export let loadVersion = 0;

  const dispatch = createEventDispatcher();

  const nodeTypes = {
    [CUSTOM_NODE_TYPE]: CustomMetadataNode,
  };

  const { screenToFlowPosition, fitView } = useSvelteFlow();

  let lastNormalizedLoadVersion = -1;
  let flowWrapperElement;

  let addMenuOpen = false;
  let addMenuOpenVersion = 0;
  let addMenuPosition = { x: 0, y: 0 };
  let pendingNodePosition = { x: 0, y: 0 };
  let pendingConnectionSourceId;
  let connectStartSourceNodeId;
  let skipNextPaneClickClose = false;
  let hasAppliedInitialFit = false;
  let initialFitInProgress = false;
  let initialViewportReady = false;

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
    pendingConnectionSourceId = undefined;
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

  function openAddNodeMenu(pointerEvent, sourceNodeId = undefined) {
    const { clientX, clientY } = readPointerCoordinates(pointerEvent);
    const paneBounds = flowWrapperElement?.getBoundingClientRect?.();
    if (!paneBounds) {
      return;
    }

    addMenuPosition = {
      x: clientX - paneBounds.left,
      y: clientY - paneBounds.top - 60,
    };

    pendingNodePosition = screenToFlowPosition({
      x: clientX,
      y: clientY,
    });

    pendingConnectionSourceId = sourceNodeId;
    addMenuOpen = true;
    addMenuOpenVersion += 1;
  }

  function handlePaneContextMenu(payload) {
    const pointerEvent = payload?.event;
    if (!pointerEvent) {
      return;
    }

    pointerEvent.preventDefault();
    openAddNodeMenu(pointerEvent);
  }

  function handlePaneClick() {
    if (skipNextPaneClickClose) {
      skipNextPaneClickClose = false;
      return;
    }

    closeAddNodeMenu();
    emitFlowChange("node-created");
  }

  function handleConnectStart(_pointerEvent, params) {
    connectStartSourceNodeId =
      typeof params?.nodeId === "string" && params.nodeId.trim() ? params.nodeId.trim() : undefined;
  }

  function handleConnectEnd(rawPointerEvent, rawConnectionState) {
    const pointerEvent = extractPointerEvent(rawPointerEvent);
    const connectionState = extractConnectionState(rawPointerEvent, rawConnectionState);
    if (connectionState?.isValid) {
      connectStartSourceNodeId = undefined;
      return;
    }

    const sourceNodeId =
      connectionState?.fromNode?.id ??
      connectStartSourceNodeId ??
      nodes?.[0]?.id ??
      "Node-00000000-0000-0000-0000-000000000000";

    // Prevent immediate close when the same mouse-up emits a pane click right after connect-end.
    skipNextPaneClickClose = true;
    openAddNodeMenu(pointerEvent, sourceNodeId);
    connectStartSourceNodeId = undefined;
  }

  function handleMenuSelect(event) {
    const template = event?.detail?.template;
    if (!template) {
      return;
    }

    const newNodeId = `${normalizeNodeType(template.defaultTypeName)}-${createUuid()}`;
    const newNode = {
      id: newNodeId,
      type: CUSTOM_NODE_TYPE,
      data: {
        label: template.label,
        Type: template.defaultTypeName,
        $templateId: template.templateId,
        $fieldValues: template.buildInitialValues(),
      },
      position: {
        ...pendingNodePosition,
      },
      origin: [0.5, 0.0],
    };

    nodes = [...nodes, newNode];

    if (typeof pendingConnectionSourceId === "string" && pendingConnectionSourceId.trim()) {
      edges = [
        ...edges,
        {
          id: `${pendingConnectionSourceId}--${newNodeId}`,
          source: pendingConnectionSourceId,
          target: newNodeId,
        },
      ];
    }

    closeAddNodeMenu();
  }

  function createDefaultNodes() {
    const defaultTemplate = SAMPLE_NODE_TEMPLATES[0];

    return [
      {
        id: "Node-00000000-0000-0000-0000-000000000000",
        type: CUSTOM_NODE_TYPE,
        data: {
          label: defaultTemplate.label,
          Type: defaultTemplate.defaultTypeName,
          $templateId: defaultTemplate.templateId,
          $fieldValues: defaultTemplate.buildInitialValues(),
        },
        position: { x: 0, y: 50 },
      },
    ];
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

  function normalizeNodeType(candidate) {
    if (typeof candidate === "string") {
      const cleaned = candidate.trim().replace(/[^A-Za-z0-9_]/g, "");
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
    templates={SAMPLE_NODE_TEMPLATES}
    on:close={closeAddNodeMenu}
    on:select={handleMenuSelect}
  />
</div>
