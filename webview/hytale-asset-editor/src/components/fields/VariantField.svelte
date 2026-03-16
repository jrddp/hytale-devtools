<script lang="ts">
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { buildOutlineSections, type OutlineSection, groupFieldsBySection, isFieldVisible } from "../fieldHelpers";
  import { workspace } from "../../workspace.svelte";
  import type { FieldInstance, VariantFieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: VariantFieldInstance;
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
    depth?: number;
    root?: boolean;
    onSectionsChange?: (sections: OutlineSection[]) => void;
  }

  let { field, renderField, depth = 0, root = false, onSectionsChange }: Props = $props();

  let collapsed = $state(false);

  const variantNames = $derived(Object.keys(field.variantsByIdentity));
  const selectedIdentity = $derived(field.selectedIdentity ?? "");
  const activeVariant = $derived(field.activeVariantField ?? null);
  const activeSections = $derived(
    activeVariant
      ? groupFieldsBySection(
          Object.fromEntries(
            Object.entries(activeVariant.properties).filter(
              ([schemaKey, childField]) =>
                schemaKey !== field.identityField.schemaKey &&
                isFieldVisible(childField, workspace.hideUnsetFields),
            ),
          ),
        )
      : [],
  );
  const outlineSections = $derived(buildOutlineSections(activeSections));

  function handleCollapsedChange(nextCollapsed: boolean) {
    collapsed = nextCollapsed;
  }

  function selectVariant(nextIdentity: string) {
    if (!nextIdentity) {
      field.identityField.value = undefined;
      field.identityField.unparsedData = undefined;
      field.selectedIdentity = undefined;
      field.activeVariantField = null;
      field.unparsedData = undefined;
      workspace.applyDocumentState();
      return;
    }

    field.identityField.value = nextIdentity;
    field.identityField.unparsedData = undefined;
    field.selectedIdentity = nextIdentity;
    field.activeVariantField = workspace.createEmptyFieldInstance(field.variantsByIdentity[nextIdentity]);
    field.unparsedData = undefined;
    collapsed = Boolean(field.collapsedByDefault);
    workspace.applyDocumentState();
  }

  $effect(() => {
    collapsed = Boolean(field.selectedIdentity) && Boolean(field.collapsedByDefault);
  });

  $effect(() => {
    if (!root) return;

    onSectionsChange?.(outlineSections);
  });
</script>

{#snippet variantBody()}
  <div class="space-y-3">
    <label class="block space-y-1">
      <span class="text-xs font-medium opacity-70">{field.identityField.schemaKey}</span>
      <select
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg"
        value={selectedIdentity}
        onchange={event => selectVariant(event.currentTarget.value)}
      >
        <option value="">Select a type</option>
        {#each variantNames as variantName (variantName)}
          <option value={variantName}>{variantName}</option>
        {/each}
      </select>
    </label>

    {#if !selectedIdentity}
      <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 opacity-65">
        {variantNames.length} available variants
      </div>
    {:else if !collapsed}
      {#if activeSections.length === 0}
        <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 opacity-65">
          {workspace.hideUnsetFields ? "No set fields in this variant" : "No fields in this variant"}
        </div>
      {:else}
        <div class="space-y-4">
          {#each activeSections as section, index (section.name)}
            <section
              class="space-y-2 scroll-m-4"
              id={root ? outlineSections[index]?.id : undefined}
              data-outline-section-id={root ? outlineSections[index]?.id : undefined}
            >
              {#if activeSections.length > 1 || section.name !== "General"}
                <div class="text-xs font-semibold uppercase tracking-wide opacity-65">
                  {section.name}
                </div>
              {/if}

              <div class="space-y-3">
                {#each section.fields as childField, index (`${childField.schemaKey ?? childField.type}-${index}`)}
                  {@render renderField?.(childField, root ? depth : depth + 1, undefined)}
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

{#if root}
  {@render variantBody()}
{:else}
  <FieldPanel
    field={field}
    {depth}
    summary={`${variantNames.length} variants`}
    collapseEnabled={Boolean(selectedIdentity)}
    {collapsed}
    onCollapsedChange={handleCollapsedChange}
  >
    {@render variantBody()}
  </FieldPanel>
{/if}
