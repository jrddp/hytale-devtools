<script lang="ts">
  import { tick } from "svelte";
  import { CircleX, Plus } from "lucide-svelte";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { isObject } from "@node-editor/node-editor/utils/valueUtils";
  import {
    buildListItemInputId,
    type ListItemKind,
    getListAddPlaceholder,
    normalizeCommittedStringListItem,
    shouldAppendStringListItem,
    shouldRemoveStringListItem,
  } from "@node-editor/fields/listFieldUtils";
  import { focusNextEditable } from "../../../shared/components/inputs/inputCommitBehavior";
  import CommitNumberInput from "../../../shared/components/inputs/CommitNumberInput.svelte";
  import SingleLineAutocompleteInput from "../../../shared/components/SingleLineAutocompleteInput.svelte";

  type AutocompleteOption = {
    value: string;
    markdownDescription?: string;
  };

  let {
    inputId,
    items,
    inputWidth,
    itemKind = "auto",
    defaultPlaceholder = "",
    addLabel = "Add item",
    getAutocompleteOptions = () => [],
    getStringItemVscodeContext = () => undefined,
    onrequestAutocomplete,
    onconsider,
    onadd,
    onremove,
    onupdate,
  }: {
    inputId: string;
    items: unknown[];
    inputWidth?: number;
    itemKind?: ListItemKind;
    defaultPlaceholder?: string;
    addLabel?: string;
    getAutocompleteOptions?: (itemInputId: string, itemIndex: number) => AutocompleteOption[];
    getStringItemVscodeContext?: (itemIndex: number) => string | undefined;
    onrequestAutocomplete?: (itemInputId: string) => void;
    onconsider?: (value?: string) => void;
    onadd: (value?: unknown) => void;
    onremove: (index: number) => void;
    onupdate: (index: number, value: unknown) => void;
  } = $props();

  let addInputVersion = $state(0);
  const inlineAddItemKind = $derived(getInlineAddItemKind());
  const addItemIndex = $derived(items.length);
  const addItemInputId = $derived(getItemInputId(addItemIndex));
  const addItemPlaceholder = $derived(
    getListAddPlaceholder({
      itemCount: items.length,
      defaultPlaceholder,
    }),
  );

  function getItemInputId(index: number) {
    return buildListItemInputId(inputId, index);
  }

  function getInlineAddItemKind(): "string" | "number" | null {
    if (itemKind === "string" || itemKind === "number") {
      return itemKind;
    }

    if (items.length === 0) {
      return "string";
    }

    if (items.every(item => typeof item === "number")) {
      return "number";
    }

    if (items.every(item => typeof item === "string")) {
      return "string";
    }

    return null;
  }

  function getEffectiveItemKind(item: unknown): Exclude<ListItemKind, "auto"> | "boolean" | "object" {
    if (itemKind !== "auto") {
      return itemKind;
    }
    if (typeof item === "boolean") {
      return "boolean";
    }
    if (typeof item === "number") {
      return "number";
    }
    if (isObject(item)) {
      return "object";
    }
    return "string";
  }

  async function addItem() {
    const nextIndex = items.length;
    onadd();
    await tick();

    const itemInputId = getItemInputId(nextIndex);
    const input = document.getElementById(itemInputId);
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus();
      input.select();
    }
    onrequestAutocomplete?.(itemInputId);
  }

  async function focusNextAddInput(nextIndex: number) {
    await tick();

    const input = document.getElementById(getItemInputId(nextIndex));
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus();
      input.select();
    }
  }

  function appendStringItem(nextItem: string) {
    if (!shouldAppendStringListItem(nextItem)) {
      return;
    }

    onadd(nextItem);
    addInputVersion += 1;
  }

  function appendNumberItem(nextItem: number | undefined) {
    if (nextItem === undefined) {
      return;
    }

    onadd(nextItem);
    addInputVersion += 1;
  }

  function handleAddStringEnterPressed(input: HTMLInputElement) {
    if (!shouldAppendStringListItem(input.value)) {
      return;
    }

    void focusNextAddInput(items.length + 1);
  }

  function handleStringEnterCommit(input: HTMLInputElement) {
    if (!focusNextEditable(input, "[data-node-editor-root]")) {
      input.blur();
    }
  }

  function updateStringItem(index: number, currentItem: unknown, nextItem: string) {
    if (shouldRemoveStringListItem(nextItem, currentItem)) {
      onremove(index);
      return;
    }

    onupdate(index, normalizeCommittedStringListItem(nextItem));
  }

  function updateNumberItem(index: number, nextItem: number | undefined) {
    if (nextItem === undefined) {
      onremove(index);
      return;
    }

    onupdate(index, nextItem);
  }

  function updateObjectItem(index: number, nextText: string) {
    try {
      const parsed = JSON.parse(nextText);
      if (isObject(parsed)) {
        onupdate(index, parsed);
      }
    } catch {
      // Keep editing until the JSON object is valid.
    }
  }

  function formatObjectValue(item: unknown) {
    try {
      return JSON.stringify(item ?? {}, null, 2);
    } catch {
      return "{}";
    }
  }
</script>

<div class="flex min-w-0 flex-col gap-1">
  {#each items as item, index (`${inputId}:${index}`)}
    {@const effectiveItemKind = getEffectiveItemKind(item)}
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
      {#if effectiveItemKind === "boolean"}
        <input
          class="nodrag h-4 w-4 accent-vsc-activity-bar-badge-bg"
          type="checkbox"
          checked={item === true}
          onchange={event => onupdate(index, event.currentTarget.checked)}
          {...noMousePropogation}
        />
      {:else if effectiveItemKind === "number"}
          <CommitNumberInput
            inputId={getItemInputId(index)}
            initialValue={typeof item === "number" ? item : 0}
            emptyCommitsUndefined
            inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
            enterBehavior="focus-next"
            focusRootSelector="[data-node-editor-root]"
            stopPointerPropagation
            oncommit={nextItem => updateNumberItem(index, nextItem)}
          />
      {:else if effectiveItemKind === "object"}
        <textarea
          id={getItemInputId(index)}
          class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
          rows="3"
          value={formatObjectValue(item)}
          onchange={event => updateObjectItem(index, event.currentTarget.value)}
          {...noMousePropogation}
        ></textarea>
      {:else}
        {@const stringItemVscodeContext = getStringItemVscodeContext(index)}
        <div
          data-vscode-context={stringItemVscodeContext}
          data-node-editor-field-context={stringItemVscodeContext ? "true" : undefined}
        >
          <SingleLineAutocompleteInput
            inputId={getItemInputId(index)}
            initialValue={typeof item === "string" ? item : String(item ?? "")}
            autocompleteOptions={getAutocompleteOptions(getItemInputId(index), index)}
            inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
            listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
            optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
            stopPointerPropagation
            onfocus={() => onrequestAutocomplete?.(getItemInputId(index))}
            onconsider={onconsider}
            oncommit={nextItem => updateStringItem(index, item, nextItem)}
            afterEnterPressed={handleStringEnterCommit}
          />
        </div>
      {/if}

      <button
        type="button"
        class="nodrag inline-flex size-6 items-center justify-center rounded-md text-vsc-muted hover:bg-vsc-list-hover hover:text-vsc-input-fg"
        aria-label={`Remove item ${index + 1}`}
        onclick={() => onremove(index)}
      >
        <CircleX size={13} />
      </button>
    </div>
  {/each}

  {#if inlineAddItemKind === "string"}
    {#key `string-add-${addInputVersion}`}
      <SingleLineAutocompleteInput
        inputId={addItemInputId}
        initialValue=""
        placeholder={addItemPlaceholder}
        autocompleteOptions={getAutocompleteOptions(addItemInputId, addItemIndex)}
        inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
        listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
        optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
        stopPointerPropagation
        onfocus={() => onrequestAutocomplete?.(addItemInputId)}
        onconsider={onconsider}
        oncommit={appendStringItem}
        afterEnterPressed={handleAddStringEnterPressed}
      />
    {/key}
  {:else if inlineAddItemKind === "number"}
    {#key `number-add-${addInputVersion}`}
      <CommitNumberInput
        inputId={addItemInputId}
        initialValue={undefined}
        placeholder={addItemPlaceholder}
        emptyCommitsUndefined
        inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
        enterBehavior="focus-next"
        focusRootSelector="[data-node-editor-root]"
        stopPointerPropagation
        oncommit={appendNumberItem}
      />
    {/key}
  {:else}
    <button
      type="button"
      class="nodrag inline-flex items-center gap-1 rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-left text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
      style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
      onclick={addItem}
    >
      <Plus size={12} />
      {addLabel}
    </button>
  {/if}
</div>
