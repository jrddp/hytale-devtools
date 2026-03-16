<script lang="ts">
  import { GripVertical } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import type { ArrayFieldInstance, FieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: ArrayFieldInstance;
    renderField?: Snippet<[FieldInstance, number]>;
    depth?: number;
  }

  let { field, renderField, depth = 0 }: Props = $props();
  const summary = $derived(
    Array.isArray(field.items) ? `${field.items.length} tuple items` : `${field.parsedItems.length} list items`,
  );
</script>

<FieldPanel
  {field}
  {depth}
  {summary}
  collapsedByDefault={field.collapsedByDefault ?? true}
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
          {@render renderField?.(itemField, depth + 1)}
        {/each}
      {:else}
        {@render renderField?.(parsedItem, depth + 1)}
      {/if}
    </div>
  {/each}
</FieldPanel>
