<script lang="ts">
  import { GripVertical } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { workspace } from "../../workspace.svelte";
  import type { ArrayFieldInstance, FieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: ArrayFieldInstance;
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
    depth?: number;
  }

  let { field, renderField, depth = 0 }: Props = $props();
  const summary = $derived(
    Array.isArray(field.items) ? `${field.items.length} tuple items` : `${field.parsedItems.length} list items`,
  );

  function addItem() {
    if (Array.isArray(field.items)) {
      return;
    }

    field.parsedItems = [...field.parsedItems, workspace.createEmptyFieldInstance(field.items)];
    field.unparsedData = undefined;
  }

  function removeItem(index: number) {
    field.parsedItems.splice(index, 1);
    field.unparsedData = undefined;
    workspace.applyDocumentState();
  }

  function itemHasInlineUnset(item: FieldInstance) {
    return (
      item.type === "string" ||
      item.type === "number" ||
      item.type === "boolean" ||
      item.type === "color" ||
      (item.type === "inlineOrReference" && item.mode !== "inline")
    );
  }
</script>

{#snippet panelActions()}
  {#if !Array.isArray(field.items)}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
      onclick={event => {
        event.stopPropagation();
        addItem();
      }}
    >
      Add Item
    </button>
  {/if}
{/snippet}

<FieldPanel
  {field}
  {depth}
  {summary}
  collapsedByDefault={field.collapsedByDefault ?? true}
  actions={panelActions}
>
  {#if field.parsedItems.length === 0}
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      No items
    </div>
  {/if}

  {#each field.parsedItems as parsedItem, index (index)}
    <div class="flex items-start w-full gap-2 border border-dashed rounded-md border-vsc-border">
      <div class="flex items-center">
        <GripVertical class="h-full opacity-70" />
        <div class="text-base font-medium opacity-70">{index + 1}</div>
      </div>

      {#if Array.isArray(parsedItem)}
        {#each parsedItem as itemField, itemIndex (`${itemField.schemaKey ?? itemField.type}-${itemIndex}`)}
          {@render renderField?.(itemField, depth + 1, undefined)}
        {/each}
      {:else}
        <div class="min-w-0 flex-1">
          {@render renderField?.(parsedItem, depth + 1, () => removeItem(index))}
        </div>

        {#if !itemHasInlineUnset(parsedItem)}
          <button
            type="button"
            class="mr-2 mt-2 rounded-md border border-vsc-border bg-vsc-button-bg px-2 py-1 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
            onclick={() => removeItem(index)}
          >
            Remove
          </button>
        {/if}
      {/if}
    </div>
  {/each}
</FieldPanel>
