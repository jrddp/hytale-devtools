<script lang="ts">
  import { type RenderFieldProps } from "src/common";
  import FieldRenderer from "src/components/FieldRenderer.svelte";
  import { type ObjectFieldInstance } from "src/parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import {
    buildOutlineSections,
    groupFieldsBySection,
    isFieldSet,
    type OutlineSection,
  } from "../fieldHelpers";

  const {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    onunset,
    root = false,
    renderSections: renderSectionHeaders = false,
    onSectionsChange,
    handle,
    ...props
  }: RenderFieldProps<ObjectFieldInstance> & {
    root?: boolean;
    renderSections?: boolean;
    onSectionsChange?: (sections: OutlineSection[]) => void;
  } = $props();

  const properties = $derived(field.properties ?? {});
  const visibleProperties = $derived(
    workspace.hideUnsetFields
      ? Object.fromEntries(
          Object.entries(properties).filter(([, childField]) => isFieldSet(childField)),
        )
      : properties,
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
    <div class="px-3 py-2 border border-dashed rounded-md border-vsc-border opacity-65">
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
          {#if renderSectionHeaders && (sections.length > 1 || section.name !== "General")}
            <div class="text-lg font-semibold tracking-wide">{section.name}</div>
          {/if}

          <div class="space-y-3">
            {#each section.fields as childField, index (`${childField.schemaKey ?? childField.type}-${index}`)}
              <FieldRenderer
                field={childField}
                depth={root ? depth : depth + 1}
                {readOnly}
                {readOnlyMessage}
              />
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
    {readOnly}
    fieldPanelOverrides={fieldPanelOverrides}
    {handle}
    {onunset}
    summary={`${Object.keys(properties).length} subfields`}
    collapsedByDefault={field.collapsedByDefault ?? true}
    children={sectionList}
  />
{/if}
