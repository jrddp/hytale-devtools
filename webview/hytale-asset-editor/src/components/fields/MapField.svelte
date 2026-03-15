<script lang="ts">
  import type { Field, MapField as MapFieldType } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props {
    field: MapFieldType;
    renderField?: Snippet<[Field]>;
  }

  let { field, renderField }: Props = $props();

  let entries = $state<{ id: number; key: string }[]>([]);

  function addEntry() {
    entries.push({
      id: entries.length + 1,
      key: "",
    });
  }
</script>

<FieldPanel field={field} summary={`${entries.length} entries`}>
  {#snippet actions()}
    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-2 py-1 text-xs text-vsc-button-fg hover:bg-vsc-button-hover"
      onclick={addEntry}
    >
      Add Entry
    </button>
  {/snippet}

  <div class="text-xs opacity-65">Key type: {field.keyField.type}</div>

  {#if entries.length === 0}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 opacity-65">
      No entries
    </div>
  {/if}

  {#each entries as entry (entry.id)}
    <div class="space-y-3 rounded-md border border-dashed border-vsc-border p-3">
      <input
        type="text"
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
        bind:value={entry.key}
        placeholder="Key"
      />

      {@render renderField?.(field.valueField)}
    </div>
  {/each}
</FieldPanel>
