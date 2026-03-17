<script lang="ts">
  import { isFieldSet } from "src/components/fieldHelpers";
  import type { Snippet } from "svelte";
  import type { FieldInstance, MapFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props {
    field: MapFieldInstance;
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
    depth?: number;
  }

  let { field, renderField, depth = 0 }: Props = $props();
  const summary = $derived(`${field.entries.length} map entries`);

  function addEntry() {
    field.entries = [
      ...field.entries,
      {
        key: `entry${field.entries.length + 1}`,
        valueField: workspace.createEmptyFieldInstance(field.valueField),
      },
    ];
  }

  function removeEntry(index: number) {
    field.entries.splice(index, 1);
    workspace.applyDocumentState();
  }

  function commitEntryKey(nextKey: string, index: number) {
    if (field.entries[index]?.key === nextKey) {
      return;
    }

    field.entries[index].key = nextKey;

    // TODO FIXME we should be persisting empty map entries since we want to ensure we persist their keys
    if (isFieldSet(field.entries[index]?.valueField)) {
      workspace.applyDocumentState();
    }
  }
</script>

{#snippet panelActions()}
  <button
    type="button"
    class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
    onclick={event => {
      event.stopPropagation();
      addEntry();
    }}
  >
    Add Entry
  </button>
{/snippet}

<FieldPanel {field} {depth} {summary} collapsedByDefault={false} actions={panelActions}>
  {#if field.entries.length === 0}
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      No entries
    </div>
  {/if}

  {#each field.entries as entry, index (`${entry.key}-${entry.valueField.schemaKey ?? entry.valueField.type}-${index}`)}
    <div class="p-3 space-y-3 border border-dashed rounded-md border-vsc-border">
      <div class="flex items-center gap-2">
        <input
          type="text"
          class="w-full px-3 py-2 border rounded-md border-vsc-border bg-vsc-input-bg text-vsc-input-fg"
          value={entry.key}
          placeholder="Key"
          onblur={event => commitEntryKey(event.currentTarget.value, index)}
          onkeydown={event => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            commitEntryKey(event.currentTarget.value, index);
            event.currentTarget.blur();
          }}
        />
      </div>

      {@render renderField?.(entry.valueField, depth + 1, () => removeEntry(index))}
    </div>
  {/each}
</FieldPanel>
