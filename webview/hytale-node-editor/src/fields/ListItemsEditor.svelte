<script lang="ts">
  import { tick } from "svelte";
  import { CircleX, Plus } from "lucide-svelte";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { isObject } from "@node-editor/node-editor/utils/valueUtils";
  import { buildListItemInputId } from "@node-editor/fields/listFieldUtils";
  import { focusNextEditable } from "../../../shared/components/inputs/inputCommitBehavior";
  import CommitNumberInput from "../../../shared/components/inputs/CommitNumberInput.svelte";
  import SingleLineAutocompleteInput from "../../../shared/components/SingleLineAutocompleteInput.svelte";

  type AutocompleteOption = {
    value: string;
    markdownDescription?: string;
  };

  type ListItemKind = "auto" | "string" | "number";

  let {
    inputId,
    items,
    inputWidth,
    itemKind = "auto",
    emptyLabel = "No items",
    addLabel = "Add item",
    getAutocompleteOptions = () => [],
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
    emptyLabel?: string;
    addLabel?: string;
    getAutocompleteOptions?: (itemInputId: string, itemIndex: number) => AutocompleteOption[];
    onrequestAutocomplete?: (itemInputId: string) => void;
    onconsider?: (value?: string) => void;
    onadd: () => void;
    onremove: (index: number) => void;
    onupdate: (index: number, value: unknown) => void;
  } = $props();

  function getItemInputId(index: number) {
    return buildListItemInputId(inputId, index);
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

  function handleStringEnterCommit(input: HTMLInputElement) {
    if (!focusNextEditable(input, "[data-node-editor-root]")) {
      input.blur();
    }
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
  {#if items.length === 0}
    <div class="rounded-md border border-dashed border-vsc-editor-widget-border px-2 py-1.5 text-xs text-vsc-muted">
      {emptyLabel}
    </div>
  {:else}
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
            emptyValue={0}
            inputClass="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
            enterBehavior="focus-next"
            focusRootSelector="[data-node-editor-root]"
            stopPointerPropagation
            oncommit={nextItem => onupdate(index, nextItem ?? 0)}
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
            oncommit={nextItem => onupdate(index, nextItem)}
            afterEnterPressed={handleStringEnterCommit}
          />
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
  {/if}

  <button
    type="button"
    class="nodrag inline-flex items-center gap-1 rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-left text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
    onclick={addItem}
  >
    <Plus size={12} />
    {addLabel}
  </button>
</div>
