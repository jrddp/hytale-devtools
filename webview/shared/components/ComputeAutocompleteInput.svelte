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
  let activeAutocompleteIndex = $state(-1);
  let autocompleteListElement = $state<HTMLDivElement>();
  let cursorPos = $state(0);
  let forcedOpen = $state(false);

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue ?? "";
      lastCommittedValue = initialValue ?? "";
    }
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
  const shouldAutocomplete = $derived(
    isFocused && filteredAutocompleteOptions.length > 0 && (forcedOpen || context.shouldShow),
  );
  const visibleAutocompleteOptions = $derived(
    shouldAutocomplete ? filteredAutocompleteOptions : [],
  );

  $effect(() => {
    void value;
    void cursorPos;
    activeAutocompleteIndex = -1;
    if (shouldAutocomplete) {
      queueMicrotask(scrollActiveAutocompleteIntoView);
    }
  });

  $effect(() => {
    if (!shouldAutocomplete || !autocompleteListElement) {
      return;
    }

    queueMicrotask(scrollActiveAutocompleteIntoView);
  });

  function confirmValue(nextValue = value) {
    isFocused = false;
    forcedOpen = false;
    activeAutocompleteIndex = -1;
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

  function updateCursorState(target: HTMLInputElement | null = inputElement ?? null) {
    cursorPos = target?.selectionStart ?? value.length;
  }

  function applyAutocomplete(option: ComputeAutocompleteOption) {
    const nextState = applyComputeAutocompleteOption(value, cursorPos, option);
    value = nextState.value;
    cursorPos = nextState.cursorPos;
    forcedOpen = false;
    queueMicrotask(() => {
      inputElement?.focus();
      inputElement?.setSelectionRange(nextState.cursorPos, nextState.cursorPos);
    });
  }

  function scrollActiveAutocompleteIntoView() {
    if (!autocompleteListElement) {
      return;
    }

    if (activeAutocompleteIndex === -1) {
      const firstButton = autocompleteListElement.querySelector("button");
      firstButton?.scrollIntoView({ block: "nearest" });
      return;
    }

    const activeItem = autocompleteListElement.querySelector<HTMLElement>('[data-active="true"]');
    activeItem?.scrollIntoView({ block: "nearest" });
  }

  function handleFocus() {
    isFocused = true;
    queueMicrotask(() => updateCursorState());
    onfocus?.();
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    updateCursorState(event.currentTarget);
  }

  function handleKeyup(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    updateCursorState(event.currentTarget);
  }

  function handleSelectionChange(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    queueMicrotask(() => updateCursorState(input));
  }

  function handleMouseup(event: MouseEvent & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    queueMicrotask(() => updateCursorState(input));
  }

  function handleClick(event: MouseEvent & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    queueMicrotask(() => updateCursorState(input));
  }

  function handleBlur(event: FocusEvent & { currentTarget: HTMLInputElement }) {
    confirmValue();
  }

  function handleInputKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key === " " && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      forcedOpen = true;
      activeAutocompleteIndex = -1;
      return;
    }

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
      case "Tab":
        if (!shouldAutocomplete) return;
        event.preventDefault();
        event.stopPropagation();
        const tabSelectedOption = visibleAutocompleteOptions[activeAutocompleteIndex];
        if (!tabSelectedOption) {
          return;
        }

        const satisfiedResult = resolveSatisfiedComputeAutocomplete(
          value,
          cursorPos,
          tabSelectedOption,
          functionNames,
        );
        if (satisfiedResult) {
          forcedOpen = false;
          queueMicrotask(() => {
            inputElement?.focus();
            inputElement?.setSelectionRange(
              satisfiedResult.cursorPos,
              satisfiedResult.cursorPos,
            );
          });
          return;
        }

        applyAutocomplete(tabSelectedOption);
        return;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        if (shouldAutocomplete) {
          const selectedOption = visibleAutocompleteOptions[activeAutocompleteIndex];
          if (selectedOption) {
            const satisfiedEnterResult = resolveSatisfiedComputeAutocomplete(
              value,
              cursorPos,
              selectedOption,
              functionNames,
            );
            if (!satisfiedEnterResult) {
              const nextState = applyComputeAutocompleteOption(value, cursorPos, selectedOption);
              value = nextState.value;
              cursorPos = nextState.cursorPos;
            }
          }
        }
        confirmValue();
        event.currentTarget.blur();
        return;
      default:
        return;
    }
  }

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
    class:rounded-b-none={shouldAutocomplete}
    bind:value
    {placeholder}
    {disabled}
    {...inputAttributes}
    onfocus={handleFocus}
    oninput={handleInput}
    onkeydown={handleInputKeydown}
    onkeyup={handleKeyup}
    onselect={handleSelectionChange}
    onblur={handleBlur}
    onmouseup={handleMouseup}
    onclick={handleClick}
  />

  {#if shouldAutocomplete}
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
          data-active={index === activeAutocompleteIndex}
          class={optionClass}
          class:border-vsc-focus={index === activeAutocompleteIndex}
          class:bg-vsc-list-active-bg={index === activeAutocompleteIndex}
          class:text-vsc-list-active-fg={index === activeAutocompleteIndex}
          onpointermove={() => (activeAutocompleteIndex = index)}
          onpointerdown={event => event.preventDefault()}
          onclick={() => applyAutocomplete(option)}
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
