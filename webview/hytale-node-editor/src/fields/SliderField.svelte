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
  $: committedNumericValue = Number.isFinite(Number(value)) ? Number(value) : min;
  $: if (!hasPendingValue && draftNumericValue !== committedNumericValue) {
    draftNumericValue = committedNumericValue;
  }
  $: label = `${baseLabel} (${draftNumericValue})`;
  $: inputId = `slider-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;

  let draftNumericValue = min;
  let hasPendingValue = false;
  let lastInteractionMode = 'unknown';

  function emitValue(nextValue) {
    dispatch('change', { value: nextValue });
  }

  function handleInput(event) {
    const parsedValue = Number(event.currentTarget.value);
    draftNumericValue = Number.isFinite(parsedValue) ? parsedValue : min;
    hasPendingValue = draftNumericValue !== committedNumericValue;
  }

  function handlePointerDown() {
    lastInteractionMode = 'pointer';
  }

  function handleKeyDown(event) {
    const navigationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    if (navigationKeys.includes(event.key)) {
      lastInteractionMode = 'keyboard';
    }
  }

  function commitPendingValue() {
    if (!hasPendingValue) {
      return;
    }

    emitValue(draftNumericValue);
    hasPendingValue = false;
  }

  function handleChange() {
    if (lastInteractionMode === 'pointer') {
      commitPendingValue();
    }
  }

  function handleBlur() {
    commitPendingValue();
    lastInteractionMode = 'unknown';
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
    value={draftNumericValue}
    onpointerdown={handlePointerDown}
    oninput={handleInput}
    onchange={handleChange}
    onkeydown={handleKeyDown}
    onblur={handleBlur}
  />
</div>
