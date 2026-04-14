<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import type { Snippet } from "svelte";
  import ComputeAutocompleteInput from "@webview-shared/components/ComputeAutocompleteInput.svelte";
  import {
    buildNpcComputeAutocompleteOptions,
  } from "../../compute/computeAutocomplete";
  import type {
    NpcFieldValue,
    NpcPropertyField,
    NpcStateTransitionEdge,
    NpcStateTransitionEntry,
  } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldComputeToggleButton from "../FieldComputeToggleButton.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import FieldRenderer from "../FieldRenderer.svelte";
  import StateNameListEditor from "./StateNameListEditor.svelte";

  type TransitionView = {
    id: string;
    entry: NpcStateTransitionEntry;
  };

  type EdgeView = {
    id: string;
    edge: NpcStateTransitionEdge;
  };

  const FLIP_DURATION_MS = 100;

  let {
    field,
    root = false,
    handle,
  }: {
    field: NpcPropertyField;
    root?: boolean;
    handle?: Snippet;
  } = $props();

  let draftTransitionViews = $state<TransitionView[] | null>(null);
  let draftEdgeViewsByTransitionId = $state<Record<string, EdgeView[] | null>>({});

  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: workspace.getStandardParameterFields(),
      scope: "standard",
    }),
  );
  const transitionViews = $derived(
    (field.transitions ?? []).map(entry => ({
      id: entry.id,
      entry,
    })),
  );
  const renderedTransitionViews = $derived(draftTransitionViews ?? transitionViews);

  function summarizeTransition(entry: NpcStateTransitionEntry, fallbackIndex: number): string {
    const firstEdge = entry.edges[0];
    if (!firstEdge) {
      return `Transition ${fallbackIndex + 1}`;
    }

    const fromLabel = firstEdge.from.length > 0 ? firstEdge.from.join(", ") : "*";
    const toLabel = firstEdge.to.length > 0 ? firstEdge.to.join(", ") : "*";
    return `[${fromLabel}] -> [${toLabel}]`;
  }

  function summarizeEdge(edge: NpcStateTransitionEdge, fallbackIndex: number): string {
    const fromLabel = edge.from.length > 0 ? edge.from.join(", ") : "*";
    const toLabel = edge.to.length > 0 ? edge.to.join(", ") : "*";
    if (!fromLabel && !toLabel) {
      return `Edge ${fallbackIndex + 1}`;
    }

    return `[${fromLabel}] -> [${toLabel}]`;
  }

  function getRenderedEdgeViews(entry: NpcStateTransitionEntry): EdgeView[] {
    return draftEdgeViewsByTransitionId[entry.id] ?? entry.edges.map(edge => ({ id: edge.id, edge }));
  }

  function handleTransitionConsider(event: CustomEvent<DndEvent<TransitionView>>) {
    draftTransitionViews = event.detail.items;
  }

  function handleTransitionFinalize(event: CustomEvent<DndEvent<TransitionView>>) {
    draftTransitionViews = null;
    workspace.reorderStateTransitions(
      field.fieldPath,
      event.detail.items.map(item => item.id),
    );
  }

  function handleEdgeConsider(
    transitionId: string,
    event: CustomEvent<DndEvent<EdgeView>>,
  ) {
    draftEdgeViewsByTransitionId = {
      ...draftEdgeViewsByTransitionId,
      [transitionId]: event.detail.items,
    };
  }

  function handleEdgeFinalize(
    transitionId: string,
    event: CustomEvent<DndEvent<EdgeView>>,
  ) {
    draftEdgeViewsByTransitionId = {
      ...draftEdgeViewsByTransitionId,
      [transitionId]: null,
    };
    workspace.reorderStateTransitionEdges(
      field.fieldPath,
      transitionId,
      event.detail.items.map(item => item.id),
    );
  }

  function toggleFieldValue(
    value: NpcFieldValue | undefined,
    onupdate: (value: NpcFieldValue | undefined) => void,
  ) {
    if (!value) {
      onupdate({ kind: "compute", expression: "" });
      return;
    }

    onupdate(
      value.kind === "compute"
        ? { kind: "literal", value: false }
        : { kind: "compute", expression: String(value.value) },
    );
  }
</script>

{#snippet rowHandle()}
  <div
    use:dragHandle
    class="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-80 outline-none transition-[color,opacity] hover:text-vsc-input-fg"
    aria-label="Reorder item"
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

{#snippet renderEnabledEditor(
  title: string,
  inputKey: string,
  value: NpcFieldValue | undefined,
  onupdate: (value: NpcFieldValue | undefined) => void
)}
  {#if value}
    {#snippet computeToggle()}
      <FieldComputeToggleButton
        enabled
        active={value.kind === "compute"}
        ontoggle={() => toggleFieldValue(value, onupdate)}
      />
    {/snippet}
    <FieldPanel
      {title}
      typeLabel={value.kind === "compute" ? "Compute" : "Boolean"}
      titleActions={computeToggle}
    >
      {#if value.kind === "compute"}
        <ComputeAutocompleteInput
          inputId={`${field.id}-${inputKey}`}
          initialValue={value.expression}
          data-vscode-context={"{}"}
          placeholder="Type for suggestions"
          autocompleteOptions={computeAutocompleteOptions}
          inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
          listClass="absolute left-0 right-0 top-full z-[160] max-h-56 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
          optionClass="block w-full cursor-pointer border border-transparent px-3 py-2 text-left text-vsc-input-fg hover:bg-vsc-list-hover"
          oncommit={expression => {
            onupdate({
              kind: "compute",
              expression,
            });
          }}
        />
      {:else}
        <div class="inline-flex">
          <input
            class="size-6 accent-vsc-activity-bar-badge-bg"
            type="checkbox"
            checked={Boolean(value.value)}
            onchange={event => {
              onupdate({
                kind: "literal",
                value: event.currentTarget.checked,
              });
            }}
          />
        </div>
      {/if}
    </FieldPanel>
  {/if}
{/snippet}

{#snippet renderPriorityEditor(
  transitionId: string,
  edgeId: string,
  priority: number | undefined
)}
  {#if priority !== undefined}
    <FieldPanel title="Priority" typeLabel="Number">
      <input
        type="text"
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        value={String(priority)}
        inputmode="numeric"
        oninput={event => {
          event.currentTarget.value = event.currentTarget.value
            .trim()
            .replace(/[^\d-]/g, "")
            .replace(/(?!^)-/g, "");
        }}
        onblur={event => {
          const nextValue = Number(event.currentTarget.value);
          workspace.updateStateTransitionEdgePriority(
            field.fieldPath,
            transitionId,
            edgeId,
            Number.isNaN(nextValue) ? priority : nextValue,
          );
        }}
      />
    </FieldPanel>
  {/if}
{/snippet}

{#snippet transitionBody(entry: NpcStateTransitionEntry)}
  <div class="space-y-3">
    <FieldPanel title="$Comment" typeLabel="String">
      <input
        type="text"
        class="w-full rounded-md border border-vsc-border bg-vsc-input-bg px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100"
        value={entry.comment ?? ""}
        placeholder="Optional comment"
        onblur={event => {
          workspace.updateStateTransitionComment(field.fieldPath, entry.id, event.currentTarget.value);
        }}
      />
    </FieldPanel>

    {@render renderEnabledEditor("Enabled", `${entry.id}-enabled`, entry.enabled, value => {
      workspace.updateStateTransitionEnabled(field.fieldPath, entry.id, value);
    })}

    <div class="space-y-3">
      <div class="text-sm font-semibold text-vsc-muted">States</div>

      <div
        class="space-y-3"
        use:dragHandleZone={{
          items: getRenderedEdgeViews(entry),
          flipDurationMs: FLIP_DURATION_MS,
          dropFromOthersDisabled: true,
          dropTargetStyle: {
            outline: "none",
          },
        }}
        onconsider={event => handleEdgeConsider(entry.id, event)}
        onfinalize={event => handleEdgeFinalize(entry.id, event)}
      >
        {#each getRenderedEdgeViews(entry) as edgeView, edgeIndex (edgeView.id)}
          <div animate:flip={{ duration: FLIP_DURATION_MS }}>
            <FieldPanel
              title={`Edge ${edgeIndex + 1}`}
              typeLabel="State Transition Edge"
              inline={false}
              summary={summarizeEdge(edgeView.edge, edgeIndex)}
              handle={rowHandle}
              onunset={() => {
                workspace.removeStateTransitionEdge(field.fieldPath, entry.id, edgeView.id);
              }}
            >
              <div class="space-y-3">
                <StateNameListEditor
                  title="From"
                  values={edgeView.edge.from}
                  suggestions={workspace.discoveredStates}
                  emptyText="Matches any state."
                  onchange={values => {
                    workspace.updateStateTransitionEdgeStates(
                      field.fieldPath,
                      entry.id,
                      edgeView.id,
                      "from",
                      values,
                    );
                  }}
                />

                <StateNameListEditor
                  title="To"
                  values={edgeView.edge.to}
                  suggestions={workspace.discoveredStates}
                  emptyText="Matches any destination state."
                  onchange={values => {
                    workspace.updateStateTransitionEdgeStates(
                      field.fieldPath,
                      entry.id,
                      edgeView.id,
                      "to",
                      values,
                    );
                  }}
                />

                {@render renderPriorityEditor(entry.id, edgeView.id, edgeView.edge.priority)}

                {@render renderEnabledEditor("Enabled", `${entry.id}-${edgeView.id}-enabled`, edgeView.edge.enabled, value => {
                  workspace.updateStateTransitionEdgeEnabled(
                    field.fieldPath,
                    entry.id,
                    edgeView.id,
                    value,
                  );
                })}
              </div>
            </FieldPanel>
          </div>
        {/each}
      </div>

      <button
        type="button"
        class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
        onclick={() => {
          workspace.addStateTransitionEdge(field.fieldPath, entry.id);
        }}
      >
        Add Edge
      </button>
    </div>

    <div class="space-y-2">
      <div class="text-sm font-semibold text-vsc-muted">Actions</div>
      <FieldRenderer field={entry.actionsField} root={true} />
    </div>
  </div>
{/snippet}

{#snippet editor()}
  {#if renderedTransitionViews.length > 0}
    <div
      class="space-y-3"
      use:dragHandleZone={{
        items: renderedTransitionViews,
        flipDurationMs: FLIP_DURATION_MS,
        dropFromOthersDisabled: true,
        dropTargetStyle: {
          outline: "none",
        },
      }}
      onconsider={handleTransitionConsider}
      onfinalize={handleTransitionFinalize}
    >
      {#each renderedTransitionViews as transitionView, index (transitionView.id)}
        <div animate:flip={{ duration: FLIP_DURATION_MS }}>
          <FieldPanel
            title={`Transition ${index + 1}`}
            typeLabel="State Transition"
            inline={false}
            summary={summarizeTransition(transitionView.entry, index)}
            handle={rowHandle}
            onunset={() => {
              workspace.removeStateTransition(field.fieldPath, transitionView.id);
            }}
            bind:collapsed={transitionView.entry.ui.collapsed}
          >
            {@render transitionBody(transitionView.entry)}
          </FieldPanel>
        </div>
      {/each}
    </div>
  {:else}
    <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted opacity-80">
      No transitions yet.
    </div>
  {/if}

  <button
    type="button"
    class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
    onclick={() => {
      workspace.addStateTransition(field.fieldPath);
    }}
  >
    Add State Transition
  </button>
{/snippet}

{#if root}
  <div class="space-y-3">
    {@render editor()}
  </div>
{:else}
  <FieldPanel title={field.label} typeLabel="State Transitions" {handle}>
    {@render editor()}
  </FieldPanel>
{/if}
