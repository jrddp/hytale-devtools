<script lang="ts">
  import FieldLayout from "src/fields/FieldLayout.svelte";
  import type { FieldProps } from "src/node-editor/utils/fieldUtils";
  import { noMousePropogation } from "src/node-editor/utils/fieldUtils";
  import { workspace } from "src/workspace.svelte";
  import { type SemanticReference } from "../../../../src/shared/schema/types";
  import { focusNextEditableInNode } from "src/node-editor/utils/focusNavigation";

  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    multiline = false,
    overrideAutocompleteValues,
    symbolLookup,
    onconfirm,
  }: FieldProps<string> & {
    multiline?: boolean;
    overrideAutocompleteValues?: string[];
    symbolLookup?: SemanticReference;
  } = $props();

  let value = $state("");
  let lastCommittedValue = $state("");

  let isFocused = $state(false);
  let activeAutocompleteIndex = $state(-1);
  let autocompleteListElement = $state<HTMLDivElement>();
  $effect(() => {
    void value;
    activeAutocompleteIndex = -1;
  });

  $effect(() => {
    if (initialValue !== lastCommittedValue) {
      value = initialValue;
      lastCommittedValue = initialValue;
    }
  });

  let usesOverrideAutocomplete = $derived(overrideAutocompleteValues !== undefined);
  let autocompleteValues = $derived(
    usesOverrideAutocomplete
      ? (overrideAutocompleteValues ?? [])
      : workspace.autocompleteField === inputId
        ? workspace.autocompleteValues
        : [],
  );
  let shouldAutocomplete = $derived(isFocused && autocompleteValues.length > 0);
  let filteredAutocompleteValues = $derived(
    autocompleteValues.filter(acValue => acValue.toLowerCase().includes(value.toLowerCase())),
  );

  function confirmValue() {
    isFocused = false;
    activeAutocompleteIndex = -1;
    if (value === lastCommittedValue) {
      return;
    }

    onconfirm(value);
    lastCommittedValue = value;
  }

  function handleInputKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    const autocompleteLength = filteredAutocompleteValues.length;
    switch (event.key) {
      case "ArrowDown":
        if (!shouldAutocomplete || autocompleteLength === 0) return;
        event.preventDefault();
        event.stopPropagation();
        activeAutocompleteIndex = (activeAutocompleteIndex + 1) % autocompleteLength;
        queueMicrotask(() => scrollActiveAutocompleteIntoView());
        break;
      case "ArrowUp":
        if (!shouldAutocomplete || autocompleteLength === 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (activeAutocompleteIndex === -1) {
          activeAutocompleteIndex = 0;
        } else {
          activeAutocompleteIndex = (activeAutocompleteIndex - 1 + autocompleteLength) % autocompleteLength;
        }
        queueMicrotask(() => scrollActiveAutocompleteIntoView());
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.blur();
        break;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        if (shouldAutocomplete && autocompleteLength > 0) {
          const selectedValue = filteredAutocompleteValues[activeAutocompleteIndex];
          if (selectedValue !== undefined) {
            value = selectedValue;
          }
        }
        confirmValue();
        if (!focusNextEditableInNode(event.currentTarget)) {
          event.currentTarget.blur();
        }
        break;
      default:
        return;
    }
  }

  function scrollActiveAutocompleteIntoView() {
    if (autocompleteListElement === undefined) return;
    const activeItemElement = autocompleteListElement.querySelector('[data-active="true"]');
    activeItemElement?.scrollIntoView({ block: "nearest" });
  }

  function handleFocus() {
    isFocused = true;
    if (!usesOverrideAutocomplete && symbolLookup !== undefined) {
      workspace.vscode.postMessage({
        type: "autocompleteRequest",
        symbolLookup: symbolLookup,
        fieldId: inputId,
      });
    }
  }

  function applyAutocompleteValue(acValue: string) {
    value = acValue;
    confirmValue();
  }
</script>

<FieldLayout {inputId} {label} {description} align={multiline ? "start" : "center"}>
  <div
    class="relative min-w-0"
    class:w-full={inputWidth === undefined}
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    {#if multiline}
      <textarea
        id={inputId}
        class="nodrag h-20 min-h-10 w-full resize-none rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
        rows="4"
        bind:value
        onblur={confirmValue}
        {...noMousePropogation}
      ></textarea>
    {:else}
      <input
        id={inputId}
        class="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
        class:rounded-b-none!={shouldAutocomplete && filteredAutocompleteValues.length > 0}
        type="text"
        bind:value
        onfocus={handleFocus}
        onkeydown={handleInputKeydown}
        onblur={confirmValue}
        {...noMousePropogation}
      />
      {#if shouldAutocomplete && filteredAutocompleteValues.length > 0}
        <div
          role="listbox"
          class="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
          tabindex="-1"
          bind:this={autocompleteListElement}
        >
          {#each filteredAutocompleteValues as acValue, index}
            <button
              class="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover data-[active=true]:bg-vsc-list-active-bg data-[active=true]:text-vsc-list-active-fg"
              class:border-vsc-focus={index === activeAutocompleteIndex}
              class:bg-vsc-list-active-bg={index === activeAutocompleteIndex}
              class:text-vsc-list-active-fg={index === activeAutocompleteIndex}
              type="button"
              tabindex="-1"
              role="option"
              aria-selected={index === activeAutocompleteIndex}
              data-active={index === activeAutocompleteIndex}
              onpointermove={() => (activeAutocompleteIndex = index)}
              onpointerdown={event => event.preventDefault()}
              onclick={() => applyAutocompleteValue(acValue)}
            >
              {acValue}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</FieldLayout>
