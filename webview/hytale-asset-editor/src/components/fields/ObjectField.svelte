<script lang="ts">
  import type { Field, ObjectField as ObjectFieldType } from "@shared/fieldTypes";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import { groupFieldsBySection } from "../fieldHelpers";

  interface Props {
    field: ObjectFieldType;
    renderField?: Snippet<[Field]>;
    root?: boolean;
  }

  let { field, renderField, root = false }: Props = $props();

  let collapsed = $state(false);
  const sections = $derived(groupFieldsBySection(field.properties));

  onMount(() => {
    collapsed = !root && Boolean(field.collapsedByDefault);
  });
</script>

{#snippet sectionList()}
  <div class="space-y-4">
    {#each sections as section (section.name)}
      <div class="space-y-2">
        {#if !root || sections.length > 1 || section.name !== "General"}
          <div class="text-xs font-semibold uppercase tracking-wide opacity-65">{section.name}</div>
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
  <FieldPanel field={field} summary={`${Object.keys(field.properties).length} fields`}>
    {#snippet actions()}
      <button
        type="button"
        class="rounded-md border border-vsc-border px-2 py-1 text-xs hover:bg-vsc-panel-hover"
        onclick={() => (collapsed = !collapsed)}
      >
        {collapsed ? "Expand" : "Collapse"}
      </button>
    {/snippet}

    {#if !collapsed}
      {@render sectionList()}
    {/if}
  </FieldPanel>
{/if}
