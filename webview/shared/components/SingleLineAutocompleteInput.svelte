<script lang="ts">
  import { marked } from "marked";
  import FloatingMarkdownPreviewCard from "./FloatingMarkdownPreviewCard.svelte";

  type AutocompleteOption = {
    value: string;
    markdownDescription?: string;
  };

  let {
    inputId,
    initialValue,
    placeholder = "",
    disabled = false,
    autocompleteOptions = [],
    inputClass = "",
    listClass = "",
    optionClass = "",
    previewClass = "",
    stopPointerPropagation = false,
    oncommit,
    onfocus,
    afterEnterPressed,
  }: {
    inputId: string;
    initialValue?: string;
    placeholder?: string;
    disabled?: boolean;
    autocompleteOptions?: AutocompleteOption[];
    inputClass?: string;
    listClass?: string;
    optionClass?: string;
    previewClass?: string;
    stopPointerPropagation?: boolean;
    oncommit?: (value: string) => void;
    onfocus?: () => void;
    afterEnterPressed?: (input: HTMLInputElement) => void;
  } = $props();

  let value = $state("");
  let lastCommittedValue = $state("");
  let isFocused = $state(false);
  let inputElement = $state<HTMLInputElement>();
  let isEntireValueSelected = $state(false);
  let activeAutocompleteIndex = $state(-1);
  let autocompleteListElement = $state<HTMLDivElement>();
  let previewAnchorElement = $state<HTMLElement | null>(null);

  $effect(() => {
    void value;
    void isEntireValueSelected;
    activeAutocompleteIndex = -1;
    queueMicrotask(scrollActiveAutocompleteIntoView);
  });

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue ?? "";
      lastCommittedValue = initialValue ?? "";
    }
  });

  const filteredAutocompleteOptions = $derived(
    autocompleteOptions.filter(option =>
      option.value.toLowerCase().includes((value ?? "").toLowerCase()),
    ),
  );
  const visibleAutocompleteOptions = $derived(
    value.length > 0 && isEntireValueSelected ? autocompleteOptions : filteredAutocompleteOptions,
  );
  const shouldAutocomplete = $derived(isFocused && visibleAutocompleteOptions.length > 0);
  const previewOption = $derived(
    visibleAutocompleteOptions[activeAutocompleteIndex >= 0 ? activeAutocompleteIndex : 0],
  );
  const previewHtml = $derived(
    previewOption?.markdownDescription
      ? (marked.parse(previewOption.markdownDescription, {
          breaks: true,
          gfm: true,
        }) as string)
      : undefined,
  );
  const previewAnchorIndex = $derived(activeAutocompleteIndex >= 0 ? activeAutocompleteIndex : 0);

  $effect(() => {
    if (!shouldAutocomplete || !autocompleteListElement) {
      previewAnchorElement = null;
      return;
    }

    const activeIndex = previewAnchorIndex;

    queueMicrotask(() => {
      previewAnchorElement =
        autocompleteListElement?.querySelector<HTMLElement>(
          `[data-autocomplete-index="${activeIndex}"]`,
        ) ?? null;
    });
  });

  function stopPointerEvent(event: MouseEvent | PointerEvent) {
    if (stopPointerPropagation) {
      event.stopPropagation();
    }
  }

  function updateSelectionState(target: HTMLInputElement | null = inputElement ?? null) {
    if (!target) {
      isEntireValueSelected = false;
      return;
    }

    const selectionStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;
    isEntireValueSelected =
      target.value.length > 0 && selectionStart === 0 && selectionEnd === target.value.length;
  }

  function confirmValue() {
    isFocused = false;
    isEntireValueSelected = false;
    activeAutocompleteIndex = -1;
    if (value === lastCommittedValue) {
      return;
    }

    oncommit?.(value);
    lastCommittedValue = value;
  }

  function scrollActiveAutocompleteIntoView() {
    if (!autocompleteListElement) {
      return;
    }

    if (activeAutocompleteIndex === -1) {
      const firstButton = autocompleteListElement.querySelector("button");
      firstButton?.scrollIntoView({ block: "nearest" });
      console.log("Button scrolled to:", firstButton);
      return;
    }
    const activeItemElement = autocompleteListElement.querySelector('[data-active="true"]');
    activeItemElement?.scrollIntoView({ block: "nearest" });
  }

  function applyAutocompleteValue(nextValue: string) {
    value = nextValue;
    confirmValue();
  }

  function handleFocus() {
    isFocused = true;
    queueMicrotask(() => updateSelectionState());
    onfocus?.();
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    updateSelectionState(event.currentTarget);
  }

  function handleKeyup(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    updateSelectionState(event.currentTarget);
  }

  function handleSelectionChange(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    queueMicrotask(() => updateSelectionState(input));
  }

  function handleMouseup(event: MouseEvent & { currentTarget: HTMLInputElement }) {
    stopPointerEvent(event);
    const input = event.currentTarget;
    queueMicrotask(() => updateSelectionState(input));
  }

  function handleClick(event: MouseEvent & { currentTarget: HTMLInputElement }) {
    stopPointerEvent(event);
    const input = event.currentTarget;
    queueMicrotask(() => updateSelectionState(input));
  }

  function handleInputKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    switch (event.key) {
      case "ArrowDown":
        if (!shouldAutocomplete) return;
        event.preventDefault();
        event.stopPropagation();
        activeAutocompleteIndex = (activeAutocompleteIndex + 1) % visibleAutocompleteOptions.length;
        queueMicrotask(scrollActiveAutocompleteIntoView);
        return;
      case "ArrowUp":
        if (!shouldAutocomplete) return;
        event.preventDefault();
        event.stopPropagation();
        activeAutocompleteIndex =
          activeAutocompleteIndex === -1
            ? 0
            : (activeAutocompleteIndex - 1 + visibleAutocompleteOptions.length) %
              visibleAutocompleteOptions.length;
        queueMicrotask(scrollActiveAutocompleteIntoView);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.blur();
        return;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        if (shouldAutocomplete) {
          const selectedValue = visibleAutocompleteOptions[activeAutocompleteIndex]?.value;
          if (selectedValue !== undefined) {
            value = selectedValue;
          }
        }
        confirmValue();
        afterEnterPressed?.(event.currentTarget);
        return;
      default:
        return;
    }
  }
</script>

<div class="relative min-w-0">
  <input
    bind:this={inputElement}
    id={inputId}
    type="text"
    class={inputClass}
    class:rounded-b-none={shouldAutocomplete}
    bind:value
    {placeholder}
    {disabled}
    onfocus={handleFocus}
    oninput={handleInput}
    onkeydown={handleInputKeydown}
    onkeyup={handleKeyup}
    onselect={handleSelectionChange}
    onblur={confirmValue}
    onpointerdown={stopPointerEvent}
    onmousedown={stopPointerEvent}
    onmouseup={handleMouseup}
    onclick={handleClick}
  />

  {#if shouldAutocomplete}
    <div
      bind:this={autocompleteListElement}
      role="listbox"
      tabindex="-1"
      class={listClass}
      onpointerdown={stopPointerEvent}
      onmousedown={stopPointerEvent}
    >
      {#each visibleAutocompleteOptions as option, index (option.value)}
        <button
          type="button"
          tabindex="-1"
          role="option"
          aria-selected={index === activeAutocompleteIndex}
          data-autocomplete-index={index}
          data-active={index === activeAutocompleteIndex}
          class={optionClass}
          class:border-vsc-focus={index === activeAutocompleteIndex}
          class:bg-vsc-list-active-bg={index === activeAutocompleteIndex}
          class:text-vsc-list-active-fg={index === activeAutocompleteIndex}
          onpointermove={() => (activeAutocompleteIndex = index)}
          onpointerdown={event => event.preventDefault()}
          onclick={() => applyAutocompleteValue(option.value)}
        >
          {option.value}
        </button>
      {/each}
    </div>
  {/if}

  {#if shouldAutocomplete && previewHtml && previewOption && previewAnchorElement}
    <FloatingMarkdownPreviewCard
      referenceElement={previewAnchorElement}
      title={previewOption.value}
      html={previewHtml}
      class={`w-62 ${previewClass}`.trim()}
    />
  {/if}
</div>
