<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel } from '../node-editor/fieldValueUtils.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: label = getFieldLabel(field);
  $: checked = Boolean(value);
  $: inputId = `bool-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;

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

<div class="flex flex-row items-center justify-between gap-2">
  <label class="text-xs text-vsc-muted" for={inputId}>{label}</label>
  <input
    id={inputId}
    class="nodrag h-4 w-4"
    type="checkbox"
    checked={checked}
    onchange={(event) => emitValue(event.currentTarget.checked)}
  />
</div>
