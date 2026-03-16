<script lang="ts">
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import type { FieldInstance, MapFieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: MapFieldInstance;
    renderField?: Snippet<[FieldInstance, number]>;
    depth?: number;
  }

  let { field, renderField, depth = 0 }: Props = $props();
  const summary = $derived(`${field.entries.length} map entries`);
</script>

<FieldPanel
  {field}
  {depth}
  {summary}
  collapsedByDefault={false}
>
  {#if field.entries.length === 0}
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      No entries
    </div>
  {/if}

  {#each field.entries as entry (`${entry.key}-${entry.valueField.schemaKey ?? entry.valueField.type}`)}
    <div class="p-3 space-y-3 border border-dashed rounded-md border-vsc-border">
      <input
        type="text"
        class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
        value={entry.key}
        placeholder="Key"
        disabled
      />

      {@render renderField?.(entry.valueField, depth + 1)}
    </div>
  {/each}
</FieldPanel>
