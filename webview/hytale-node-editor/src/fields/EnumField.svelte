<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: values = Array.isArray(options.Values)
    ? options.Values.filter((candidate) => typeof candidate === 'string')
    : [];
  $: selectedValue = typeof value === 'string' ? value : values[0] ?? '';
  $: inputId = `enum-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;

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
  <select
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    value={selectedValue}
    onchange={(event) => emitValue(event.currentTarget.value)}
  >
    {#each values as optionValue}
      <option value={optionValue}>{optionValue}</option>
    {/each}
  </select>
</div>
