<script lang="ts">
  import type { Field, VariantField as VariantFieldType } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { buildOutlineSections, type OutlineSection, groupFieldsBySection } from "../fieldHelpers";

  interface Props {
    field: VariantFieldType;
    renderField?: Snippet<[Field, number]>;
    depth?: number;
    root?: boolean;
    onSectionsChange?: (sections: OutlineSection[]) => void;
  }

  let { field, renderField, depth = 0, root = false, onSectionsChange }: Props = $props();

  let selectedIdentity = $state("");
  let userCollapsed = $state<boolean | null>(null);

  const variantNames = $derived(Object.keys(field.variantsByIdentity));
  const activeVariant = $derived(
    selectedIdentity ? field.variantsByIdentity[selectedIdentity] ?? null : null,
  );
  const collapsed = $derived(
    userCollapsed ?? (selectedIdentity ? Boolean(field.collapsedByDefault) : false),
  );
  const activeSections = $derived(
    activeVariant
      ? groupFieldsBySection(
          Object.fromEntries(
            Object.entries(activeVariant.properties).filter(
              ([schemaKey]) => schemaKey !== field.identityField.schemaKey,
            ),
          ),
        )
      : [],
  );
  const outlineSections = $derived(buildOutlineSections(activeSections));

  function handleIdentityChange(event: Event) {
    selectedIdentity = (event.currentTarget as HTMLSelectElement).value;
    userCollapsed = null;
  }

  function handleCollapsedChange(nextCollapsed: boolean) {
    userCollapsed = nextCollapsed;
  }

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
        onchange={handleIdentityChange}
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
          No fields in this variant
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
                  {@render renderField?.(childField, root ? depth : depth + 1)}
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
