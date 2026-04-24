<script lang="ts">
  import type { NpcPropertySection } from "../propertyModel";
  import ContentSection from "./ContentSection.svelte";
  import FieldRenderer from "./FieldRenderer.svelte";
  import ParameterSection from "./ParameterSection.svelte";
  import RoleAttributesSection from "./RoleAttributesSection.svelte";
  import SingleRootSection from "./SingleRootSection.svelte";
  import VariantModifySection from "./VariantModifySection.svelte";
  import { workspace } from "../workspace.svelte";

  let { section }: { section: NpcPropertySection } = $props();
</script>

{#if section.id === "parameters"}
  <ParameterSection {section} />
{:else if section.id === "modify"}
  <VariantModifySection {section} />
{:else if section.id === "content"}
  <ContentSection {section} />
{:else if section.id === "roleAttributes"}
  <RoleAttributesSection {section} />
{:else if section.id === "instructions"}
  <SingleRootSection
    {section}
    addButtonLabel="Add Instructions"
    onadd={() => {
      workspace.addTopLevelInstructionRoot("Instructions");
    }}
  />
{:else if section.id === "interactionInstruction"}
  <SingleRootSection
    {section}
    addButtonLabel="Add Interaction Instruction"
    onadd={() => {
      workspace.addTopLevelInstructionRoot("InteractionInstruction");
    }}
  />
{:else if section.id === "deathInstruction"}
  <SingleRootSection
    {section}
    addButtonLabel="Add Death Instruction"
    onadd={() => {
      workspace.addTopLevelInstructionRoot("DeathInstruction");
    }}
  />
{:else if section.id === "motionControllerList"}
  <SingleRootSection
    {section}
    addButtonLabel="Add Motion Controller"
    onadd={() => {
      workspace.addRichObjectArrayItem("MotionControllerList");
    }}
  />
{:else if section.id === "stateTransitions"}
  <SingleRootSection
    {section}
    addButtonLabel="Add State Transition"
    onadd={() => {
      workspace.addTopLevelStateTransitionsRoot();
    }}
  />
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
