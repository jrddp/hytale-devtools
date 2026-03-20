<script lang="ts">
  import type { RenderFieldProps } from "src/common";
  import ReadOnlyInputWrapper from "src/components/ReadOnlyInputWrapper.svelte";
  import type { BooleanFieldInstance } from "../../parsing/fieldInstances";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let {
    field,
    depth = 0,
    readOnly = false,
    readOnlyMessage,
    fieldPanelOverrides,
    onunset,
  }: RenderFieldProps<BooleanFieldInstance> = $props();

  const isSet = $derived(field.value !== undefined);
  const checked = $derived(field.value ?? field.inheritedValue ?? field.default ?? false);
  const fallbackLabel = $derived.by(() => {
    if (field.value !== undefined) {
      return null;
    }

    if (field.inheritedValue !== undefined) {
      return "Inherited";
    }

    return "Default";
  });

  function commitValue(value: boolean) {
    field.value = value;
    workspace.applyDocumentState();
  }

  function unsetValue() {
    field.value = undefined;
    workspace.applyDocumentState();
  }
</script>

<FieldPanel
  {field}
  {depth}
  {readOnly}
  fieldPanelOverrides={fieldPanelOverrides}
  inline
  onunset={!readOnly && isSet ? (onunset ?? unsetValue) : undefined}
>
  <ReadOnlyInputWrapper
    readOnly={readOnly}
    {readOnlyMessage}
    blockPointerDown={readOnly}
    class="inline-flex"
  >
    <div class="flex items-center gap-2">
      <input
        class="size-6 accent-vsc-activity-bar-badge-bg"
        class:accent-vsc-muted={!isSet}
        class:cursor-default={readOnly}
        class:opacity-70={readOnly}
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onchange={event => commitValue(event.currentTarget.checked)}
      />
      {#if fallbackLabel}
        <div class="italic text-vsc-muted opacity-70">({fallbackLabel})</div>
      {/if}
    </div>
  </ReadOnlyInputWrapper>
</FieldPanel>
