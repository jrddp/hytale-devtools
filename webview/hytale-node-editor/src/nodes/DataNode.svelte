<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { MessageCircleMore, Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import {
    CUSTOM_MUTATION_EVENT,
    type DataNodeType,
    INPUT_HANDLE_ID,
  } from "../node-editor/graph/graphTypes";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import { getDefaultPinColor } from "../node-editor/utils/pinColorUtils";
  import NodeCommentEditor from "./NodeCommentEditor.svelte";
  import NodePinHandle from "./NodePinHandle.svelte";

  let { id, data, selected = false, dragging = false }: DataNodeType = $props();

  let {
    nodeColor,
    outputPins,
    inputPins,
    fieldsBySchemaKey,
    titleOverride,
    defaultTitle,
    inputConnectionIndex,
  } = $derived(data);

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();
  const PIN_TOP_START_PX = 16;
  const PIN_TOP_STEP_PX = 32;
  const PIN_TOP_MAX_PX = 220;
  const PIN_BOTTOM_CLEARANCE_PX = 32;
  const PIN_WIDTH = 10;
  const NODE_MIN_WIDTH_WITH_CONTENT_PX = 288;
  const NODE_MIN_WIDTH_WITHOUT_CONTENT_PX = 80;

  let hasContentFields = $derived(Object.keys(data.fieldsBySchemaKey).length > 0);

  let outputLabelColumnWidth = $derived(readOutputLabelColumnWidth(outputPins));
  let nodeMinWidthPx = $derived(
    (hasContentFields ? NODE_MIN_WIDTH_WITH_CONTENT_PX : NODE_MIN_WIDTH_WITHOUT_CONTENT_PX) +
      outputLabelColumnWidth,
  );
  let contentPaddingLeftPx = $derived(PIN_WIDTH + 8);
  let contentRightPaddingPx = $derived(outputLabelColumnWidth + 8);
  let pinLaneCount = $derived(Math.max(inputPins.length, outputPins.length));
  let contentMinHeightPx = $derived(
    readPinTopPx(pinLaneCount - 1, pinLaneCount) + PIN_BOTTOM_CLEARANCE_PX,
  );
  let nodeAccentColor = $derived(nodeColor ?? getDefaultPinColor());
  let nodeLabel = $derived(titleOverride ?? defaultTitle);
  let inputConnectionIndexPrefix = $derived(
    inputConnectionIndex !== undefined ? `[${inputConnectionIndex}]` : undefined,
  );
  let commentInputId = $derived(`comment-${id ?? "node"}`);
  let commentValue = $derived(typeof data?.comment === "string" ? data.comment : "");

  $effect(() => {
    if (!isEditingTitle) {
      titleDraft = nodeLabel;
    }
  });

  let isEditingTitle = $state(false);
  let titleDraft = $state("");
  let titleInputElement = $state<HTMLInputElement | undefined>();
  let isCommentVisible = $state(false);
  let commentEditor: NodeCommentEditor | undefined;

  function updateLabel(nextLabel) {
    updateNodeData(id, {
      titleOverride: nextLabel,
    });
    notifyCustomMutation("custom-label-updated");
  }

  function selectNodeFromTitleBar(event) {
    // let SvelteFlow handle Shift-based additive/toggle selection semantics.
    if (event?.shiftKey) {
      return;
    }

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

  function updateComment(nextComment) {
    updateNodeData(id, {
      comment: nextComment ?? "",
    });
    notifyCustomMutation("custom-comment-updated");
  }

  function updateField(schemaKey: string, nextValue: unknown) {
    updateNodeData(id, {
      fieldsBySchemaKey: {
        ...fieldsBySchemaKey,
        [schemaKey]: {
          ...fieldsBySchemaKey[schemaKey],
          value: nextValue,
        },
      },
    });
    notifyCustomMutation("custom-field-updated");
  }

  function notifyCustomMutation(reason) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(CUSTOM_MUTATION_EVENT, {
        detail: {
          nodeId: id,
          reason,
        },
      }),
    );
  }

  function readPinLabel(pin) {
    if (typeof pin?.label === "string") {
      return pin.label;
    }

    if (typeof pin?.id === "string") {
      return pin.id;
    }

    return "";
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

  function readPinTop(index, totalPins) {
    return `${readPinTopPx(index, totalPins)}px`;
  }

  function readPinTopPx(index, totalPins) {
    const total = Number(totalPins) || 1;
    const indexValue = Number(index) || 0;
    const availableRange = Math.max(0, PIN_TOP_MAX_PX - PIN_TOP_START_PX);
    const spacing = total <= 1 ? 0 : Math.min(PIN_TOP_STEP_PX, availableRange / (total - 1));

    return PIN_TOP_START_PX + indexValue * spacing;
  }

  function readOutputLabelColumnWidth(pins) {
    if (!Array.isArray(pins) || pins.length === 0) {
      return 0;
    }

    const maxLabelLength = pins.reduce(
      (maxLength, pin) => Math.max(maxLength, readPinLabel(pin).length),
      0,
    );

    const estimatedWidth = maxLabelLength * 7 + PIN_WIDTH + 4;
    return estimatedWidth;
  }

  function readInputConnectionIndex(candidateIndex) {
    if (candidateIndex === undefined || candidateIndex === null) {
      return undefined;
    }

    return Number(candidateIndex);
  }
</script>

<div
  class="relative pt-0 border border-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow]"
  style="min-width: {nodeMinWidthPx}px; outline: {selected && !dragging
    ? '2px solid var(--vscode-focusBorder)'
    : 'none'};"
  data-node-editor-root
>
  <div
    aria-hidden="true"
    class="absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg pointer-events-none"
    style="background-color: {nodeAccentColor};"
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
            {#if inputConnectionIndexPrefix !== undefined}
              <span class="mr-1 text-vsc-muted">{inputConnectionIndexPrefix}</span>
            {/if}
            <span>{nodeLabel}</span>
          </button>

          <button
            class="inline-flex items-center justify-center rounded-md nodrag size-4 hover:backdrop-brightness-90"
            type="button"
            title="Edit node title"
            aria-label="Edit node title"
            onclick={beginTitleEditing}
          >
            <Pencil strokeWidth={2.5} aria-hidden="true" class="" />
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

  <div
    class="relative py-2"
    style="padding-left: {contentPaddingLeftPx}px; padding-right: {contentRightPaddingPx}px; min-height: {contentMinHeightPx}px;"
  >
    {#each inputPins as pin, index}
      {@const pinTop = readPinTop(index, inputPins.length)}
      {@const pinLabel = readPinLabel(pin)}
      <NodePinHandle
        type="target"
        side="left"
        id={INPUT_HANDLE_ID + (index > 0 ? `-${index}` : "")}
        top={pinTop}
        width={PIN_WIDTH}
        label={pinLabel}
        showTooltip={inputPins.length > 1}
        color={pin.color}
      />
    {/each}

    <div class="flex flex-col gap-2">
      {#each Object.entries(fieldsBySchemaKey) as [schemaKey, field] (schemaKey)}
        <FieldEditor {...field} onchange={value => updateField(field.schemaKey, value)} />
      {/each}
    </div>

    {#each outputPins as pin, index (pin.schemaKey)}
      {@const pinTop = readPinTop(index, outputPins.length)}
      {@const pinMultiplicity = readOutputPinConnectionMultiplicity(pin)}
      <NodePinHandle
        type="source"
        side="right"
        id={pin.schemaKey}
        top={pinTop}
        width={PIN_WIDTH}
        color={pin.color}
        connectionMultiplicity={pinMultiplicity}
      />
      <div
        class="pointer-events-none absolute pr-1 -translate-y-1/2 text-right text-[11px] text-vsc-muted whitespace-nowrap"
        style="top: {pinTop}; right: {PIN_WIDTH}px;"
      >
        {readPinLabel(pin)}
      </div>
    {/each}
  </div>
</div>
