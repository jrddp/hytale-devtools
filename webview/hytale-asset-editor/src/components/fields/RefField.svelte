<script lang="ts">
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import type { FieldInstance, RefFieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: RefFieldInstance;
    renderField?: Snippet<[FieldInstance, number]>;
    depth?: number;
  }

  let { field, renderField, depth = 0 }: Props = $props();
</script>

{#if field.resolvedField}
  {@render renderField?.(field.resolvedField, depth)}
{:else}
  <FieldPanel {field} {depth} summary={field.$ref} inline>
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      {#if field.resolvedField === null}
        Field reference {field.$ref} could not be resolved.
      {:else}
        Resolving reference...
      {/if}
    </div>
  </FieldPanel>
{/if}
