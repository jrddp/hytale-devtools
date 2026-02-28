<script lang="ts">
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { isObject } from "src/node-editor/utils/valueUtils";
  import {
    focusNextEditableInNode,
    isPlainEnterNavigationEvent,
  } from "../node-editor/ui/focusNavigation";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";

  // TODO lists can technically be types other than string. definition requires investigation.
  let { inputId, label, initialValue, onconfirm }: FieldProps<unknown[]> = $props();

  let value = $state<unknown[]>([]);

  $effect(() => {
    if (initialValue) {
      value = initialValue.slice();
    }
  });

  function confirmValue(nextValue: unknown[]) {
    value = nextValue;
    onconfirm(nextValue);
  }

  function addItem() {
    confirmValue([...value, ""]);
  }

  function removeItem(index: number) {
    confirmValue(value.filter((_, entryIndex) => entryIndex !== index));
  }

  function updateItem(index: number, nextItem: unknown) {
    const nextList = value.slice();
    nextList[index] = nextItem;
    confirmValue(nextList);
  }

  function updateTextItem(index: number, nextText: string) {
    updateItem(index, nextText);
  }

  function updateNumberItem(index: number, nextText: string) {
    const parsed = Number(nextText);
    updateItem(index, Number.isFinite(parsed) ? parsed : 0);
  }

  function updateBooleanItem(index: number, checked: boolean) {
    updateItem(index, checked);
  }

  function updateObjectItem(index: number, nextText: string) {
    try {
      const parsed = JSON.parse(nextText);
      if (isObject(parsed)) {
        updateItem(index, parsed);
      }
    } catch {
      // wait until json is valid
    }
  }

  function formatObjectValue(item: unknown) {
    try {
      return JSON.stringify(item ?? {}, null, 2);
    } catch {
      return "{}";
    }
  }

  function handleEnterNavigation(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (!isPlainEnterNavigationEvent(event)) {
      return;
    }

    event.preventDefault();
    if (!focusNextEditableInNode(event.currentTarget)) {
      event.currentTarget.blur();
    }
  }
</script>

<div
  id={inputId}
  class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2"
>
  <div class="flex items-center justify-between gap-2">
    <div class="text-xs font-bold uppercase text-vsc-muted">{label}</div>
    <button
      class="px-2 py-1 text-xs border rounded-md border-vsc-button-border bg-vsc-button-secondary-bg text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
      type="button"
      onclick={addItem}
    >
      Add
    </button>
  </div>

  {#if value.length === 0}
    <div class="text-xs text-vsc-muted">No items</div>
  {:else}
    <div class="flex flex-col gap-1.5">
      {#each value as item, index}
        <div class="flex items-start gap-1.5">
          <div class="flex-1">
            {#if typeof item === "boolean"}
              <input
                class="w-4 h-4 nodrag"
                type="checkbox"
                checked={item}
                onchange={event => updateBooleanItem(index, event.currentTarget.checked)}
                {...noMousePropogation}
              />
            {:else if typeof item === "number"}
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                type="number"
                value={item}
                onchange={event => updateNumberItem(index, event.currentTarget.value)}
                onkeydown={handleEnterNavigation}
                {...noMousePropogation}
              />
            {:else if isObject(item)}
              <textarea
                class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                rows="3"
                value={formatObjectValue(item)}
                onchange={event => updateObjectItem(index, event.currentTarget.value)}
                {...noMousePropogation}
              ></textarea>
            {:else}
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                type="text"
                value={typeof item === "string" ? item : String(item ?? "")}
                onchange={event => updateTextItem(index, event.currentTarget.value)}
                onkeydown={handleEnterNavigation}
                {...noMousePropogation}
              />
            {/if}
          </div>
          <button
            class="px-2 py-1 text-xs border rounded-md border-vsc-button-border bg-vsc-button-secondary-bg text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
            type="button"
            onclick={() => removeItem(index)}
          >
            Remove
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
