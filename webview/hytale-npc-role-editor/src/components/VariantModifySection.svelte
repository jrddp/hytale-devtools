<script lang="ts">
  import type { NpcPropertyField, NpcPropertySection } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import AddSearchMenu from "./AddSearchMenu.svelte";
  import FieldRenderer from "./FieldRenderer.svelte";

  let { section }: { section: NpcPropertySection } = $props();

  const availableOverrideFields = $derived(workspace.getAvailableVariantModifyOverrideFields());
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
      <AddSearchMenu
        buttonLabel="Override Reference Parameter"
        disabled={!canAddOverride}
        helperText={referenceStatusText}
        searchPlaceholder="Search inherited parameters"
        emptyText="No matching inherited parameters."
        items={availableOverrideFields.map(field => ({
          id: field.key,
          label: field.key,
          summary: summarizeFieldValue(field),
        }))}
        onselect={item => {
          workspace.addVariantModifyOverride(item.id);
        }}
      />
    </div>
  </div>
</section>
