<script lang="ts">
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import { onMount } from "svelte";
  import type { NpcPropertyScalarField } from "../../propertyModel";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyScalarField } = $props();

  let draftValue = $state("");

  onMount(() => {
    draftValue = String(field.value ?? "");
  });

  const panelDescription = $derived(
    field.type === "enum" && field.options?.some(option => option.value === field.value)
      ? [field.description, field.options.find(option => option.value === field.value)?.description]
          .filter(Boolean)
          .join("\n\n") || undefined
      : field.description,
  );
  const autocompleteOptions = $derived(
    (field.options ?? []).map(option => ({
      value: option.value,
      markdownDescription: option.description,
    })),
  );
  const inputId = $derived(`npc-property-${field.id}`);
</script>

<FieldPanel
  title={field.label}
  description={panelDescription}
  infoItems={field.infoItems}
>
  {#if field.type === "number"}
    <input
      id={inputId}
      type="text"
      class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
      bind:value={draftValue}
      placeholder="Unset"
      inputmode="decimal"
    />
  {:else}
    <SingleLineAutocompleteInput
      {inputId}
      initialValue={draftValue}
      placeholder="Unset"
      autocompleteOptions={autocompleteOptions}
      inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
      listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
      optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
      previewClass="z-[160]"
      oncommit={value => {
        draftValue = value;
      }}
    />
  {/if}
</FieldPanel>
