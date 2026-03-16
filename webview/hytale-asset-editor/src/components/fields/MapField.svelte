<script lang="ts">
  import type { Field, MapField as MapFieldType } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props {
    field: MapFieldType;
    renderField?: Snippet<[Field, number]>;
    depth?: number;
  }

  let { field, renderField, depth = 0 }: Props = $props();

  let collapsed = $state(false);
  let entries = $state<{ id: number; key: string }[]>([]);

  function addEntry() {
    entries.push({
      id: entries.length + 1,
      key: "",
    });
    collapsed = false;
  }
</script>

<FieldPanel
  {field}
  {depth}
  summary={`${entries.length} map entries`}
  collapsedByDefault={false}
  bind:collapsed
>
  {#snippet actions()}
    <button
      type="button"
      class="px-2 py-1 text-xs border rounded-md border-vsc-border bg-vsc-button-bg text-vsc-button-fg hover:bg-vsc-button-hover"
      onclick={addEntry}
    >
      Add Entry
    </button>
  {/snippet}

  {#if entries.length === 0}
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      No entries
    </div>
  {/if}

  {#each entries as entry (entry.id)}
    <div class="p-3 space-y-3 border border-dashed rounded-md border-vsc-border">
      <input
        type="text"
        class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
        bind:value={entry.key}
        placeholder="Key"
      />

      {@render renderField?.(field.valueField, depth + 1)}
    </div>
  {/each}
</FieldPanel>
