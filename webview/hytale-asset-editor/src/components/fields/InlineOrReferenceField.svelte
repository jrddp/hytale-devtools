<script lang="ts">
  import type { RenderFieldProps } from "src/common";
  import ObjectField from "src/components/fields/ObjectField.svelte";
  import StringField from "src/components/fields/StringField.svelte";
  import type { InlineOrReferenceFieldInstance } from "../../parsing/fieldInstances";

  const {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    ...props
  }: RenderFieldProps<InlineOrReferenceFieldInstance> = $props();
</script>

{#if field.activeField.type === "string"}
  <StringField field={field.activeField} {depth} {readOnly} {readOnlyMessage} {...props} />
{:else}
  <ObjectField field={field.activeField} {depth} {readOnly} {readOnlyMessage} {...props} />
{/if}
