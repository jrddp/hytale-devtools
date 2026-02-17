<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from '../node-editor/focusNavigation.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: committedNumericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  $: committedValue = String(committedNumericValue);
  $: min = Number.isFinite(Number(options.Min)) ? Number(options.Min) : undefined;
  $: max = Number.isFinite(Number(options.Max)) ? Number(options.Max) : undefined;
  $: step = field?.type === 'Float' ? 'any' : '1';
  $: inputId = `number-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;
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

  function handleEnterNavigation(event) {
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
  <input
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="number"
    value={draftValue}
    {step}
    {min}
    {max}
    onfocus={beginEditing}
    oninput={handleInput}
    onkeydown={handleEnterNavigation}
    onblur={commitEditing}
  />
</div>
