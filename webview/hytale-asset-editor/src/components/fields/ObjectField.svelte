<script lang="ts">
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { buildOutlineSections, type OutlineSection, groupFieldsBySection } from "../fieldHelpers";
  import type { FieldInstance, ObjectFieldInstance } from "../../parsing/fieldInstances";

  interface Props {
    field: ObjectFieldInstance;
    renderField?: Snippet<[FieldInstance, number]>;
    depth?: number;
    root?: boolean;
    onSectionsChange?: (sections: OutlineSection[]) => void;
  }

  let { field, renderField, depth = 0, root = false, onSectionsChange }: Props = $props();

  const sections = $derived(groupFieldsBySection(field.properties));
  const outlineSections = $derived(buildOutlineSections(sections));

  $effect(() => {
    if (!root) return;

    onSectionsChange?.(outlineSections);
  });
</script>

{#snippet sectionList()}
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
            {@render renderField?.(childField, root ? depth : depth + 1)}
          {/each}
        </div>
      </section>
    {/each}
  </div>
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
