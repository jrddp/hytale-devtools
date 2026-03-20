<script lang="ts">
  import { Plus } from "lucide-svelte";
  import { Redo2 } from "lucide-svelte";
  import { type RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import type { ArrayFieldInstance, FieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
  }: RenderFieldProps<ArrayFieldInstance> = $props();
  const hasInheritedOnlyItems = $derived(field.items.length === 0 && field.inheritedItems.length > 0);
  const visibleItems = $derived(hasInheritedOnlyItems ? field.inheritedItems : field.items);
  const itemsReadOnly = $derived(readOnly || hasInheritedOnlyItems);
  const childReadOnlyMessage = $derived(
    hasInheritedOnlyItems
      ? `Inherited by ${field.schemaKey ?? "parent"}.\nOverride to edit.`
      : readOnlyMessage,
  );
  const summary = $derived(
    hasInheritedOnlyItems ? `${visibleItems.length} inherited items` : `${visibleItems.length} list items`,
  );

  function addItem() {
    if (field.isTuple === true) {
      console.error("Attempted to add item to tuple array");
      return;
    }
    const newItem = workspace.createEmptyFieldInstance(field.itemFieldTypes);
    newItem.schemaKey = field.items.length.toString();
    field.items.push(newItem);
    workspace.applyDocumentState();
  }

  function overrideParentValue() {
    if (!hasInheritedOnlyItems) {
      return;
    }

    field.items = structuredClone($state.snapshot(field.inheritedItems)) as FieldInstance[];
    workspace.applyDocumentState();
  }

  function removeItem(index: number) {
    field.items.splice(index, 1);
    workspace.applyDocumentState();
  }
</script>

<FieldPanel
  {field}
  {depth}
  {readOnly}
  childReadOnly={hasInheritedOnlyItems}
  {summary}
  collapsedByDefault={field.collapsedByDefault ?? true}
>
  {#if hasInheritedOnlyItems && !readOnly}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover w-full flex items-center gap-1"
      onclick={overrideParentValue}
    >
      <Redo2 size={14} />
      Override Parent
    </button>
  {/if}

  {#each visibleItems as item, index (index)}
    <FieldRenderer
      field={item}
      depth={depth + 1}
      readOnly={itemsReadOnly}
      readOnlyMessage={childReadOnlyMessage}
      onunset={!itemsReadOnly ? () => removeItem(index) : undefined}
    />
  {/each}

  {#if !field.isTuple && !readOnly && !hasInheritedOnlyItems}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover w-full opacity-80 flex items-center gap-1"
      onclick={addItem}
    >
      <Plus size={14} />
      Add Item
    </button>
  {/if}
</FieldPanel>
