<script lang="ts">
  import ObjectField from "src/components/fields/ObjectField.svelte";
  import StringField from "src/components/fields/StringField.svelte";
  import type { Snippet } from "svelte";
  import type { FieldInstance, InlineOrReferenceFieldInstance } from "../../parsing/fieldInstances";

  let {
    field,
    renderField,
    depth = 0,
    onunset,
  }: {
    field: InlineOrReferenceFieldInstance;
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
    depth?: number;
    onunset?: () => void;
  } = $props();
</script>

{#if field.activeField.type === "string"}
  <StringField field={field.activeField} {depth} />
{:else}
  <ObjectField field={field.activeField} {depth} />
{/if}
