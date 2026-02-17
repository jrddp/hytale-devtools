<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from '../node-editor/focusNavigation.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: committedValue = typeof value === 'string' ? value : String(value ?? '');
  $: rows = Math.max(2, Math.round(Number(options.Height) / 24) || 2);
  $: inputId = `text-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;
  $: if (!isEditing && draftValue !== committedValue) {
    draftValue = committedValue;
  }

  let isEditing = false;
  let draftValue = '';

  function emitValue(nextValue) {
    dispatch('change', { value: nextValue });
  }

  function beginEditing() {
    isEditing = true;
  }

  function handleInput(event) {
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

  function handleSingleLineEnter(event) {
    if (!isPlainEnterNavigationEvent(event)) {
      return;
    }

    event.preventDefault();
    if (!focusNextEditableInNode(event.currentTarget)) {
      event.currentTarget.blur();
    }
  }

  function sanitizeId(candidate) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      return 'field';
    }
    return candidate.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
</script>

<div class="flex flex-col gap-1">
  <label class="text-xs text-vsc-muted" for={inputId}>{label}</label>
  {#if field?.type === 'String' || Number(options.Height) > 0}
    <textarea
      id={inputId}
      class="nodrag min-h-10 w-full resize-none rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg h-20"
      rows={rows}
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
