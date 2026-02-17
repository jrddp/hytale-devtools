<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel } from '../node-editor/fieldValueUtils.js';
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from '../node-editor/focusNavigation.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: label = getFieldLabel(field);
  $: committedValue = typeof value === 'string' ? value : String(value ?? '');
  $: inputId = `path-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;
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
    type="text"
    value={draftValue}
    onfocus={beginEditing}
    oninput={handleInput}
    onkeydown={handleEnterNavigation}
    onblur={commitEditing}
    placeholder="path/to/file.json"
    spellcheck="false"
  />
</div>
