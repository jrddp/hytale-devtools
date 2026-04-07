<script lang="ts">
  import { flip } from "svelte/animate";
  import { tick } from "svelte";
  import { GripVertical, Plus } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import type { NpcPropertyParameterField, NpcPropertySection } from "../propertyModel";
  import {
    STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS,
    type StandardParameterEditableTypeOption,
  } from "../parsing/parameterEditorTypes";
  import { workspace } from "../workspace.svelte";
  import ParameterTypePicker from "./ParameterTypePicker.svelte";
  import ParameterField from "./fields/ParameterField.svelte";

  type ParameterRowView = {
    id: string;
    field: NpcPropertyParameterField;
  };

  const FLIP_DURATION_MS = 100;

  let { section }: { section: NpcPropertySection } = $props();

  let draftRowViews = $state<ParameterRowView[] | null>(null);
  let parameterNameInputs = $state<Record<string, HTMLInputElement | undefined>>({});
  let parameterDescriptionInputs = $state<Record<string, HTMLTextAreaElement | undefined>>({});
  let parameterDescriptionDrafts = $state<Record<string, string>>({});
  let editingParameterName = $state<string | null>(null);
  let editingParameterDescription = $state<string | null>(null);
  let parameterContextAnchors = $state<Record<string, { x: number; y: number }>>({});
  let typePickerState = $state<{
    parameterName: string;
    x: number;
    y: number;
  } | null>(null);

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
  const typePickerField = $derived(
    typePickerState
      ? parameterFields.find(field => field.parameterName === typePickerState.parameterName) ?? null
      : null,
  );

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

  $effect(() => {
    const requestVersion = workspace.parameterTypeChangeRequestVersion;
    const parameterName = workspace.parameterTypeChangeRequestName;
    if (requestVersion === 0 || !parameterName) {
      return;
    }

    workspace.clearParameterTypeChangeRequest();
    const anchor = parameterContextAnchors[parameterName];
    if (!anchor) {
      return;
    }

    typePickerState = {
      parameterName,
      ...anchor,
    };
  });

  $effect(() => {
    const requestVersion = workspace.parameterDescriptionRequestVersion;
    const parameterName = workspace.parameterDescriptionRequestName;
    if (requestVersion === 0 || !parameterName) {
      return;
    }

    if (parameterFields.some(field => field.parameterName === parameterName)) {
      workspace.clearParameterDescriptionRequest();
      void enterDescriptionEditMode(parameterName);
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
    editingParameterDescription = null;
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

  function syncDescriptionTextareaHeight(parameterName: string) {
    const textarea = parameterDescriptionInputs[parameterName];
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  async function enterDescriptionEditMode(parameterName: string) {
    editingParameterName = null;
    editingParameterDescription = parameterName;
    parameterDescriptionDrafts[parameterName] =
      parameterFields.find(field => field.parameterName === parameterName)?.description ?? "";
    await tick();
    const textarea = parameterDescriptionInputs[parameterName];
    if (!textarea) {
      return;
    }

    syncDescriptionTextareaHeight(parameterName);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function commitDescription(parameterName: string) {
    workspace.updateStandardParameterDescription(
      parameterName,
      parameterDescriptionDrafts[parameterName] ?? "",
    );
    editingParameterDescription = null;
  }

  function handleRowContextMenu(parameterName: string, event: MouseEvent) {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("input, textarea, [contenteditable='true']")
    ) {
      return;
    }

    parameterContextAnchors[parameterName] = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function getPickerTypeForField(
    field: NpcPropertyParameterField,
  ): StandardParameterEditableTypeOption["value"] {
    return STANDARD_PARAMETER_EDITOR_TYPE_OPTIONS.some(option => option.value === field.editorType)
      ? (field.editorType as StandardParameterEditableTypeOption["value"])
      : "string";
  }

  function closeTypePicker() {
    typePickerState = null;
  }
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === "Escape") {
      if (editingParameterName) {
        editingParameterName = null;
      }
      if (editingParameterDescription) {
        commitDescription(editingParameterDescription);
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

              {#snippet rowTooltipContent()}
                <div class="space-y-2">
                  <div class="space-y-1">
                    <div class="font-semibold">
                      {rowView.field.label}{#if rowView.field.typeLabel}&nbsp;({rowView.field.typeLabel}){/if}
                    </div>

                    {#if editingParameterDescription === rowView.field.parameterName}
                    <textarea
                      bind:this={parameterDescriptionInputs[rowView.field.parameterName]}
                      class="w-80 resize-none overflow-hidden rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-sm leading-5 text-vsc-input-fg outline-none"
                      data-vscode-context={"{}"}
                      value={parameterDescriptionDrafts[rowView.field.parameterName] ??
                        rowView.field.description ??
                        ""}
                      rows={1}
                      spellcheck={false}
                        aria-label="Parameter description"
                        placeholder="Add description"
                      oninput={event => {
                        parameterDescriptionDrafts[rowView.field.parameterName] =
                          event.currentTarget.value;
                        syncDescriptionTextareaHeight(rowView.field.parameterName);
                      }}
                        onkeydown={event => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            commitDescription(rowView.field.parameterName);
                            return;
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            commitDescription(rowView.field.parameterName);
                          }
                        }}
                        onblur={() => {
                          if (editingParameterDescription === rowView.field.parameterName) {
                            commitDescription(rowView.field.parameterName);
                          }
                        }}
                      ></textarea>
                    {:else}
                      <div class="whitespace-pre-line">
                        {rowView.field.description || "No description."}
                      </div>
                    {/if}
                  </div>

                  {#if (rowView.field.infoItems?.length ?? 0) > 0}
                    <dl class="space-y-1">
                      {#each rowView.field.infoItems ?? [] as item (`${item.label}-${item.value}`)}
                        <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                          <dt class="text-vsc-muted">{item.label}</dt>
                          <dd class="break-words">{item.value}</dd>
                        </div>
                      {/each}
                    </dl>
                  {/if}
                </div>
              {/snippet}

              <ParameterField
                field={rowView.field}
                titleContent={rowTitle}
                tooltipContent={rowTooltipContent}
                handle={rowHandle}
                onContextMenu={event => handleRowContextMenu(rowView.field.parameterName, event)}
                onInfoClick={() => {
                  void enterDescriptionEditMode(rowView.field.parameterName);
                }}
                interactiveInfoTooltip={true}
                infoTooltipPinned={editingParameterDescription === rowView.field.parameterName}
                hideInfoButton={editingParameterName === rowView.field.parameterName}
                vscodeContext={editingParameterName !== rowView.field.parameterName
                  ? JSON.stringify({
                      webviewSection: "npcParameterRow",
                      parameterName: rowView.field.parameterName,
                      parameterHasDescription: Boolean(rowView.field.description),
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

  {#if typePickerState && typePickerField}
      <ParameterTypePicker
        x={typePickerState.x}
        y={typePickerState.y}
        currentType={getPickerTypeForField(typePickerField)}
        onclose={closeTypePicker}
        onselect={value => {
          workspace.updateStandardParameterEditorType(typePickerState.parameterName, value);
          closeTypePicker();
        }}
      />
  {/if}
</section>
