<script>
  import { Handle, Position, useSvelteFlow } from "@xyflow/svelte";
  import { Pencil } from "lucide-svelte";
  import { tick } from "svelte";
  import FieldEditor from "../fields/FieldEditor.svelte";
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

  export let id;
  export let data = {};

  const { updateNodeData } = useSvelteFlow();

  $: template =
    getTemplateById(data?.$templateId) ??
    findTemplateByTypeName(data?.Type) ??
    findTemplateByTypeName(data?.label) ??
    getDefaultTemplate();

  $: initialValues = template?.buildInitialValues?.() ?? buildFieldValueMap(template?.fields ?? []);
  $: existingFieldValues = isObject(data?.$fieldValues) ? data.$fieldValues : {};
  $: mergedFieldValues = {
    ...initialValues,
    ...existingFieldValues,
  };
  $: inputPins = Array.isArray(template?.inputPins) ? template.inputPins : [];
  $: outputPins = Array.isArray(template?.outputPins) ? template.outputPins : [];
  $: nodeLabel = typeof data?.label === "string" ? data.label : template.label;
  $: commentInputId = `comment-${sanitizeId(id)}`;
  $: if (!isEditingTitle) {
    titleDraft = nodeLabel;
  }

  let isEditingTitle = false;
  let titleDraft = "";
  let titleInputElement;

  function updateLabel(nextLabel) {
    updateNodeData(id, {
      label: nextLabel,
      $templateId: template.templateId,
    });
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
    if (!Number.isFinite(index) || !Number.isFinite(totalPins) || totalPins <= 1) {
      return "50%";
    }

    const normalizedIndex = Math.max(0, Math.floor(index));
    const normalizedTotal = Math.max(1, Math.floor(totalPins));
    const spacing = 100 / (normalizedTotal + 1);
    return `${(normalizedIndex + 1) * spacing}%`;
  }
</script>

<div
  class="relative pt-0 border rounded-lg shadow-lg min-w-72 max-w-80 border-vsc-editor-widget-border bg-vsc-editor-widget-bg text-vsc-editor-fg"
  data-node-editor-root
>
  {#each inputPins as pin, index (pin.id)}
    {@const pinTop = readPinTop(index, inputPins.length)}
    <Handle type="target" position={Position.Left} id={pin.id} style={`top: ${pinTop};`} />
    <div
      class="pointer-events-none absolute text-[11px] text-vsc-muted whitespace-nowrap"
      style={`left: -8px; top: ${pinTop}; transform: translate(-100%, -50%);`}
    >
      {readPinLabel(pin)}
    </div>
  {/each}

  <div class="flex flex-col gap-1 mb-2">
    <div class="flex items-center gap-1">
      {#if isEditingTitle}
        <input
          bind:this={titleInputElement}
          class="w-full p-1 font-bold rounded-t-md bg-vsc-input-bg text-vsc-input-fg"
          type="text"
          value={titleDraft}
          oninput={event => (titleDraft = event.currentTarget.value)}
          onkeydown={handleTitleInputKeydown}
          onblur={handleTitleInputBlur}
        />
      {:else}
        <div class="flex items-center flex-1 gap-1 p-1 rounded-t-md bg-vsc-input-bg">
          <div
            class="font-bold border border-transparent rounded-md select-none text-vsc-input-fg"
            role="button"
            tabindex="0"
            ondblclick={beginTitleEditing}
            onkeydown={handleTitleDisplayKeydown}
          >
            {nodeLabel}
          </div>

          <button
            class="inline-flex items-center justify-center rounded-md nodrag size-5 hover:backdrop-brightness-90 p-0.5"
            type="button"
            title="Edit node title"
            aria-label="Edit node title"
            onclick={beginTitleEditing}
          >
            <Pencil size={12} strokeWidth={2.5} aria-hidden="true" class="" />
          </button>
        </div>
      {/if}
    </div>

    {#if template?.subtitle}
      <div class="text-xs text-vsc-fg px-2.5">{template.subtitle}</div>
    {/if}
  </div>

  <div class="p-2.5 py-1">
    <div class="flex flex-col gap-2">
      {#each template.fields as field}
        <FieldEditor
          {field}
          value={readFieldValue(field)}
          on:change={event => updateField(field, event.detail.value)}
        />
      {/each}

      <div class="flex flex-col gap-1">
        <label class="text-xs text-vsc-muted" for={commentInputId}> Comment </label>
        <textarea
          id={commentInputId}
          class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
          rows="2"
          value={typeof data?.$comment === "string" ? data.$comment : ""}
          oninput={event => updateComment(event.currentTarget.value)}
        ></textarea>
      </div>
    </div>
  </div>

  {#each outputPins as pin, index (pin.id)}
    {@const pinTop = readPinTop(index, outputPins.length)}
    <Handle
      type="source"
      position={Position.Right}
      id={pin.id}
      style={`top: ${pinTop};`}
      class="size-4! bg-teal-500! rounded-none border-none rounded-none!"
    />
    <div
      class="pointer-events-none absolute text-[11px] text-vsc-muted whitespace-nowrap"
      style={`right: -8px; top: ${pinTop}; transform: translate(100%, -50%);`}
    >
      {readPinLabel(pin)}
    </div>
  {/each}
</div>
