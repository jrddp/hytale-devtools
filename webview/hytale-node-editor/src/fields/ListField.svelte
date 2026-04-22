<script lang="ts">
  import { onDestroy } from "svelte";
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { isObject } from "@node-editor/node-editor/utils/valueUtils";
  import { noMousePropogation } from "@node-editor/node-editor/utils/fieldUtils";
  import { focusNextEditableInNode, isPlainEnterNavigationEvent } from "@node-editor/node-editor/utils/focusNavigation";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { IndexReference } from "@shared/indexTypes";
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import SingleLineAutocompleteInput from "../../../shared/components/SingleLineAutocompleteInput.svelte";
  import type { Snippet } from "svelte";
  import {
    buildListItemInputId,
    getListAutocompleteValues,
    shouldRequestListAutocomplete,
  } from "./listFieldUtils";

  // TODO lists can technically be types other than string. definition requires investigation.
  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    overrideAutocompleteValues,
    symbolLookup,
    previewFeatureKind,
    titleActions,
    onconfirm,
  }: FieldProps<unknown[]> & {
    overrideAutocompleteValues?: string[];
    symbolLookup?: IndexReference;
    previewFeatureKind?: NodeField["previewFeatureKind"];
    titleActions?: Snippet;
  } = $props();
  const workspace = useNodeEditorSession();

  const DEFAULT_ITEM_WIDTH = 160;

  let value = $state<unknown[]>([]);

  $effect(() => {
    if (Array.isArray(initialValue)) {
      value = initialValue.slice();
      return;
    }

    if (initialValue === undefined || initialValue === null) {
      value = [];
      return;
    }

    value = [initialValue];
  });

  function confirmValue(nextValue: unknown[]) {
    value = nextValue;
    onconfirm(nextValue);
  }

  function addItem() {
    confirmValue([...value, ""]);
  }

  function removeItem(index: number) {
    confirmValue(value.filter((_, entryIndex) => entryIndex !== index));
  }

  function updateItem(index: number, nextItem: unknown) {
    const nextList = value.slice();
    nextList[index] = nextItem;
    confirmValue(nextList);
  }

  function updateTextItem(index: number, nextText: string) {
    updateItem(index, nextText);
  }

  function updateNumberItem(index: number, nextText: string) {
    const parsed = Number(nextText);
    updateItem(index, Number.isFinite(parsed) ? parsed : 0);
  }

  function updateBooleanItem(index: number, checked: boolean) {
    updateItem(index, checked);
  }

  function updateObjectItem(index: number, nextText: string) {
    try {
      const parsed = JSON.parse(nextText);
      if (isObject(parsed)) {
        updateItem(index, parsed);
      }
    } catch {
      // wait until json is valid
    }
  }

  function formatObjectValue(item: unknown) {
    try {
      return JSON.stringify(item ?? {}, null, 2);
    } catch {
      return "{}";
    }
  }

  function handleEnterNavigation(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (!isPlainEnterNavigationEvent(event)) {
      return;
    }

    event.preventDefault();
    if (!focusNextEditableInNode(event.currentTarget)) {
      event.currentTarget.blur();
    }
  }

  function getAutocompleteOptions(itemInputId: string) {
    return getListAutocompleteValues({
      itemInputId,
      overrideAutocompleteValues,
      symbolLookup,
      autocompleteField: workspace.autocompleteField,
      autocompleteValues: workspace.autocompleteValues,
    }).map(value => ({ value }));
  }

  function requestAutocomplete(itemInputId: string) {
    if (!shouldRequestListAutocomplete(overrideAutocompleteValues, symbolLookup) || !symbolLookup) {
      return;
    }

    workspace.postMessageToHost({
      type: "autocompleteRequest",
      symbolLookup,
      fieldId: itemInputId,
    });
  }

  function handleStringEnterCommit(input: HTMLInputElement) {
    if (!focusNextEditableInNode(input)) {
      input.blur();
    }
  }

  function handleConsideredPreview(value?: string) {
    if (previewFeatureKind !== "animation") {
      return;
    }

    if (value === undefined) {
      workspace.clearConsideredPreviewFeature("animation");
      return;
    }

    workspace.setConsideredPreviewFeature("animation", value);
  }

  onDestroy(() => {
    if (previewFeatureKind === "animation") {
      workspace.clearConsideredPreviewFeature("animation");
    }
  });
</script>

<FieldLayout {inputId} {label} {description} align="start" {titleActions}>
  <div
    id={inputId}
    class="flex min-w-0 flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2"
    class:w-full={inputWidth === undefined}
  >
    <div class="flex items-center justify-end gap-2">
      <button
        class="rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
        type="button"
        onclick={addItem}
      >
        Add
      </button>
    </div>

    {#if value.length === 0}
      <div class="text-xs text-vsc-muted">No items</div>
    {:else}
      <div class="flex flex-col gap-1.5">
        {#each value as item, index}
          <div class="flex flex-wrap items-start gap-1.5">
            <div
              class="min-w-0 shrink-0"
              style:width={typeof item === "boolean" ? undefined : `${inputWidth ?? DEFAULT_ITEM_WIDTH}px`}
            >
              {#if typeof item === "boolean"}
                <input
                  class="h-4 w-4 nodrag"
                  type="checkbox"
                  checked={item}
                  onchange={event => updateBooleanItem(index, event.currentTarget.checked)}
                  {...noMousePropogation}
                />
              {:else if typeof item === "number"}
                <input
                  class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                  type="number"
                  value={item}
                  onchange={event => updateNumberItem(index, event.currentTarget.value)}
                  onkeydown={handleEnterNavigation}
                  {...noMousePropogation}
                />
              {:else if isObject(item)}
                <textarea
                  class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
                  rows="3"
                  value={formatObjectValue(item)}
                  onchange={event => updateObjectItem(index, event.currentTarget.value)}
                  {...noMousePropogation}
                ></textarea>
              {:else}
                <SingleLineAutocompleteInput
                  inputId={buildListItemInputId(inputId, index)}
                  initialValue={typeof item === "string" ? item : String(item ?? "")}
                  autocompleteOptions={getAutocompleteOptions(buildListItemInputId(inputId, index))}
                  inputClass="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg nodrag"
                  listClass="nodrag nowheel absolute left-0 right-0 top-full z-40 max-h-32 overflow-auto rounded-t-none rounded-md border border-vsc-input-border bg-vsc-editor-widget-bg shadow-lg"
                  optionClass="block w-full cursor-pointer px-2 py-1 text-left text-xs text-vsc-input-fg hover:bg-vsc-list-hover"
                  stopPointerPropagation
                  onfocus={() => requestAutocomplete(buildListItemInputId(inputId, index))}
                  onconsider={handleConsideredPreview}
                  oncommit={nextValue => updateTextItem(index, nextValue)}
                  afterEnterPressed={handleStringEnterCommit}
                />
              {/if}
            </div>
            <button
              class="rounded-md border border-vsc-button-border bg-vsc-button-secondary-bg px-2 py-1 text-xs text-vsc-button-secondary-fg hover:bg-vsc-button-secondary-hover"
              type="button"
              onclick={() => removeItem(index)}
            >
              Remove
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</FieldLayout>
