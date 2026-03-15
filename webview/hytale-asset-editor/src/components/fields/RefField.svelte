<script lang="ts">
  import type { Field, RefField as RefFieldType } from "@shared/fieldTypes";
  import { workspace } from "src/workspace.svelte";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";

  interface Props {
    field: RefFieldType;
    renderField?: Snippet<[Field]>;
  }

  let { field, renderField }: Props = $props();

  onMount(() => {
    workspace.requestRef(field.$ref);
  });

  const hasResolved = $derived(workspace.resolvedRefsByRef.has(field.$ref));

  let resolvedField: Field = $derived.by(() => workspace.resolvedRefsByRef.get(field.$ref));

  const mergedField = $derived(
    resolvedField
      ? ({
          ...resolvedField,
          schemaKey: field.schemaKey,
          markdownDescription: field.markdownDescription ?? resolvedField.markdownDescription,
        } as Field)
      : null,
  );
</script>

{#if mergedField}
  {@render renderField?.(mergedField)}
{:else}
  <FieldPanel {field} summary={field.$ref}>
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
      {#if hasResolved}
        Field reference {field.$ref} could not be resolved.
      {:else}
        Resolving reference...
      {/if}
    </div>
  </FieldPanel>
{/if}
