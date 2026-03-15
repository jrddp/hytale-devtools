<script lang="ts">
  import type { ArrayField as ArrayFieldType, Field } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props {
    field: ArrayFieldType;
    renderField?: Snippet<[Field]>;
  }

  let { field, renderField }: Props = $props();

  let collapsed = $state(false);
  let itemIds = $state<number[]>([]);

  onMount(() => {
    collapsed = Boolean(field.collapsedByDefault);
  });

  function addItem() {
    itemIds.push(itemIds.length + 1);
    collapsed = false;
  }
</script>

<FieldPanel field={field} summary={`${itemIds.length} items`}>
  {#snippet actions()}
    <button
      type="button"
      class="rounded-md border border-vsc-border px-2 py-1 text-xs hover:bg-vsc-panel-hover"
      onclick={() => (collapsed = !collapsed)}
    >
      {collapsed ? "Expand" : "Collapse"}
    </button>
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-2 py-1 text-xs text-vsc-button-fg hover:bg-vsc-button-hover"
      onclick={addItem}
    >
      Add Item
    </button>
  {/snippet}

  {#if !collapsed}
    <div class="text-xs opacity-65">
      {#if Array.isArray(field.items)}
        Tuple with {field.items.length} slots
      {:else}
        List item schema
      {/if}
    </div>

    {#if itemIds.length === 0}
      <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 opacity-65">
        No items
      </div>
    {/if}

    {#each itemIds as itemId (itemId)}
      <div class="space-y-3 rounded-md border border-dashed border-vsc-border p-3">
        <div class="text-xs font-medium opacity-70">Item {itemId}</div>

        {#if Array.isArray(field.items)}
          {#each field.items as itemField, index (`${itemField.schemaKey ?? itemField.type}-${index}`)}
            {@render renderField?.(itemField)}
          {/each}
        {:else}
          {@render renderField?.(field.items)}
        {/if}
      </div>
    {/each}
  {/if}
</FieldPanel>
