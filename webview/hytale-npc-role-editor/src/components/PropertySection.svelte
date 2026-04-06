<script lang="ts">
  import type { NpcPropertySection } from "../propertyModel";
  import FieldRenderer from "./FieldRenderer.svelte";
  import ParameterSection from "./ParameterSection.svelte";

  let { section }: { section: NpcPropertySection } = $props();
</script>

{#if section.id === "npc-section-parameters"}
  <ParameterSection {section} />
{:else}
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
    </div>
  </section>
{/if}
