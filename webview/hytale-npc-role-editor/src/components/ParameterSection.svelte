<script lang="ts">
  import { flip } from "svelte/animate";
  import { tick } from "svelte";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import type { NpcPropertyParameterField, NpcPropertySection } from "../propertyModel";
  import { workspace } from "../workspace.svelte";
  import ParameterField from "./fields/ParameterField.svelte";

  type ParameterRowView = {
    id: string;
    field: NpcPropertyParameterField;
  };

  const FLIP_DURATION_MS = 100;

  let { section }: { section: NpcPropertySection } = $props();

  let draftRowViews = $state<ParameterRowView[] | null>(null);
  let parameterNameInputs = $state<Record<string, HTMLInputElement | undefined>>({});
  let editingParameterName = $state<string | null>(null);

  const parameterFields = $derived(
    section.fields.filter(field => field.type === "parameter") as NpcPropertyParameterField[],
  );
  const visibleRowViews = $derived(
    parameterFields.map(field => ({
      id: field.parameterName,
      field,
    })),
  );
  const renderedRowViews = $derived(draftRowViews ?? visibleRowViews);
  const activeFlipDurationMs = $derived(draftRowViews ? FLIP_DURATION_MS : 0);

  $effect(() => {
    const requestVersion = workspace.parameterRenameRequestVersion;
    const parameterName = workspace.parameterRenameRequestName;
    if (requestVersion === 0 || !parameterName) {
      return;
    }

    if (parameterFields.some(field => field.parameterName === parameterName)) {
      workspace.clearParameterRenameRequest();
      void enterEditMode(parameterName);
    }
  });

  function handleConsider(event: CustomEvent<DndEvent<ParameterRowView>>) {
    draftRowViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<ParameterRowView>>) {
    draftRowViews = null;
    workspace.reorderStandardParameters(event.detail.items.map(item => item.field.parameterName));
  }

  async function addParameter() {
    const nextName = workspace.addStandardParameter();
    if (!nextName) {
      return;
    }

    editingParameterName = nextName;
    await tick();
    focusParameterNameInput(nextName);
  }

  function commitRename(currentName: string, nextName: string) {
    workspace.renameStandardParameter(currentName, nextName);
    editingParameterName = null;
  }

  async function enterEditMode(parameterName: string) {
    editingParameterName = parameterName;
    await tick();
    focusParameterNameInput(parameterName);
  }

  function focusParameterNameInput(parameterName: string) {
    const input = parameterNameInputs[parameterName];
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === "Escape") {
      if (editingParameterName) {
        editingParameterName = null;
      }
    }
  }}
/>

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
    {#if renderedRowViews.length > 0}
      <div class="relative">
        <div
          class="space-y-3"
          use:dragHandleZone={{
            items: renderedRowViews,
            flipDurationMs: activeFlipDurationMs,
            dropFromOthersDisabled: true,
            dropTargetStyle: {
              outline: "none",
            },
          }}
          onconsider={handleConsider}
          onfinalize={handleFinalize}
        >
          {#each renderedRowViews as rowView, index (rowView.id)}
            <div animate:flip={{ duration: activeFlipDurationMs }}>
              {#snippet rowHandle()}
                <div
                  use:dragHandle
                  class="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-80 outline-none transition-[color,opacity] hover:text-vsc-input-fg"
                  aria-label={`Reorder ${rowView.field.parameterName} parameter ${index + 1}`}
                  role="button"
                  tabindex={-1}
                  onclick={event => event.stopPropagation()}
                  onkeydown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                    }
                  }}
                >
                  <GripVertical size={14} />
                </div>
              {/snippet}

              {#snippet rowTitle()}
                <div class="flex min-w-0 items-center gap-1">
                  {#if editingParameterName === rowView.field.parameterName}
                    <input
                      bind:this={parameterNameInputs[rowView.field.parameterName]}
                      class="min-w-0 flex-1 bg-transparent text-sm font-semibold text-vsc-input-fg outline-none"
                      data-vscode-context={"{}"}
                      value={rowView.field.parameterName}
                      spellcheck={false}
                      aria-label="Parameter name"
                      placeholder="Parameter name"
                      onclick={event => event.stopPropagation()}
                      onkeydown={event => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(rowView.field.parameterName, event.currentTarget.value);
                          return;
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          editingParameterName = null;
                        }
                      }}
                      onblur={event =>
                        editingParameterName === rowView.field.parameterName &&
                        commitRename(rowView.field.parameterName, event.currentTarget.value)}
                    />
                  {:else}
                    <div
                      class="truncate text-sm font-semibold select-none"
                      role="presentation"
                      ondblclick={() => enterEditMode(rowView.field.parameterName)}
                    >
                      {rowView.field.parameterName}
                    </div>
                  {/if}
                </div>
              {/snippet}

              <ParameterField
                field={rowView.field}
                titleContent={rowTitle}
                handle={rowHandle}
                hideInfoButton={editingParameterName === rowView.field.parameterName}
                vscodeContext={editingParameterName !== rowView.field.parameterName
                  ? JSON.stringify({
                      webviewSection: "npcParameterRow",
                      parameterName: rowView.field.parameterName,
                    })
                  : undefined}
              />
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <button
      type="button"
      class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
      onclick={addParameter}
    >
      <Plus size={14} />
      Add Parameter
    </button>
  </div>
</section>
