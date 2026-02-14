<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: inputValue = typeof value === 'string' ? value : String(value ?? '');
  $: rows = Math.max(2, Math.round(Number(options.Height) / 24) || 2);
  $: inputId = `text-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;

  function emitValue(nextValue) {
    dispatch('change', { value: nextValue });
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
      class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      rows={rows}
      value={inputValue}
      oninput={(event) => emitValue(event.currentTarget.value)}
    ></textarea>
  {:else}
    <input
      id={inputId}
      class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
      type="text"
      value={inputValue}
      oninput={(event) => emitValue(event.currentTarget.value)}
    />
  {/if}
</div>
