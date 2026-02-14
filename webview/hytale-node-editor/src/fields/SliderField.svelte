<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: baseLabel = getFieldLabel(field);
  $: min = Number.isFinite(Number(options.Min)) ? Number(options.Min) : 0;
  $: max = Number.isFinite(Number(options.Max)) ? Number(options.Max) : 100;
  $: step = Number.isFinite(Number(options.TickFrequency)) ? Number(options.TickFrequency) : 1;
  $: numericValue = Number.isFinite(Number(value)) ? Number(value) : min;
  $: label = `${baseLabel} (${numericValue})`;
  $: inputId = `slider-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;

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
  <input
    id={inputId}
    class="nodrag w-full"
    type="range"
    {min}
    {max}
    {step}
    value={numericValue}
    oninput={(event) => emitValue(event.currentTarget.value)}
  />
</div>
