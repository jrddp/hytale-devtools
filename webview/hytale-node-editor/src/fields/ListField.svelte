<script>
  import { createEventDispatcher } from 'svelte';
  import {
    createDefaultFieldValue,
    getFieldLabel,
    getListElementType,
    normalizeFieldOptions,
  } from '../node-editor/fieldValueUtils.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: elementType = getListElementType(field);
  $: listValue = Array.isArray(value) ? value : [];

  function emitValue(nextValue) {
    dispatch('change', { value: nextValue });
  }

  function createDefaultItem() {
    return createDefaultFieldValue({
      type: elementType,
      options: options.ElementOptions ?? {},
    });
  }

  function addItem() {
    emitValue([...listValue, createDefaultItem()]);
  }

  function removeItem(index) {
    emitValue(listValue.filter((_, entryIndex) => entryIndex !== index));
  }

  function updateItem(index, nextItem) {
    const nextList = listValue.slice();
    nextList[index] = nextItem;
    emitValue(nextList);
  }

  function updateTextItem(index, nextText) {
    updateItem(index, nextText);
  }

  function updateNumberItem(index, nextText) {
    const parsed = Number(nextText);
    updateItem(index, Number.isFinite(parsed) ? parsed : 0);
  }

  function updateBooleanItem(index, checked) {
    updateItem(index, Boolean(checked));
  }

  function updateObjectItem(index, nextText) {
    try {
      const parsed = JSON.parse(nextText);
      if (parsed !== null && typeof parsed === 'object') {
        updateItem(index, parsed);
      }
    } catch {
      // Wait for valid JSON input before applying.
    }
  }

  function formatObjectValue(item) {
    try {
      return JSON.stringify(item ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }
</script>

<div class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2">
  <div class="flex items-center justify-between gap-2">
    <div class="text-xs font-bold uppercase text-vsc-muted">{label}</div>
    <button
      class="rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
      type="button"
      onclick={addItem}
    >
      Add
    </button>
  </div>

  {#if listValue.length === 0}
    <div class="text-xs text-vsc-muted">No items</div>
  {:else}
    <div class="flex flex-col gap-1.5">
      {#each listValue as item, index}
        <div class="flex items-start gap-1.5">
          <div class="flex-1">
            {#if elementType === 'Checkbox' || elementType === 'Bool'}
              <input
                class="nodrag h-4 w-4"
                type="checkbox"
                checked={Boolean(item)}
                onchange={(event) => updateBooleanItem(index, event.currentTarget.checked)}
              />
            {:else if elementType === 'Int' || elementType === 'Integer' || elementType === 'IntSlider' || elementType === 'Float'}
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                type="number"
                value={Number.isFinite(Number(item)) ? Number(item) : 0}
                oninput={(event) => updateNumberItem(index, event.currentTarget.value)}
              />
            {:else if elementType === 'Object'}
              <textarea
                class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                rows="3"
                value={formatObjectValue(item)}
                oninput={(event) => updateObjectItem(index, event.currentTarget.value)}
              ></textarea>
            {:else}
              <input
                class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                type="text"
                value={typeof item === 'string' ? item : String(item ?? '')}
                oninput={(event) => updateTextItem(index, event.currentTarget.value)}
              />
            {/if}
          </div>
          <button
            class="rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
            type="button"
            onclick={() => removeItem(index)}
          >
            Remove
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="text-xs text-vsc-muted">Element type: {elementType}</div>
</div>
