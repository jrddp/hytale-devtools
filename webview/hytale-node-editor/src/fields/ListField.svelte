<script lang="ts">
  import { onDestroy } from "svelte";
  import FieldLayout from "@node-editor/fields/FieldLayout.svelte";
  import type { FieldProps } from "@node-editor/node-editor/utils/fieldUtils";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import type { IndexReference } from "@shared/indexTypes";
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import type { Snippet } from "svelte";
  import {
    getListItemEditorKind,
    getListAutocompleteValues,
    shouldRequestListAutocomplete,
  } from "./listFieldUtils";
  import ListItemsEditor from "./ListItemsEditor.svelte";

  // TODO lists can technically be types other than string. definition requires investigation.
  let {
    inputId,
    nodeId,
    schemaKey,
    parentSchemaKey,
    label,
    description,
    initialValue,
    inputWidth,
    placeholder = "",
    overrideAutocompleteValues,
    symbolLookup,
    uniqueItems,
    listItemType,
    previewFeatureKind,
    titleActions,
    onconfirm,
  }: FieldProps<unknown[]> & {
    nodeId?: string;
    schemaKey?: string | null;
    parentSchemaKey?: string;
    placeholder?: string;
    overrideAutocompleteValues?: string[];
    symbolLookup?: IndexReference;
    uniqueItems?: boolean;
    listItemType?: NodeField["listItemType"];
    previewFeatureKind?: NodeField["previewFeatureKind"];
    titleActions?: Snippet;
  } = $props();
  const workspace = useNodeEditorSession();
  const canSetExplicitEmptyItems = $derived(
    nodeId !== undefined &&
      schemaKey !== null &&
      parentSchemaKey === undefined,
  );
  const itemKind = $derived(getListItemEditorKind(listItemType));

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

  function addItem(nextItem: unknown = "") {
    confirmValue([...value, nextItem]);
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

  function getStringItemVscodeContext(itemIndex: number) {
    if (!canSetExplicitEmptyItems) {
      return undefined;
    }

    return JSON.stringify({
      webviewSection: "nodeEditorField",
      nodeEditorNodeId: nodeId,
      nodeEditorFieldSchemaKey: schemaKey,
      nodeEditorListItemIndex: itemIndex,
      nodeEditorCanSetExplicitEmpty: true,
      ...(workspace.embeddedGraphFieldPath
        ? { nodeEditorGraphFieldPath: workspace.embeddedGraphFieldPath }
        : {}),
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
    class="flex min-w-0 flex-col gap-1.5"
    class:w-full={inputWidth === undefined}
    style:width={inputWidth !== undefined ? `${inputWidth}px` : undefined}
  >
    <ListItemsEditor
      {inputId}
      items={value}
      {inputWidth}
      addLabel="Add item"
      defaultPlaceholder={placeholder}
      {itemKind}
      {getAutocompleteOptions}
      {getStringItemVscodeContext}
      onrequestAutocomplete={requestAutocomplete}
      onconsider={handleConsideredPreview}
      onadd={addItem}
      onremove={removeItem}
      onupdate={updateItem}
    />
  </div>
</FieldLayout>
