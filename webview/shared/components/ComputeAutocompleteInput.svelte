<script lang="ts">
  import { CircleDot, SquareFunction, Variable } from "lucide-svelte";
  import type { HTMLInputAttributes } from "svelte/elements";
  import {
    applyComputeAutocompleteOption,
    filterComputeAutocompleteOptions,
    getComputeAutocompleteContext,
    resolveSatisfiedComputeAutocomplete,
    type ComputeAutocompleteOption,
  } from "./computeAutocomplete";

  let {
    inputId,
    initialValue,
    inputElement = $bindable(),
    placeholder = "",
    disabled = false,
    autocompleteOptions = [],
    inputClass = "",
    listClass = "",
    optionClass = "",
    oncommit,
    onfocus,
    ...inputAttributes
  }: {
    inputId: string;
    initialValue?: string;
    inputElement?: HTMLInputElement;
    placeholder?: string;
    disabled?: boolean;
    autocompleteOptions?: ComputeAutocompleteOption[];
    inputClass?: string;
    listClass?: string;
    optionClass?: string;
    oncommit?: (value: string) => boolean | void;
    onfocus?: () => void;
  } & Omit<HTMLInputAttributes, "id" | "type" | "value" | "class" | "placeholder" | "disabled"> =
    $props();

  let value = $state("");
  let lastCommittedValue = $state("");
  let isFocused = $state(false);
  let isSuggestionsOpen = $state(false);
  let activeAutocompleteIndex = $state(0);
  let autocompleteListElement = $state<HTMLDivElement>();
  let cursorPos = $state(0);
  let forcedOpen = $state(false);
  let closeSuggestionsTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!isFocused && initialValue !== lastCommittedValue) {
      value = initialValue ?? "";
      lastCommittedValue = initialValue ?? "";
    }
  });

  $effect(() => {
    return () => {
      clearTimeout(closeSuggestionsTimeout);
    };
  });

  const functionNames = $derived(
    autocompleteOptions
      .filter(option => option.kind === "function")
      .map(option => option.insertText.slice(0, -1)),
  );
  const context = $derived(getComputeAutocompleteContext(value, cursorPos, functionNames));
  const filteredAutocompleteOptions = $derived(
    filterComputeAutocompleteOptions(
      autocompleteOptions,
      context.query,
      context.activeFunctionName,
    ),
  );
  const visibleAutocompleteOptions = $derived(
    isSuggestionsOpen ? filteredAutocompleteOptions : [],
  );

  $effect(() => {
    if (visibleAutocompleteOptions.length === 0) {
      activeAutocompleteIndex = 0;
      return;
    }

    if (activeAutocompleteIndex >= visibleAutocompleteOptions.length) {
      activeAutocompleteIndex = 0;
    }
  });

  $effect(() => {
    if (!autocompleteListElement || visibleAutocompleteOptions.length === 0) {
      return;
    }

    queueMicrotask(scrollActiveAutocompleteIntoView);
  });

  function commitNow(nextValue = value) {
    if (nextValue === lastCommittedValue) {
      return true;
    }

    const commitResult = oncommit?.(nextValue);
    if (commitResult === false) {
      value = lastCommittedValue;
      return false;
    }

    lastCommittedValue = nextValue;
    return true;
  }

  function updateCursorState(target: HTMLInputElement | null) {
    cursorPos = target?.selectionStart ?? value.length;
  }

  function closeSuggestionsSoon() {
    clearTimeout(closeSuggestionsTimeout);
    closeSuggestionsTimeout = setTimeout(() => {
      isSuggestionsOpen = false;
    }, 150);
  }

  function applyAutocomplete(option: ComputeAutocompleteOption) {
    const nextState = applyComputeAutocompleteOption(value, cursorPos, option);
    value = nextState.value;
    cursorPos = nextState.cursorPos;
    forcedOpen = false;
    isSuggestionsOpen = false;
    queueMicrotask(() => {
      inputElement?.focus();
      inputElement?.setSelectionRange(nextState.cursorPos, nextState.cursorPos);
    });
  }

  function scrollActiveAutocompleteIntoView() {
    if (!autocompleteListElement) {
      return;
    }

    const activeItem = autocompleteListElement.querySelector<HTMLElement>(
      `[data-autocomplete-index="${activeAutocompleteIndex}"]`,
    );
    activeItem?.scrollIntoView({ block: "nearest" });
  }

  function handleFocus(event: FocusEvent & { currentTarget: HTMLInputElement }) {
    isFocused = true;
    syncSuggestionState(event.currentTarget, true);
    onfocus?.();
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    value = event.currentTarget.value;
    syncSuggestionState(event.currentTarget);
  }

  function handleBlur(event: FocusEvent & { currentTarget: HTMLInputElement }) {
    isFocused = false;
    updateCursorState(event.currentTarget);
    forcedOpen = false;
    commitNow();
    closeSuggestionsSoon();
  }

  function handleSelectionChange(event: Event & { currentTarget: HTMLInputElement }) {
    syncSuggestionState(event.currentTarget);
  }

  function handleMouseup(event: MouseEvent & { currentTarget: HTMLInputElement }) {
    syncSuggestionState(event.currentTarget);
  }

  function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key === " " && event.ctrlKey) {
      event.preventDefault();
      syncSuggestionState(event.currentTarget, true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      forcedOpen = false;
      isSuggestionsOpen = false;
      return;
    }

    if (!isSuggestionsOpen || visibleAutocompleteOptions.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitNow();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        activeAutocompleteIndex = (activeAutocompleteIndex + 1) % visibleAutocompleteOptions.length;
        queueMicrotask(scrollActiveAutocompleteIntoView);
        return;
      case "ArrowUp":
        event.preventDefault();
        activeAutocompleteIndex =
          (activeAutocompleteIndex - 1 + visibleAutocompleteOptions.length) %
          visibleAutocompleteOptions.length;
        queueMicrotask(scrollActiveAutocompleteIntoView);
        return;
      case "Tab":
      case "Enter":
        event.preventDefault();
        const selectedOption = visibleAutocompleteOptions[activeAutocompleteIndex];
        const satisfiedResult = selectedOption
          ? resolveSatisfiedComputeAutocomplete(
              value,
              cursorPos,
              selectedOption,
              functionNames,
            )
          : null;
        if (satisfiedResult) {
          forcedOpen = false;
          isSuggestionsOpen = false;
          queueMicrotask(() => {
            inputElement?.focus();
            inputElement?.setSelectionRange(
              satisfiedResult.cursorPos,
              satisfiedResult.cursorPos,
            );
          });
          return;
        }

        if (selectedOption) {
          applyAutocomplete(selectedOption);
        }
        return;
      default:
        queueMicrotask(() => {
          syncSuggestionState(event.currentTarget);
        });
        return;
    }
  }

  function syncSuggestionState(target: HTMLInputElement | null, forceOpen = false) {
    updateCursorState(target);
    if (!target) {
      isSuggestionsOpen = false;
      return;
    }

    if (forceOpen) {
      forcedOpen = true;
    }

    const nextContext = getComputeAutocompleteContext(
      target.value,
      target.selectionStart ?? target.value.length,
      functionNames,
    );
    isSuggestionsOpen = forcedOpen || nextContext.shouldShow;
  }

  $effect(() => {
    if (typeof document === "undefined") {
      return;
    }

    function handleDocumentSelectionChange() {
      if (!inputElement || document.activeElement !== inputElement) {
        return;
      }

      syncSuggestionState(inputElement);
    }

    document.addEventListener("selectionchange", handleDocumentSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
    };
  });

  function getKindIcon(kind: ComputeAutocompleteOption["kind"]) {
    switch (kind) {
      case "parameter":
        return Variable;
      case "function":
        return SquareFunction;
      case "constant":
        return CircleDot;
    }
  }

  function getKindIconColor(kind: ComputeAutocompleteOption["kind"]) {
    switch (kind) {
      case "parameter":
        return "var(--vscode-symbolIcon-variableForeground, var(--vscode-input-foreground))";
      case "function":
        return "var(--vscode-symbolIcon-functionForeground, var(--vscode-input-foreground))";
      case "constant":
        return "var(--vscode-symbolIcon-constantForeground, var(--vscode-input-foreground))";
    }
  }
</script>

<div class="relative min-w-0">
  <input
    bind:this={inputElement}
    id={inputId}
    type="text"
    class={inputClass}
    class:rounded-b-none={isSuggestionsOpen && visibleAutocompleteOptions.length > 0}
    bind:value
    {placeholder}
    {disabled}
    {...inputAttributes}
    onfocus={handleFocus}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    onkeyup={handleSelectionChange}
    onselect={handleSelectionChange}
    onmouseup={handleMouseup}
    onclick={event => updateCursorState(event.currentTarget)}
  />

  {#if isSuggestionsOpen && visibleAutocompleteOptions.length > 0}
    <div
      bind:this={autocompleteListElement}
      role="listbox"
      tabindex="-1"
      class={listClass}
      onmousedown={event => event.preventDefault()}
    >
      {#each visibleAutocompleteOptions as option, index (`${option.kind}:${option.label}:${index}`)}
        {@const KindIcon = getKindIcon(option.kind)}
        <button
          type="button"
          tabindex="-1"
          role="option"
          aria-selected={index === activeAutocompleteIndex}
          data-autocomplete-index={index}
          class={optionClass}
          class:border-vsc-focus={index === activeAutocompleteIndex}
          class:bg-vsc-list-active-bg={index === activeAutocompleteIndex}
          class:text-vsc-list-active-fg={index === activeAutocompleteIndex}
          onpointermove={() => (activeAutocompleteIndex = index)}
          onmousedown={event => {
            event.preventDefault();
            applyAutocomplete(option);
          }}
        >
          <div class="flex items-stretch gap-2">
            <div
              class="flex w-5 shrink-0 items-center justify-center self-stretch"
              style:color={getKindIconColor(option.kind)}
            >
              <KindIcon size={16} strokeWidth={2} />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium leading-5">{option.label}</div>
              {#if option.description}
                <div class="mt-0.5 text-xs leading-4 opacity-80">
                  {option.description}
                </div>
              {/if}
            </div>
            <div class="flex shrink-0 items-center">
              <span class="text-[11px] font-medium uppercase tracking-[0.08em] opacity-70">
                {option.detail}
              </span>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
