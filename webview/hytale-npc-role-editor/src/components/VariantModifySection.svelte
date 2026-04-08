<script lang="ts">
  import { tick } from "svelte";
  import { Plus } from "lucide-svelte";
  import type { NpcPropertyField, NpcPropertySection } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import FieldRenderer from "./FieldRenderer.svelte";

  let { section }: { section: NpcPropertySection } = $props();

  let pickerOpen = $state(false);
  let searchValue = $state("");
  let searchInput = $state<HTMLInputElement>();

  const availableOverrideFields = $derived(workspace.getAvailableVariantModifyOverrideFields());
  const filteredOverrideFields = $derived.by(() => {
    const trimmedSearch = searchValue.trim().toLowerCase();
    if (!trimmedSearch) {
      return availableOverrideFields;
    }

    return availableOverrideFields.filter(field =>
      field.key.toLowerCase().includes(trimmedSearch) ||
      field.label.toLowerCase().includes(trimmedSearch),
    );
  });
  const canAddOverride = $derived(
    workspace.variantReferenceState.status === "loaded" && availableOverrideFields.length > 0,
  );
  const referenceStatusText = $derived.by(() => {
    switch (workspace.variantReferenceState.status) {
      case "loading":
        return "Resolving reference parameters...";
      case "missing":
        return "Reference could not be resolved.";
      case "error":
        return workspace.variantReferenceState.message ?? "Reference could not be resolved.";
      case "loaded":
        if (workspace.variantReferenceParameters.length === 0) {
          return "Referenced role has no local parameters to override.";
        }

        return availableOverrideFields.length === 0
          ? "All inherited reference parameters are already overridden."
          : null;
      default:
        return "Set Reference to add inherited overrides.";
    }
  });

  async function openOverridePicker() {
    if (!canAddOverride) {
      return;
    }

    pickerOpen = true;
    searchValue = "";
    await tick();
    searchInput?.focus();
  }

  function closeOverridePicker() {
    pickerOpen = false;
    searchValue = "";
  }

  function selectOverride(field: NpcPropertyField) {
    const added = workspace.addVariantModifyOverride(field.key);
    if (!added) {
      return;
    }

    closeOverridePicker();
  }

  function summarizeFieldValue(field: NpcPropertyField): string {
    if (field.value.kind === "compute") {
      return `Compute: ${field.value.expression}`;
    }

    const literalValue = field.value.value;
    if (Array.isArray(literalValue)) {
      return literalValue.length === 0 ? "[]" : JSON.stringify(literalValue);
    }

    if (literalValue !== null && typeof literalValue === "object") {
      return JSON.stringify(literalValue);
    }

    return String(literalValue ?? "");
  }
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === "Escape" && pickerOpen) {
      closeOverridePicker();
    }
  }}
/>

<section
  class="space-y-2 scroll-m-4"
  id={section.id}
  data-outline-section-id={section.id}
>
  <div class="space-y-1">
    <div class="text-lg font-semibold tracking-wide">{section.name}</div>
    {#if section.description}
      <p class="text-sm leading-6 text-vsc-muted">{section.description}</p>
    {/if}
  </div>

  <div class="space-y-3">
    {#each section.fields as field (field.id)}
      <FieldRenderer {field} />
    {/each}

    <div class="space-y-2">
      <button
        type="button"
        class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canAddOverride}
        onclick={openOverridePicker}
      >
        <Plus size={14} />
        Override Reference Parameter
      </button>

      {#if referenceStatusText}
        <div class="text-xs text-vsc-muted">{referenceStatusText}</div>
      {/if}

      {#if pickerOpen}
        <div class="space-y-2 rounded-md border border-vsc-border bg-vsc-panel px-3 py-3">
          <input
            bind:this={searchInput}
            bind:value={searchValue}
            class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
            data-vscode-context={"{}"}
            placeholder="Search inherited parameters"
            onkeydown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                const firstField = filteredOverrideFields[0];
                if (firstField) {
                  selectOverride(firstField);
                }
              }
            }}
          />

          <div class="max-h-64 space-y-1 overflow-auto">
            {#if filteredOverrideFields.length > 0}
              {#each filteredOverrideFields as field (field.key)}
                <button
                  type="button"
                  class="flex w-full flex-col rounded-md border border-transparent px-3 py-2 text-left hover:bg-vsc-list-hover"
                  onclick={() => selectOverride(field)}
                >
                  <div class="text-sm font-medium text-vsc-input-fg">{field.key}</div>
                  <div class="truncate text-xs text-vsc-muted">{summarizeFieldValue(field)}</div>
                </button>
              {/each}
            {:else}
              <div class="px-1 py-2 text-xs text-vsc-muted">No matching inherited parameters.</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>
