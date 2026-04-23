<script lang="ts">
  import { flip } from "svelte/animate";
  import { GripVertical } from "lucide-svelte";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import type { Snippet } from "svelte";
  import SingleLineAutocompleteInput from "@webview-shared/components/SingleLineAutocompleteInput.svelte";
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import AddSearchMenu from "../AddSearchMenu.svelte";
  import FieldPanel from "../FieldPanel.svelte";
  import FieldRenderer from "../FieldRenderer.svelte";

  let {
    field,
    root = false,
    handle,
  }: {
    field: NpcPropertyField;
    root?: boolean;
    handle?: Snippet;
  } = $props();

  type StructuredRowView = {
    id: string;
    field: NpcPropertyField;
  };

  const FLIP_DURATION_MS = 100;

  let variantTypeDraft = $state("");
  let draftRowViews = $state<StructuredRowView[] | null>(null);

  $effect(() => {
    variantTypeDraft = field.variantType ?? "";
  });

  const issues = $derived(workspace.getFieldIssues(field.fieldPath));
  const fieldVscodeContext = $derived(
    workspace.buildFieldVscodeContext(field.fieldPath, {
      canDeleteField: field.canUnset !== false && field.isSet !== false,
    }),
  );
  const visibleChildren = $derived.by(() => {
    const childFields = field.childFields ?? [];
    if (field.structureKind === "array") {
      return childFields;
    }

    return childFields.filter(childField => childField.isSet !== false || childField.required === true);
  });
  const visibleRowViews = $derived(
    visibleChildren.map(childField => ({
      id: childField.id,
      field: childField,
    })),
  );
  const renderedRowViews = $derived(draftRowViews ?? visibleRowViews);
  const activeFlipDurationMs = $derived(draftRowViews ? FLIP_DURATION_MS : 0);
  const addableProperties = $derived.by(() => {
    if (field.structureKind !== "object") {
      return [];
    }

    return (field.childFields ?? [])
      .filter(childField => childField.isSet === false)
      .map(childField => ({
        id: childField.key,
        label: childField.label,
        summary: childField.description,
      }));
  });
  const promotedAddButtons = $derived.by(() => {
    if (field.structureKind !== "object") {
      return [];
    }

    return (field.childFields ?? [])
      .filter(childField => childField.isSet === false)
      .flatMap(childField => {
        if (childField.key === "Action" && childField.kind === "richObject" && childField.shapeKey === "Action") {
          return [
            {
              id: childField.key,
              label: "Add Inline Action",
            },
          ];
        }

        if (childField.key === "Actions" && childField.kind === "richObject") {
          return [
            {
              id: childField.key,
              label: "Add Actions",
            },
          ];
        }

        return [];
      });
  });
  const genericAddableProperties = $derived(
    addableProperties.filter(
      property => !promotedAddButtons.some(promotedButton => promotedButton.id === property.id),
    ),
  );
  const summary = $derived.by(() => {
    const count = visibleChildren.length;
    if (field.structureKind === "array") {
      return `${count} ${count === 1 ? "item" : "items"}`;
    }

    return `${count} ${count === 1 ? "property" : "properties"}`;
  });
  const typeOptions = $derived(
    (field.typeSuggestions ?? []).map(value => ({
      value,
    })),
  );
  const typeInputId = $derived(`npc-rich-object-type-${field.id}`);
  const emptyText = $derived.by(() => {
    if (field.structureKind === "array") {
      return "No items yet.";
    }

    if (field.typeSuggestions?.length && !field.variantType) {
      return `Select a ${field.shapeKey ?? "type"} to begin editing this block.`;
    }

    return "No set properties.";
  });
  const addItemButtonLabel = $derived.by(() => {
    switch (field.itemShapeKey) {
      case "Action":
        return "Add Action";
      case "MotionController":
        return "Add Motion Controller";
      case "WeightedAction":
        return "Add Weighted Action";
      case "RelativeWaypointDefinition":
        return "Add Waypoint";
      default:
        return "Add Item";
    }
  });

  function commitVariantType(value: string) {
    variantTypeDraft = value;
    workspace.setRichObjectVariantType(field.fieldPath, value);
  }

  function handleConsider(event: CustomEvent<DndEvent<StructuredRowView>>) {
    draftRowViews = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<DndEvent<StructuredRowView>>) {
    draftRowViews = null;
    workspace.reorderRichObjectArray(
      field.fieldPath,
      event.detail.items.map(item => item.id),
    );
  }
</script>

{#snippet rowHandle()}
  <div
    use:dragHandle
    class="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-vsc-muted opacity-80 outline-none transition-[color,opacity] hover:text-vsc-input-fg"
    aria-label="Reorder structured item"
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

{#snippet typeSelector()}
  {#if field.typeSuggestions?.length}
    <div class="space-y-1">
      <div class="text-xs font-medium uppercase tracking-wide text-vsc-muted">Type</div>
      <SingleLineAutocompleteInput
        inputId={typeInputId}
        initialValue={variantTypeDraft}
        data-vscode-context={"{}"}
        placeholder="Select type"
        autocompleteOptions={typeOptions}
        inputClass="w-full rounded-md border border-vsc-border px-3 py-2 text-vsc-input-fg placeholder:text-vsc-input-placeholder-fg placeholder:opacity-100 bg-vsc-input-bg"
        listClass="absolute left-0 right-0 top-full z-[160] max-h-40 overflow-auto rounded-t-none rounded-md border border-vsc-border bg-vsc-editor-widget-bg shadow-lg"
        optionClass="block w-full cursor-pointer px-3 py-2 text-left text-sm text-vsc-input-fg hover:bg-vsc-list-hover"
        previewClass="z-[160]"
        oncommit={commitVariantType}
        afterEnterPressed={input => input.blur()}
      />
    </div>
  {/if}
{/snippet}

{#snippet structureBody()}
  <div class="space-y-3">
    {@render typeSelector()}

    {#if visibleChildren.length === 0}
      <div class="rounded-md border border-dashed border-vsc-border px-3 py-2 text-sm text-vsc-muted opacity-75">
        {emptyText}
      </div>
    {:else if field.structureKind === "array"}
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
          {#each renderedRowViews as rowView (rowView.id)}
            <div animate:flip={{ duration: activeFlipDurationMs }}>
              <FieldRenderer field={rowView.field} handle={rowHandle} />
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="space-y-3">
        {#each visibleChildren as childField (childField.id)}
          <FieldRenderer field={childField} />
        {/each}
      </div>
    {/if}

    {#if field.structureKind === "object" && promotedAddButtons.length > 0}
      <div class="space-y-2">
        {#each promotedAddButtons as button (button.id)}
          <button
            type="button"
            class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
            onclick={() => {
              workspace.addRichObjectProperty(field.fieldPath, button.id);
            }}
          >
            {button.label}
          </button>
        {/each}
      </div>
    {/if}

    {#if field.structureKind === "object" && genericAddableProperties.length > 0}
      <AddSearchMenu
        buttonLabel="Add Property"
        searchPlaceholder="Search properties"
        emptyText="No matching properties."
        items={genericAddableProperties}
        onselect={item => {
          workspace.addRichObjectProperty(field.fieldPath, item.id);
        }}
      />
    {/if}

    {#if field.structureKind === "array"}
      <button
        type="button"
        class="flex w-full items-center gap-1 rounded-md border border-vsc-border bg-vsc-button-bg px-4 py-1.5 text-left text-xs font-medium text-vsc-button-fg opacity-80 hover:bg-vsc-button-hover"
        onclick={() => {
          workspace.addRichObjectArrayItem(field.fieldPath);
        }}
      >
        {addItemButtonLabel}
      </button>
    {/if}
  </div>
{/snippet}

{#if root}
  <div class="space-y-3">
    {@render structureBody()}
  </div>
{:else}
  <FieldPanel
    title={field.label}
    typeLabel={getNpcFieldTypeLabel(field)}
    required={field.required === true}
    description={field.description}
    issues={issues}
    inline={false}
    summary={summary}
    {handle}
    vscodeContext={fieldVscodeContext}
    onunset={field.canUnset !== false && field.isSet !== false
      ? () => {
          workspace.unsetField(field.fieldPath);
        }
      : undefined}
  >
    {@render structureBody()}
  </FieldPanel>
{/if}
