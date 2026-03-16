<script lang="ts">
  import type { Field, ObjectField as ObjectFieldType } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { groupFieldsBySection } from "../fieldHelpers";

  interface Props {
    field: ObjectFieldType;
    renderField?: Snippet<[Field]>;
    root?: boolean;
  }

  let { field, renderField, root = false }: Props = $props();

  const sections = $derived(groupFieldsBySection(field.properties));
</script>

{#snippet sectionList()}
  <div class="space-y-4">
    {#each sections as section (section.name)}
      <div class="space-y-2">
        {#if sections.length > 1 || section.name !== "General"}
          <div class="text-xs font-semibold tracking-wide uppercase opacity-65">{section.name}</div>
        {/if}

        <div class="space-y-3">
          {#each section.fields as childField, index (`${childField.schemaKey ?? childField.type}-${index}`)}
            {@render renderField?.(childField)}
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/snippet}

{#if root}
  {@render sectionList()}
{:else}
  <FieldPanel
    {field}
    summary={`${Object.keys(field.properties).length} subfields`}
    collapsedByDefault={field.collapsedByDefault ?? true}
    children={sectionList}
  />
{/if}
