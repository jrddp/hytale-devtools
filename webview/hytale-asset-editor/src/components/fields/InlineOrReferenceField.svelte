<script lang="ts">
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import type {
    FieldInstance,
    InlineOrReferenceFieldInstance,
  } from "../../parsing/fieldInstances";

  let {
    field,
    renderField,
    depth = 0,
  }: {
    field: InlineOrReferenceFieldInstance;
    renderField?: Snippet<[FieldInstance, number]>;
    depth?: number;
  } = $props();

  const placeholder = $derived(
    field.stringField.default?.toString() ??
      field.stringField.enumVals?.slice(0, 3).join(", ") ??
      "Reference path",
  );
  const summary = $derived(
    field.mode === "inline" ? "Inline object" : field.mode === "string" ? "Reference path" : "",
  );
</script>

<FieldPanel field={field} {depth} summary={summary} inline={field.mode !== "inline"}>
  {#if field.mode === "inline" && field.inlineValueField}
    {@render renderField?.(field.inlineValueField, depth + 1)}
  {:else}
    <input
      type="text"
      class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
      value={field.stringValue ?? ""}
      {placeholder}
      disabled
    />
  {/if}
</FieldPanel>
