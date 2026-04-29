<script lang="ts">
  import type { RenderFieldProps } from "src/common";
  import InlineReferenceToggleButton from "src/components/InlineReferenceToggleButton.svelte";
  import ObjectField from "src/components/fields/ObjectField.svelte";
  import StringField from "src/components/fields/StringField.svelte";
  import VariantField from "src/components/fields/VariantField.svelte";
  import type { InlineOrReferenceFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    glyphs: externalGlyphs,
    ...props
  }: RenderFieldProps<InlineOrReferenceFieldInstance> = $props();

  let modeError = $state("");
  const isReferenceMode = $derived(field.activeField.type === "string");

  function switchToReferenceMode() {
    field.activeField = workspace.createEmptyFieldInstance(field.stringField);
  }

  function switchToInlineMode() {
    const nextField = workspace.createEmptyFieldInstance(field.inlineField);
    if (nextField.type !== "object" && nextField.type !== "variant") {
      throw new Error(`Expected inline object or variant field, received ${nextField.type}.`);
    }

    field.activeField = nextField;
  }

  function toggleReferenceMode() {
    if (readOnly) {
      return;
    }

    try {
      modeError = "";
      const shouldPreserveUnserializedState = isReferenceMode;
      if (isReferenceMode) {
        switchToInlineMode();
      } else {
        switchToReferenceMode();
      }
      workspace.syncFieldPaths(field);
      workspace.applyDocumentState({
        preserveUnserializedStateOnNoop: shouldPreserveUnserializedState,
      });
    } catch (error) {
      modeError = error instanceof Error ? error.message : String(error);
    }
  }

  function getUnsupportedFieldType(value: unknown): string {
    return typeof value === "object" && value !== null && "type" in value
      ? String((value as { type: unknown }).type)
      : "unknown";
  }
</script>

{#snippet modeToggle()}
  <InlineReferenceToggleButton
    enabled={!readOnly}
    active={isReferenceMode}
    ontoggle={toggleReferenceMode}
  />
  {@render externalGlyphs?.()}
{/snippet}

{#if field.activeField.type === "string"}
  <StringField
    field={field.activeField}
    {depth}
    {readOnly}
    {readOnlyMessage}
    glyphs={modeToggle}
    {...props}
  />
{:else if field.activeField.type === "object"}
  <ObjectField
    field={field.activeField}
    {depth}
    {readOnly}
    {readOnlyMessage}
    glyphs={modeToggle}
    {...props}
  />
{:else if field.activeField.type === "variant"}
  <VariantField
    field={field.activeField}
    {depth}
    {readOnly}
    {readOnlyMessage}
    glyphs={modeToggle}
    {...props}
  />
{:else}
  <div class="rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-sm text-vsc-error">
    Unsupported inline/reference field mode: {getUnsupportedFieldType(field.activeField)}
  </div>
{/if}

{#if modeError}
  <div class="mt-2 rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-xs text-vsc-error">
    Unable to switch inline/reference mode: {modeError}
  </div>
{/if}
