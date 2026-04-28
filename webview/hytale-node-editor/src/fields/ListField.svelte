<script lang="ts">
  import { onDestroy } from "svelte";
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { IndexReference } from "@shared/indexTypes";
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import type { Snippet } from "svelte";
  import {
    getListAutocompleteValues,
    shouldRequestListAutocomplete,
  } from "./listFieldUtils";
  import ListItemsEditor from "./ListItemsEditor.svelte";

  // TODO lists can technically be types other than string. definition requires investigation.
  let {
    inputId,
    label,
    description,
    initialValue,
    inputWidth,
    placeholder = "",
    overrideAutocompleteValues,
    symbolLookup,
    uniqueItems,
    previewFeatureKind,
    titleActions,
    onconfirm,
  }: FieldProps<unknown[]> & {
    placeholder?: string;
    overrideAutocompleteValues?: string[];
    symbolLookup?: IndexReference;
    uniqueItems?: boolean;
    previewFeatureKind?: NodeField["previewFeatureKind"];
    titleActions?: Snippet;
  } = $props();
  const workspace = useNodeEditorSession();

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

  function getAutocompleteOptions(itemInputId: string, itemIndex: number) {
    return getListAutocompleteValues({
      itemInputId,
      overrideAutocompleteValues,
      symbolLookup,
      autocompleteField: workspace.autocompleteField,
      autocompleteValues: workspace.autocompleteValues,
      items: value,
      currentItemIndex: itemIndex,
      uniqueItems,
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
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    <ListItemsEditor
      {inputId}
      items={value}
      {inputWidth}
      addLabel="Add item"
      emptyLabel={placeholder || "No items"}
      {getAutocompleteOptions}
      onrequestAutocomplete={requestAutocomplete}
      onconsider={handleConsideredPreview}
      onadd={addItem}
      onremove={removeItem}
      onupdate={updateItem}
    />
  </div>
</FieldLayout>
