<script>
  import {
    useNodeConnections,
    useSvelteFlow,
  } from "@xyflow/svelte";
  import { MessageCircleMore, Pencil } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import NodeCommentEditor from "./NodeCommentEditor.svelte";
  import NodePinHandle from "./NodePinHandle.svelte";
  import {
    findTemplateByTypeName,
    getTemplateById,
  } from "../node-editor/templateCatalog.js";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/focusNavigation.js";
  import { getDefaultPinColor } from "../node-editor/pinColorUtils.js";
  import {
    CUSTOM_NODE_TYPE,
    LINK_INPUT_HANDLE_ID,
    LINK_MUTATION_EVENT,
    LINK_NODE_TYPE,
    LINK_OUTPUT_HANDLE_ID,
  } from "../node-editor/types.js";

  const DEFAULT_NODE_LABEL = "Link";
  const DEFAULT_OUTPUT_LABEL = "Children";
  const DEFAULT_LINK_PIN_COLOR = "var(--vscode-descriptionForeground)";
  const INPUT_LABEL = "Input";
  const PIN_WIDTH = 10;
  const PIN_TOP = "50%";
  const NODE_MIN_WIDTH_BASE_PX = 80;

  export let id;
  export let data = {};
  export let selected = false;
  export let dragging = false;

  let graphRevision = 0;
  const inputConnectionsStore = useNodeConnections({
    handleType: "target",
    handleId: LINK_INPUT_HANDLE_ID,
    onConnect() {
      graphRevision += 1;
    },
    onDisconnect() {
      graphRevision += 1;
    },
  });
  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();

  $: nodeLabel = typeof data?.label === "string" && data.label.trim()
    ? data.label.trim()
    : DEFAULT_NODE_LABEL;
  $: commentInputId = `comment-${sanitizeId(id)}`;
  $: commentValue = typeof data?.$comment === "string" ? data.$comment : "";
  $: inputConnections = readInputConnections(inputConnectionsStore, graphRevision);
  $: primaryInputConnection = readPrimaryInputConnection(inputConnections);
  $: {
    graphRevision;
    allEdges = getEdges();
    allNodes = getNodes();
  }
  $: sourceDescriptor = resolveSourceHandleDescriptor({
    edges: allEdges,
    nodes: allNodes,
    sourceNodeId: primaryInputConnection?.source,
    sourceHandleId: primaryInputConnection?.sourceHandle,
    visitedNodeIds: new Set([normalizeOptionalString(id)]),
  });
  $: inputPinColor = normalizeOptionalString(sourceDescriptor?.color) ?? DEFAULT_LINK_PIN_COLOR;
  $: outputPinLabel = normalizeOptionalString(sourceDescriptor?.label) ?? DEFAULT_OUTPUT_LABEL;
  $: outputPinColor = normalizeOptionalString(sourceDescriptor?.color) ?? DEFAULT_LINK_PIN_COLOR;
  $: outputPinMultiplicity = sourceDescriptor?.connectionMultiplicity ?? "single";
  $: sourceDescriptorSignature = readSourceDescriptorSignature(sourceDescriptor);
  $: outputLabelColumnWidth = readOutputLabelColumnWidth(outputPinLabel);
  $: nodeMinWidthPx = NODE_MIN_WIDTH_BASE_PX + outputLabelColumnWidth;
  $: {
    if (lastSourceDescriptorSignature === undefined) {
      lastSourceDescriptorSignature = sourceDescriptorSignature;
    } else if (sourceDescriptorSignature !== lastSourceDescriptorSignature) {
      lastSourceDescriptorSignature = sourceDescriptorSignature;
      notifyLinkMutation("link-source-descriptor-updated");
    }
  }
  $: if (!isEditingTitle) {
    titleDraft = nodeLabel;
  }

  let isEditingTitle = false;
  let titleDraft = "";
  let titleInputElement;
  let commentEditor;
  let isCommentVisible = false;
  let allEdges = [];
  let allNodes = [];
  let inputConnections = [];
  let sourceDescriptorSignature = "";
  let lastSourceDescriptorSignature = undefined;

  onMount(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      return;
    }

    const handleLinkMutation = (event) => {
      const eventNodeId = normalizeOptionalString(event?.detail?.nodeId);
      if (eventNodeId === normalizeOptionalString(id)) {
        return;
      }

      graphRevision += 1;
    };

    window.addEventListener(LINK_MUTATION_EVENT, handleLinkMutation);

    return () => {
      window.removeEventListener(LINK_MUTATION_EVENT, handleLinkMutation);
    };
  });

  function updateLabel(nextLabel) {
    updateNodeData(id, {
      label: nextLabel,
    });
    notifyLinkMutation("link-label-updated");
  }

  function updateComment(nextComment) {
    const normalizedComment = typeof nextComment === "string" ? nextComment : "";
    updateNodeData(id, {
      $comment: normalizedComment,
    });
    notifyLinkMutation("link-comment-updated");
  }

  function selectNodeFromTitleBar(event) {
    const isMultiSelect = Boolean(event?.metaKey || event?.ctrlKey);
    const currentNodes = getNodes();

    for (const node of currentNodes) {
      const shouldSelect = node.id === id ? true : isMultiSelect ? Boolean(node.selected) : false;

      if (node.selected !== shouldSelect) {
        updateNode(node.id, { selected: shouldSelect });
      }
    }

    if (isMultiSelect) {
      return;
    }

    const currentEdges = getEdges();
    for (const edge of currentEdges) {
      if (edge.selected) {
        updateEdge(edge.id, { selected: false });
      }
    }
  }

  async function beginTitleEditing() {
    isEditingTitle = true;
    titleDraft = nodeLabel;
    await tick();
    titleInputElement?.focus();
    titleInputElement?.select();
  }

  function commitTitleEditing(moveFocus = false) {
    if (!isEditingTitle) {
      return;
    }

    updateLabel(titleDraft);
    isEditingTitle = false;

    if (moveFocus) {
      if (!focusNextEditableInNode(titleInputElement)) {
        titleInputElement?.blur();
      }
    }
  }

  function cancelTitleEditing() {
    if (!isEditingTitle) {
      return;
    }

    isEditingTitle = false;
    titleDraft = nodeLabel;
  }

  function handleTitleInputKeydown(event) {
    if (isPlainEnterNavigationEvent(event)) {
      event.preventDefault();
      commitTitleEditing(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelTitleEditing();
      titleInputElement?.blur();
    }
  }

  function handleTitleInputBlur() {
    commitTitleEditing(false);
  }

  function handleTitleDisplayKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void beginTitleEditing();
    }
  }

  function beginCommentEditingFromButton() {
    void commentEditor?.startEditing(false);
  }

  function handleCommentSelect(event) {
    selectNodeFromTitleBar(event.detail?.originalEvent);
  }

  function notifyLinkMutation(reason) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(LINK_MUTATION_EVENT, {
        detail: {
          nodeId: id,
          reason,
        },
      }),
    );
  }

  function sanitizeId(candidate) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      return "node";
    }
    return candidate.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function normalizeOptionalString(candidate) {
    return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
  }

  function isLinkInputHandleId(candidateHandleId) {
    const normalizedHandleId = normalizeOptionalString(candidateHandleId);
    return normalizedHandleId === undefined || normalizedHandleId === LINK_INPUT_HANDLE_ID;
  }

  function findInputEdgeForLinkNode(edges, linkNodeId) {
    const normalizedNodeId = normalizeOptionalString(linkNodeId);
    if (!normalizedNodeId || !Array.isArray(edges)) {
      return undefined;
    }

    return edges.find(
      (edge) =>
        normalizeOptionalString(edge?.target) === normalizedNodeId &&
        isLinkInputHandleId(edge?.targetHandle),
    );
  }

  function readInputConnections(store, _graphRevision) {
    void _graphRevision;
    return Array.isArray(store?.current) ? store.current : [];
  }

  function readPrimaryInputConnection(connections) {
    if (!Array.isArray(connections) || connections.length === 0) {
      return undefined;
    }

    // Keep selection deterministic if malformed data somehow yields multiple inputs.
    const sortedConnections = [...connections].sort((leftConnection, rightConnection) => {
      const leftEdgeId = normalizeOptionalString(leftConnection?.edgeId) ?? "";
      const rightEdgeId = normalizeOptionalString(rightConnection?.edgeId) ?? "";
      return leftEdgeId.localeCompare(rightEdgeId);
    });

    return sortedConnections[0];
  }

  function resolveSourceHandleDescriptor({
    edges,
    nodes,
    sourceNodeId,
    sourceHandleId,
    visitedNodeIds = new Set(),
  }) {
    const normalizedSourceNodeId = normalizeOptionalString(sourceNodeId);
    if (!normalizedSourceNodeId || visitedNodeIds.has(normalizedSourceNodeId)) {
      return undefined;
    }

    const nextVisitedNodeIds = new Set(visitedNodeIds);
    nextVisitedNodeIds.add(normalizedSourceNodeId);

    const sourceNode = Array.isArray(nodes)
      ? nodes.find((node) => normalizeOptionalString(node?.id) === normalizedSourceNodeId)
      : undefined;
    if (!sourceNode) {
      return undefined;
    }

    const sourceNodeType = normalizeOptionalString(sourceNode?.type);
    if (sourceNodeType === LINK_NODE_TYPE) {
      const upstreamEdge = findInputEdgeForLinkNode(edges, normalizedSourceNodeId);
      if (!upstreamEdge) {
        return undefined;
      }

      return resolveSourceHandleDescriptor({
        edges,
        nodes,
        sourceNodeId: upstreamEdge.source,
        sourceHandleId: upstreamEdge.sourceHandle,
        visitedNodeIds: nextVisitedNodeIds,
      });
    }

    if (sourceNodeType !== CUSTOM_NODE_TYPE) {
      return undefined;
    }

    const templateId = normalizeOptionalString(sourceNode?.data?.$templateId);
    const template =
      (templateId ? getTemplateById(templateId) : undefined) ??
      findTemplateByTypeName(sourceNode?.data?.Type);
    const outputPins = Array.isArray(template?.outputPins) ? template.outputPins : [];
    if (outputPins.length === 0) {
      return undefined;
    }

    const normalizedSourceHandleId = normalizeOptionalString(sourceHandleId);
    let sourcePin = outputPins.find(
      (pin) => normalizeOptionalString(pin?.id) === normalizedSourceHandleId,
    );
    if (!sourcePin && !normalizedSourceHandleId && outputPins.length === 1) {
      sourcePin = outputPins[0];
    }
    if (!sourcePin) {
      sourcePin = outputPins[0];
    }
    if (!sourcePin) {
      return undefined;
    }

    return {
      label: readPinLabel(sourcePin),
      color: normalizeOptionalString(sourcePin?.color) ?? getDefaultPinColor(),
      connectionMultiplicity: readPinConnectionMultiplicity(sourcePin),
    };
  }

  function readPinLabel(pin) {
    if (typeof pin?.label === "string" && pin.label.trim()) {
      return pin.label.trim();
    }

    if (typeof pin?.id === "string" && pin.id.trim()) {
      return pin.id.trim();
    }

    return undefined;
  }

  function readPinConnectionMultiplicity(pin) {
    if (pin?.isMap === true) {
      return "map";
    }

    if (pin?.multiple === true) {
      return "multiple";
    }

    return "single";
  }

  function readSourceDescriptorSignature(descriptor) {
    const normalizedLabel = normalizeOptionalString(descriptor?.label) ?? "";
    const normalizedColor = normalizeOptionalString(descriptor?.color) ?? "";
    const normalizedMultiplicity =
      descriptor?.connectionMultiplicity === "map"
        ? "map"
        : descriptor?.connectionMultiplicity === "multiple"
          ? "multiple"
          : "single";

    return `${normalizedLabel}|${normalizedColor}|${normalizedMultiplicity}`;
  }

  function readOutputLabelColumnWidth(label) {
    const normalizedLabel = normalizeOptionalString(label);
    if (!normalizedLabel) {
      return 0;
    }

    return normalizedLabel.length * 7 + PIN_WIDTH + 4;
  }
</script>

<div
  class="relative border border-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
  style="min-width: {nodeMinWidthPx}px;"
  data-node-editor-root
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg"
    style="background-color: {DEFAULT_LINK_PIN_COLOR};"
  ></div>

  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1 rounded-t-lg bg-vsc-input-bg text-vsc-input-fg">
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="w-full p-2 font-bold border rounded-t-lg border-vsc-input-border"
          type="text"
          value={titleDraft}
          oninput={event => (titleDraft = event.currentTarget.value)}
          onkeydown={handleTitleInputKeydown}
          onblur={handleTitleInputBlur}
        />
      {:else}
        <div
          class="flex items-center flex-1 gap-1 p-2 cursor-grab active:cursor-grabbing"
          role="group"
          aria-label="Node title bar"
          onpointerdown={selectNodeFromTitleBar}
        >
          <button
            class="min-w-0 font-bold text-left border border-transparent rounded-md select-none text-vsc-input-fg cursor-grab active:cursor-grabbing"
            type="button"
            ondblclick={beginTitleEditing}
            onkeydown={handleTitleDisplayKeydown}
          >
            {nodeLabel}
          </button>

          <button
            class="inline-flex items-center justify-center rounded-md nodrag size-4 hover:backdrop-brightness-90"
            type="button"
            title="Edit node title"
            aria-label="Edit node title"
            onclick={beginTitleEditing}
          >
            <Pencil strokeWidth={2.5} aria-hidden="true" />
          </button>

          <button
            class="inline-flex items-center justify-center ml-auto rounded-md nodrag size-4 hover:backdrop-brightness-90"
            type="button"
            title="Edit node comment"
            aria-label="Edit node comment"
            aria-expanded={isCommentVisible}
            aria-controls={commentInputId}
            onclick={beginCommentEditingFromButton}
          >
            <MessageCircleMore strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      {/if}
    </div>

    <NodeCommentEditor
      bind:this={commentEditor}
      bind:isVisible={isCommentVisible}
      id={commentInputId}
      value={commentValue}
      on:change={event => updateComment(event.detail.value)}
      on:select={handleCommentSelect}
    />
  </div>

  <div class="relative py-3" style="padding-left: {PIN_WIDTH + 8}px; padding-right: {outputLabelColumnWidth + 8}px;">
    <NodePinHandle
      type="target"
      side="left"
      id={LINK_INPUT_HANDLE_ID}
      top={PIN_TOP}
      width={PIN_WIDTH}
      label={INPUT_LABEL}
      showTooltip={true}
      color={inputPinColor}
    />

    <NodePinHandle
      type="source"
      side="right"
      id={LINK_OUTPUT_HANDLE_ID}
      top={PIN_TOP}
      width={PIN_WIDTH}
      color={outputPinColor}
      connectionMultiplicity={outputPinMultiplicity}
    />
    <div
      class="pointer-events-none absolute pr-1 -translate-y-1/2 text-right text-[11px] text-vsc-muted whitespace-nowrap"
      style="top: {PIN_TOP}; right: {PIN_WIDTH}px;"
    >
      {outputPinLabel}
    </div>
  </div>
</div>
