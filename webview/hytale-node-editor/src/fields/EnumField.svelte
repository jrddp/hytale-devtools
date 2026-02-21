<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { ChevronDown } from 'lucide-svelte';
  import { getFieldLabel, normalizeFieldOptions } from '../node-editor/fieldValueUtils.js';
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from '../node-editor/focusNavigation.js';

  export let field;
  export let value;

  const dispatch = createEventDispatcher();

  $: options = normalizeFieldOptions(field?.options);
  $: label = getFieldLabel(field);
  $: values = sortEnumValues(
    Array.isArray(options.Values)
      ? options.Values.filter((candidate) => typeof candidate === 'string')
      : []
  );
  $: isStrict = readStrictOption(options);
  $: inputId = `enum-${sanitizeId(field?.id)}-${field?.type ?? 'value'}`;
  $: listId = `${inputId}-list`;
  $: committedValue = readCommittedValue({ value, values, isStrict });
  $: filteredValues = rankEnumValues(values, forceFullList ? '' : draftText);
  $: activeValue = highlightedIndex >= 0 ? filteredValues[highlightedIndex] : undefined;

  let inputElement;
  let dropdownElement;
  let isOpen = false;
  let forceFullList = false;
  let draftText = '';
  let highlightedIndex = -1;
  let skipNextBlurCommit = false;

  $: if (!isOpen && draftText !== committedValue) {
    draftText = committedValue;
  }

  $: if (isOpen && filteredValues.length === 0 && highlightedIndex !== -1) {
    highlightedIndex = -1;
  }

  $: if (isOpen && filteredValues.length > 0 && (highlightedIndex < 0 || highlightedIndex >= filteredValues.length)) {
    highlightedIndex = 0;
  }

  $: if (isOpen && filteredValues.length > 0 && highlightedIndex >= 0) {
    tick().then(() => {
      scrollHighlightedOptionIntoView();
    });
  }

  function emitValue(nextValue) {
    dispatch('change', { value: nextValue });
  }

  function commitValue(candidateValue, moveFocus = false, config = {}) {
    const allowFreeText = config?.allowFreeText === true || isStrict !== true;
    const nextValue =
      typeof candidateValue === 'string' && (allowFreeText || values.includes(candidateValue))
        ? candidateValue
        : committedValue;

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

  function openDropdown() {
    isOpen = true;
    const rankedValues = rankEnumValues(values, forceFullList ? '' : draftText);
    highlightedIndex = rankedValues.length > 0 ? 0 : -1;
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
      event.stopPropagation();
      const selectedValue = highlightedIndex >= 0 ? activeValue : undefined;
      commitAndBlur(selectedValue ?? draftText, { allowFreeText: true });
      return;
    }

    if (event.key === 'Tab') {
      const selectedValue = highlightedIndex >= 0 ? activeValue : undefined;
      commitValue(selectedValue ?? draftText, false, { allowFreeText: true });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      commitAndBlur(draftText, { allowFreeText: true });
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
    if (skipNextBlurCommit) {
      skipNextBlurCommit = false;
      return;
    }

    if (isStrict !== true) {
      commitValue(draftText, false, { allowFreeText: true });
      return;
    }

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

  function handleDropdownWheel(event) {
    event.stopPropagation();
  }

  function commitAndBlur(candidateValue, config = {}) {
    skipNextBlurCommit = true;
    commitValue(candidateValue, false, config);
    tick().then(() => {
      inputElement?.blur();
    });
  }

  function scrollHighlightedOptionIntoView() {
    const activeOption = dropdownElement?.querySelector('button[data-active="true"]');
    activeOption?.scrollIntoView({ block: 'nearest' });
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

  function readStrictOption(options) {
    if (typeof options?.Strict === 'boolean') {
      return options.Strict;
    }

    if (typeof options?.strict === 'boolean') {
      return options.strict;
    }

    return true;
  }

  function readCommittedValue({ value, values, isStrict }) {
    if (typeof value !== 'string') {
      return isStrict === true ? values[0] ?? '' : String(value ?? '');
    }

    if (isStrict === true) {
      return values.includes(value) ? value : values[0] ?? '';
    }

    return value;
  }

  function sortEnumValues(sourceValues) {
    const values = Array.isArray(sourceValues) ? [...sourceValues] : [];
    values.sort((left, right) => {
      const leftStartsWithStar = left.startsWith('*');
      const rightStartsWithStar = right.startsWith('*');
      if (leftStartsWithStar !== rightStartsWithStar) {
        return leftStartsWithStar ? 1 : -1;
      }

      return left.localeCompare(right);
    });
    return values;
  }
</script>

<div class="relative flex flex-col gap-1">
  <label class="text-xs text-vsc-muted" for={inputId}>{label}</label>
  <div class="relative">
    <input
      bind:this={inputElement}
      id={inputId}
      class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 pr-7 text-xs text-vsc-input-fg"
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
    <ChevronDown
      class="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-vsc-muted"
      aria-hidden="true"
    />
  </div>
  {#if isOpen}
    <div
      bind:this={dropdownElement}
      id={listId}
      role="listbox"
      class="nodrag absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg py-1 shadow-lg"
      onwheel={handleDropdownWheel}
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
