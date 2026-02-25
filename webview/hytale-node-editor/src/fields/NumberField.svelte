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
  const committedNumericValue = $derived(Number.isFinite(Number(value)) ? Number(value) : 0);
  const committedValue = $derived(String(committedNumericValue));
  const step = $derived(type === "float" ? "any" : "1");
  const inputId = $derived(`number-${schemaKey ?? "field"}-${type}`);

  let isEditing = $state(false);
  let draftValue = $state("");

  $effect(() => {
    if (!isEditing) {
      draftValue = committedValue;
    }
  });

  function emitValue(nextValue: number) {
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
    const parsed = Number(draftValue);
    if (!Number.isFinite(parsed)) {
      draftValue = committedValue;
      return;
    }

    const nextValue = type === "float" ? parsed : Math.trunc(parsed);
    draftValue = String(nextValue);
    if (nextValue !== committedNumericValue) {
      emitValue(nextValue);
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
  <label class="text-xs text-vsc-muted" for={inputId}>{fieldLabel}</label>
  <input
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="number"
    value={draftValue}
    {step}
    onfocus={beginEditing}
    oninput={handleInput}
    onkeydown={handleEnterNavigation}
    onblur={commitEditing}
  />
</div>
