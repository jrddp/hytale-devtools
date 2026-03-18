<script lang="ts">
  import { Plus } from "lucide-svelte";
  import { type RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import type { ArrayFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field, depth = 0 }: RenderFieldProps<ArrayFieldInstance> = $props();
  const summary = $derived(`${field.items?.length ?? 0} list items`);

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

  function removeItem(index: number) {
    field.items.splice(index, 1);
    workspace.applyDocumentState();
  }
</script>

<FieldPanel {field} {depth} {summary} collapsedByDefault={field.collapsedByDefault ?? true}>
  {#each field.items as item, index (index)}
    <FieldRenderer field={item} depth={depth + 1} onunset={() => removeItem(index)} />
  {/each}
  {#if !field.isTuple}
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
