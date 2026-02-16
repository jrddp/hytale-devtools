<script>
  import { useSvelteFlow } from "@xyflow/svelte";
  import { MessageCircleMore, Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import NodeCommentEditor from "./NodeCommentEditor.svelte";
  import NodePinHandle from "./NodePinHandle.svelte";
  import {
    getDefaultTemplate,
    getTemplateById,
    findTemplateByTypeName,
  } from "../node-editor/templateCatalog.js";
  import {
    buildFieldValueMap,
    isObject,
    normalizeFieldValue,
  } from "../node-editor/fieldValueUtils.js";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/focusNavigation.js";
  import { getDefaultPinColor } from "../node-editor/pinColorUtils.js";

  export let id;
  export let data = {};
  export let selected = false;
  export let dragging = false;

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();
  const PIN_TOP_START_PX = 16;
  const PIN_TOP_STEP_PX = 32;
  const PIN_TOP_MAX_PX = 220;
  const PIN_BOTTOM_CLEARANCE_PX = 32;
  const PIN_WIDTH = 10;

  $: template =
    getTemplateById(data?.$templateId) ??
    findTemplateByTypeName(data?.Type) ??
    getDefaultTemplate();

  $: initialValues = template?.buildInitialValues?.() ?? buildFieldValueMap(template?.fields ?? []);
  $: existingFieldValues = isObject(data?.$fieldValues) ? data.$fieldValues : {};
  $: mergedFieldValues = {
    ...initialValues,
    ...existingFieldValues,
  };
  $: inputPins = Array.isArray(template?.inputPins) ? template.inputPins : [];
  $: outputPins = Array.isArray(template?.outputPins) ? template.outputPins : [];
  $: outputLabelColumnWidth = readOutputLabelColumnWidth(outputPins);
  $: nodeMinWidthPx = 288 + outputLabelColumnWidth;
  $: contentPaddingLeftPx = PIN_WIDTH + 8;
  $: contentRightPaddingPx = outputLabelColumnWidth + 8;
  $: pinLaneCount = Math.max(inputPins.length, outputPins.length);
  $: contentMinHeightPx = readPinTopPx(pinLaneCount - 1, pinLaneCount) + PIN_BOTTOM_CLEARANCE_PX;
  $: nodeAccentColor = typeof template?.nodeColor === "string" ? template.nodeColor : getDefaultPinColor();
  $: nodeLabel = typeof data?.label === "string" ? data.label : template.label;
  $: commentInputId = `comment-${sanitizeId(id)}`;
  $: commentValue = typeof data?.$comment === "string" ? data.$comment : "";
  $: hasComment = commentValue.trim().length > 0;
  $: if (!isEditingTitle) {
    titleDraft = nodeLabel;
  }

  let isEditingTitle = false;
  let titleDraft = "";
  let titleInputElement;
  let commentEditor;
  let isCommentVisible = false;

  function updateLabel(nextLabel) {
    updateNodeData(id, {
      label: nextLabel,
      $templateId: template.templateId,
    });
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

  function updateComment(nextComment) {
    const normalizedComment = typeof nextComment === "string" ? nextComment : "";
    updateNodeData(id, {
      $comment: normalizedComment,
      $templateId: template.templateId,
    });
  }

  function updateField(field, nextValue) {
    const currentValues = isObject(data?.$fieldValues) ? data.$fieldValues : {};
    const normalizedValue = normalizeFieldValue(field, nextValue);

    updateNodeData(id, {
      $templateId: template.templateId,
      $fieldValues: {
        ...currentValues,
        [field.id]: normalizedValue,
      },
    });
  }

  function readFieldValue(field) {
    return normalizeFieldValue(field, mergedFieldValues[field.id]);
  }

  function sanitizeId(candidate) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      return "node";
    }
    return candidate.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function readPinLabel(pin) {
    if (typeof pin?.label === "string" && pin.label.trim()) {
      return pin.label.trim();
    }

    if (typeof pin?.id === "string" && pin.id.trim()) {
      return pin.id.trim();
    }

    return "";
  }

  function readPinTop(index, totalPins) {
    return `${readPinTopPx(index, totalPins)}px`;
  }

  function readPinTopPx(index, totalPins) {
    const normalizedTotal = Number.isFinite(totalPins) && totalPins > 0 ? Math.floor(totalPins) : 1;
    const normalizedIndex = Number.isFinite(index) ? Math.floor(index) : 0;
    const clampedIndex = Math.max(0, Math.min(normalizedIndex, normalizedTotal - 1));
    const availableRange = Math.max(0, PIN_TOP_MAX_PX - PIN_TOP_START_PX);
    const spacing =
      normalizedTotal <= 1 ? 0 : Math.min(PIN_TOP_STEP_PX, availableRange / (normalizedTotal - 1));

    return PIN_TOP_START_PX + clampedIndex * spacing;
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
</script>

<div
  class="relative pt-0 border border-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
  style={`min-width: ${nodeMinWidthPx}px;`}
  data-node-editor-root
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg"
    style={`background-color: ${nodeAccentColor};`}
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
    style={`padding-left: ${contentPaddingLeftPx}px; padding-right: ${contentRightPaddingPx}px; min-height: ${contentMinHeightPx}px;`}
  >
    {#each inputPins as pin, index (pin.id)}
      {@const pinTop = readPinTop(index, inputPins.length)}
      {@const pinLabel = readPinLabel(pin)}
      <NodePinHandle
        type="target"
        side="left"
        id={pin.id}
        top={pinTop}
        width={PIN_WIDTH}
        label={pinLabel}
        showTooltip={Boolean(pinLabel)}
        color={pin.color}
      />
    {/each}

    <div class="flex flex-col gap-2">
      {#each template.fields as field}
        <FieldEditor
          {field}
          value={readFieldValue(field)}
          on:change={event => updateField(field, event.detail.value)}
        />
      {/each}
    </div>

    {#each outputPins as pin, index (pin.id)}
      {@const pinTop = readPinTop(index, outputPins.length)}
      <NodePinHandle
        type="source"
        side="right"
        id={pin.id}
        top={pinTop}
        width={PIN_WIDTH}
        color={pin.color}
      />
      <div
        class="pointer-events-none absolute pr-1 -translate-y-1/2 text-right text-[11px] text-vsc-muted whitespace-nowrap"
        style={`top: ${pinTop}; right: ${PIN_WIDTH}px;`}
      >
        {readPinLabel(pin)}
      </div>
    {/each}
  </div>
</div>
