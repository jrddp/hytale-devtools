<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import {
    buildFieldInputId,
    noMousePropogation
  } from "./fieldInteractions";

  let {
    nodeId,
    schemaKey,
    type,
    label,
    value,
    onchange,
  }: NodeField & { nodeId?: string; onchange: (value: unknown) => void } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const committedValue = $derived(typeof value === "string" ? value : String(value ?? ""));
  const inputId = $derived(buildFieldInputId("path", nodeId, schemaKey, type));

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

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
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

  function handleEnterNavigation(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
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
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{fieldLabel}</label>
  <input
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="text"
    value={draftValue}
    onfocus={beginEditing}
    oninput={handleInput}
    onkeydown={handleEnterNavigation}
    onblur={commitEditing}
    placeholder="path/to/file.json"
    spellcheck="false"
    {...noMousePropogation}
  />
</div>
