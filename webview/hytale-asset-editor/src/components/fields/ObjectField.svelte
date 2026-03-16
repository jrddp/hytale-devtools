<script lang="ts">
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { buildOutlineSections, type OutlineSection, groupFieldsBySection, isFieldVisible } from "../fieldHelpers";
  import { workspace } from "../../workspace.svelte";
  import type { FieldInstance, ObjectFieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: ObjectFieldInstance;
    renderField?: Snippet<[FieldInstance, number, (() => void)?]>;
    depth?: number;
    root?: boolean;
    onSectionsChange?: (sections: OutlineSection[]) => void;
  }

  let { field, renderField, depth = 0, root = false, onSectionsChange }: Props = $props();

  const visibleProperties = $derived.by(() =>
    Object.fromEntries(
      Object.entries(field.properties).filter(([, childField]) =>
        isFieldVisible(childField, workspace.hideUnsetFields),
      ),
    ),
  );
  const sections = $derived(groupFieldsBySection(visibleProperties));
  const outlineSections = $derived(buildOutlineSections(sections));

  $effect(() => {
    if (!root) return;

    onSectionsChange?.(outlineSections);
  });
</script>

{#snippet sectionList()}
  {#if sections.length === 0}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 opacity-65">
      {workspace.hideUnsetFields ? "No set fields" : "No fields"}
    </div>
  {:else}
    <div class="space-y-4">
      {#each sections as section, index (section.name)}
        <section
          class="space-y-2 scroll-m-4"
          id={root ? outlineSections[index]?.id : undefined}
          data-outline-section-id={root ? outlineSections[index]?.id : undefined}
        >
          {#if sections.length > 1 || section.name !== "General"}
            <div class="text-lg font-semibold tracking-wide">{section.name}</div>
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
{/snippet}

{#if root}
  {@render sectionList()}
{:else}
  <FieldPanel
    {field}
    {depth}
    summary={`${Object.keys(field.properties).length} subfields`}
    collapsedByDefault={field.collapsedByDefault ?? true}
    children={sectionList}
  />
{/if}
