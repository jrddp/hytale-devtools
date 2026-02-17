<script>
  import { createEventDispatcher } from 'svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from '../node-editor/focusNavigation.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: values = Array.isArray(options.Values)
    ? options.Values.filter((candidate) => typeof candidate === 'string')
    : [];
  $: inputId = `enum-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;
  $: listId = `${inputId}-list`;
  $: committedValue = typeof value === 'string' && values.includes(value) ? value : values[0] ?? '';
  $: filteredValues = rankEnumValues(values, forceFullList ? '' : draftText);
  $: activeValue = filteredValues[highlightedIndex] ?? filteredValues[0];

  let inputElement;
  let isOpen = false;
  let forceFullList = false;
  let draftText = '';
  let highlightedIndex = -1;

  $: if (!isOpen && draftText !== committedValue) {
    draftText = committedValue;
  }

  function emitValue(nextValue) {
    dispatch('change', { value: nextValue });
  }

  function commitValue(candidateValue, moveFocus = false) {
    const nextValue =
      typeof candidateValue === 'string' && values.includes(candidateValue) ? candidateValue : committedValue;

    if (nextValue !== committedValue) {
      emitValue(nextValue);
    }

    draftText = nextValue;
    closeDropdown();

    if (moveFocus) {
      if (!focusNextEditableInNode(inputElement)) {
        inputElement?.blur();
      }
    }
  }

  function revertValue() {
    draftText = committedValue;
    closeDropdown();
  }

  function openDropdown() {
    isOpen = true;
    const rankedValues = rankEnumValues(values, forceFullList ? '' : draftText);
    const nextHighlightedIndex = rankedValues.indexOf(committedValue);
    highlightedIndex = nextHighlightedIndex >= 0 ? nextHighlightedIndex : rankedValues.length > 0 ? 0 : -1;
  }

  function closeDropdown() {
    isOpen = false;
    forceFullList = false;
    highlightedIndex = -1;
  }

  function handleInput(event) {
    draftText = event.currentTarget.value;
    forceFullList = false;
    isOpen = true;
    highlightedIndex = 0;
  }

  function handleInputClick(event) {
    forceFullList = true;
    openDropdown();
    event.currentTarget.select();
  }

  function handleKeyDown(event) {
    if (isPlainEnterNavigationEvent(event)) {
      event.preventDefault();
      commitValue(activeValue, true);
      return;
    }

    if (event.key === 'Tab') {
      commitValue(activeValue, false);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      revertValue();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        forceFullList = false;
        openDropdown();
        return;
      }

      if (filteredValues.length === 0) {
        return;
      }

      highlightedIndex = Math.min(highlightedIndex + 1, filteredValues.length - 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        forceFullList = false;
        openDropdown();
        return;
      }

      if (filteredValues.length === 0) {
        return;
      }

      highlightedIndex = Math.max(highlightedIndex - 1, 0);
    }
  }

  function handleBlur() {
    const rankedValues = rankEnumValues(values, draftText);
    const bestMatchValue = rankedValues[0] ?? committedValue;
    commitValue(bestMatchValue, false);
  }

  function selectOption(optionValue) {
    commitValue(optionValue, false);
  }

  function handleOptionMouseDown(event) {
    event.preventDefault();
  }

  function rankEnumValues(sourceValues, query) {
    const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
    if (!normalizedQuery) {
      return sourceValues;
    }

    const prefixMatches = [];
    const containsMatches = [];

    for (const enumValue of sourceValues) {
      const normalizedValue = enumValue.toLowerCase();
      if (normalizedValue.startsWith(normalizedQuery)) {
        prefixMatches.push(enumValue);
      } else if (normalizedValue.includes(normalizedQuery)) {
        containsMatches.push(enumValue);
      }
    }

    return [...prefixMatches, ...containsMatches];
  }

  function sanitizeId(candidate) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      return 'field';
    }
    return candidate.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
</script>

<div class="relative flex flex-col gap-1">
  <label class="text-xs text-vsc-muted" for={inputId}>{label}</label>
  <input
    bind:this={inputElement}
    id={inputId}
    class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
    type="text"
    autocomplete="off"
    spellcheck="false"
    value={draftText}
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={listId}
    aria-autocomplete="list"
    oninput={handleInput}
    onclick={handleInputClick}
    onkeydown={handleKeyDown}
    onblur={handleBlur}
  />
  {#if isOpen}
    <div
      id={listId}
      role="listbox"
      class="nodrag absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg py-1 shadow-lg"
    >
      {#if filteredValues.length === 0}
        <div class="px-2 py-1 text-xs text-vsc-muted">No matching values</div>
      {:else}
        {#each filteredValues as optionValue, index}
          <button
            class="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover data-[active=true]:bg-vsc-list-active-bg data-[active=true]:text-vsc-list-active-fg"
            data-active={index === highlightedIndex}
            type="button"
            tabindex="-1"
            role="option"
            aria-selected={optionValue === committedValue}
            onmouseenter={() => (highlightedIndex = index)}
            onmousedown={handleOptionMouseDown}
            onclick={() => selectOption(optionValue)}
          >
            {optionValue}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
