<script lang="ts">
  import type { NpcPropertySection } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import FieldRenderer from "./FieldRenderer.svelte";

  let {
    section,
    addButtonLabel,
    onadd,
  }: {
    section: NpcPropertySection;
    addButtonLabel?: string;
    onadd?: () => void;
  } = $props();

  const rootField = $derived(section.fields[0]);
</script>

<section
  class="space-y-2 scroll-m-4"
  id={section.id}
  data-outline-section-id={section.id}
>
  <div class="flex items-start justify-between gap-3">
    <div class="space-y-1">
      <div class="text-lg font-semibold tracking-wide">{section.name}</div>
      {#if section.description}
        <p class="text-sm leading-6 text-vsc-muted">{section.description}</p>
      {/if}
    </div>

    {#if rootField && rootField.isSet !== false && rootField.canUnset !== false}
      <button
        type="button"
        class="shrink-0 rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
        onclick={() => {
          workspace.unsetField(rootField.fieldPath);
        }}
      >
        Remove
      </button>
    {/if}
  </div>

  {#if rootField && rootField.isSet !== false}
    <FieldRenderer field={rootField} root={true} />
  {:else}
    <div class="space-y-3">
      <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted opacity-80">
        {section.description ?? "This section is currently unset."}
      </div>

      {#if onadd && addButtonLabel}
        <button
          type="button"
          class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
          onclick={onadd}
        >
          {addButtonLabel}
        </button>
      {/if}
    </div>
  {/if}
</section>
