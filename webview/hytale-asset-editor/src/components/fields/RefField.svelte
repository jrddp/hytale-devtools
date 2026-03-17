<script lang="ts">
  import type { Field } from "@shared/fieldTypes";
  import { type RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import { type RefFieldInstance } from "src/parsing/fieldInstances";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";

  const { field, depth, ...props }: RenderFieldProps<RefFieldInstance> = $props();

  onMount(() => {
    workspace.requestRef(field.$ref);
  });

  const hasResolved = $derived(workspace.resolvedRefsByRef.has(field.$ref));

  let resolvedField: Field = $derived(workspace.resolvedRefsByRef.get(field.$ref));

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

{#if field.resolvedField}
  <FieldRenderer {...props} {depth} field={field.resolvedField} />
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
