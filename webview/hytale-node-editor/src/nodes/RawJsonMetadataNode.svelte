<script>
  import { useSvelteFlow } from "@xyflow/svelte";
  import { MessageCircleMore, Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
  import NodeCommentEditor from "./NodeCommentEditor.svelte";
  import NodePinHandle from "./NodePinHandle.svelte";
  import { isObject } from "../node-editor/fieldValueUtils.js";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/focusNavigation.js";
  import {
    NODE_INPUT_INDEX_DATA_KEY,
    RAW_JSON_INPUT_HANDLE_ID,
    RAW_JSON_MUTATION_EVENT,
  } from "../node-editor/types.js";

  const RAW_JSON_FIELD = {
    id: "Data",
    label: "Data",
    type: "String",
  };
  const RAW_JSON_DEFAULT_DATA = "{\n\n}";
  const RAW_JSON_DEFAULT_LABEL = "Raw JSON Node";
  const NODE_MIN_WIDTH_PX = 288;
  const NODE_ACCENT_COLOR = "var(--vscode-focusBorder)";
  const PIN_WIDTH = 10;
  const PIN_TOP = "50%";

  export let id;
  export let data = {};
  export let selected = false;
  export let dragging = false;

  const { updateNodeData, updateNode, getNodes, getEdges, updateEdge } = useSvelteFlow();

  $: nodeLabel = typeof data?.label === "string" && data.label.trim()
    ? data.label.trim()
    : RAW_JSON_DEFAULT_LABEL;
  $: inputConnectionIndex = readInputConnectionIndex(data?.[NODE_INPUT_INDEX_DATA_KEY]);
  $: inputConnectionIndexPrefix =
    inputConnectionIndex !== undefined ? `[${inputConnectionIndex}]` : undefined;
  $: commentInputId = `comment-${sanitizeId(id)}`;
  $: commentValue = typeof data?.$comment === "string" ? data.$comment : "";
  $: existingFieldValues = isObject(data?.$fieldValues) ? data.$fieldValues : {};
  $: dataFieldValue =
    typeof existingFieldValues?.[RAW_JSON_FIELD.id] === "string"
      ? existingFieldValues[RAW_JSON_FIELD.id]
      : RAW_JSON_DEFAULT_DATA;
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
    });
    notifyRawJsonMutation("raw-json-label-updated");
  }

  function updateData(nextValue) {
    const nextRawJsonData = typeof nextValue === "string" ? nextValue : RAW_JSON_DEFAULT_DATA;
    if (!isValidRawJsonPayloadBody(nextRawJsonData)) {
      return;
    }

    updateNodeData(id, {
      $fieldValues: {
        ...existingFieldValues,
        [RAW_JSON_FIELD.id]: nextRawJsonData,
      },
    });
    notifyRawJsonMutation("raw-json-field-updated");
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
    });
    notifyRawJsonMutation("raw-json-comment-updated");
  }

  function sanitizeId(candidate) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      return "node";
    }
    return candidate.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function notifyRawJsonMutation(reason) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(RAW_JSON_MUTATION_EVENT, {
        detail: {
          nodeId: id,
          reason,
        },
      }),
    );
  }

  function isValidRawJsonPayloadBody(candidateValue) {
    if (typeof candidateValue !== "string") {
      return false;
    }

    try {
      const parsedValue = JSON.parse(candidateValue);
      return isObject(parsedValue);
    } catch {
      return false;
    }
  }

  function readInputConnectionIndex(candidateIndex) {
    const normalizedIndex = Number(candidateIndex);
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) {
      return undefined;
    }

    return normalizedIndex;
  }
</script>

<div
  class="relative border border-vsc-editor-widget-border rounded-lg shadow-lg bg-vsc-editor-widget-bg text-vsc-editor-fg transition-[border-color,box-shadow]"
  class:border-vsc-focus={selected && !dragging}
  style="min-width: {NODE_MIN_WIDTH_PX}px;"
  data-node-editor-root
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg"
    style="background-color: {NODE_ACCENT_COLOR};"
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

  <div class="px-[18px] py-2">
    <NodePinHandle
      type="target"
      side="left"
      id={RAW_JSON_INPUT_HANDLE_ID}
      top={PIN_TOP}
      width={PIN_WIDTH}
      label="Input"
      showTooltip={true}
      color={NODE_ACCENT_COLOR}
    />

    <FieldEditor
      field={RAW_JSON_FIELD}
      value={dataFieldValue}
      on:change={event => updateData(event.detail.value)}
    />
  </div>
</div>
