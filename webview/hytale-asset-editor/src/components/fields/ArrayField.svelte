<script lang="ts">
  import type { ArrayField as ArrayFieldType, Field } from "@shared/fieldTypes";
  import { GripVertical, Plus } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props {
    field: ArrayFieldType;
    renderField?: Snippet<[Field]>;
  }

  let { field, renderField }: Props = $props();

  let itemIds = $state<number[]>([]);

  function addItem() {
    itemIds.push(itemIds.length + 1);
  }
</script>

<FieldPanel
  {field}
  summary={`${itemIds.length} list items`}
  collapsedByDefault={field.collapsedByDefault ?? true}
>
  {#each itemIds as itemId (itemId)}
    <div class="flex items-center w-full gap-2 border-dashed rounded-md border-vsc-border">
      <div class="flex items-center">
        <GripVertical class="h-full opacity-70" />
        <div class="text-base font-medium opacity-70">{itemId}</div>
      </div>

      {#if Array.isArray(field.items)}
        {#each field.items as itemField, index (`${itemField.schemaKey ?? itemField.type}-${index}`)}
          {@render renderField?.(itemField)}
        {/each}
      {:else}
        {@render renderField?.(field.items)}
      {/if}
    </div>
  {/each}
  <button
    type="button"
    class="flex items-center w-full h-8 px-2 py-1 text-xs text-left border rounded-md border-vsc-border bg-vsc-button-secondary-bg text-vsc-button-fg hover:bg-vsc-button-hover"
    onclick={addItem}
  >
    <Plus size={16} />
    Add Item
  </button>
</FieldPanel>
