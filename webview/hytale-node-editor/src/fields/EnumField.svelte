<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import { buildFieldInputId, noMousePropogation } from "./fieldInteractions";

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
  const inputId = $derived(buildFieldInputId("enum", nodeId, schemaKey, type));

  let isEditing = $state(false);
  let draftText = $state("");
  let inputElement: HTMLInputElement | undefined = undefined;

  $effect(() => {
    if (!isEditing) {
      draftText = committedValue;
    }
  });

  function emitValue(nextValue: string) {
    onchange(nextValue);
  }

  function beginEditing() {
    isEditing = true;
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    draftText = event.currentTarget.value;
  }

  function commitEditing(moveFocus: boolean) {
    if (!isEditing) {
      return;
    }

    isEditing = false;
    if (draftText !== committedValue) {
      emitValue(draftText);
    }

    if (moveFocus) {
      if (inputElement && !focusNextEditableInNode(inputElement)) {
        inputElement.blur();
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (!isPlainEnterNavigationEvent(event)) {
      return;
    }

    event.preventDefault();
    commitEditing(true);
  }
</script>

<div class="relative flex flex-col gap-1">
  <label class="text-xs text-vsc-muted w-fit" for={inputId}>{fieldLabel}</label>
  <input
    bind:this={inputElement}
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="text"
    value={draftText}
    onfocus={beginEditing}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    onblur={() => commitEditing(false)}
    {...noMousePropogation}
  />
</div>
