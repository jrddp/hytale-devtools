<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";

  let {
    schemaKey,
    type,
    label,
    value,
    onchange,
  }: NodeField & { onchange: (value: unknown) => void } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const committedValue = $derived(typeof value === "string" ? value : String(value ?? ""));
  const isMultiline = $derived(type === "text");
  const inputId = $derived(`text-${schemaKey ?? "field"}-${type}`);

  let isEditing = $state(false);
  let draftValue = $state("");

  $effect(() => {
    if (!isEditing) {
      draftValue = committedValue;
    }
  });

  function emitValue(nextValue: string) {
    onchange(nextValue);
  }

  function beginEditing() {
    isEditing = true;
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
    draftValue = event.currentTarget.value;
  }

  function commitEditing() {
    if (!isEditing) {
      return;
    }

    isEditing = false;
    if (draftValue !== committedValue) {
      emitValue(draftValue);
    }
  }

  function handleSingleLineEnter(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (!isPlainEnterNavigationEvent(event)) {
      return;
    }

    event.preventDefault();
    if (!focusNextEditableInNode(event.currentTarget)) {
      event.currentTarget.blur();
    }
  }
</script>

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted" for={inputId}>{fieldLabel}</label>
  {#if isMultiline}
    <textarea
      id={inputId}
      class="nodrag min-h-10 w-full resize-none rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg h-20"
      rows="4"
      value={draftValue}
      onfocus={beginEditing}
      oninput={handleInput}
      onblur={commitEditing}
    ></textarea>
  {:else}
    <input
      id={inputId}
      class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      type="text"
      value={draftValue}
      onfocus={beginEditing}
      oninput={handleInput}
      onkeydown={handleSingleLineEnter}
      onblur={commitEditing}
    />
  {/if}
</div>
