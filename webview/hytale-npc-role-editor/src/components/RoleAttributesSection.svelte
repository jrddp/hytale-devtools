<script lang="ts">
  import type { NpcPropertyField, NpcPropertySection } from "../propertyModel";
  import { summarizeNpcFieldValue } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import AddSearchMenu from "./AddSearchMenu.svelte";
  import FieldRenderer from "./FieldRenderer.svelte";

  let { section }: { section: NpcPropertySection } = $props();

  const availableRoleAttributes = $derived(workspace.getAvailableRoleAttributeFields());
  const addRoleAttributeHelperText = $derived(
    availableRoleAttributes.length === 0
      ? "All descriptor-backed role attributes are already added."
      : null,
  );

  function summarizeRoleAttribute(field: NpcPropertyField): string {
    return summarizeNpcFieldValue(field);
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
        buttonLabel="Add Role Attribute"
        disabled={availableRoleAttributes.length === 0}
        helperText={addRoleAttributeHelperText}
        searchPlaceholder="Search role attributes"
        emptyText="No matching role attributes."
        items={availableRoleAttributes.map(field => ({
          id: field.key,
          label: field.label,
          summary: summarizeRoleAttribute(field),
          keywords: [field.key],
        }))}
        onselect={item => {
          workspace.addRoleAttribute(item.id);
        }}
      />
    </div>
  </div>
</section>
