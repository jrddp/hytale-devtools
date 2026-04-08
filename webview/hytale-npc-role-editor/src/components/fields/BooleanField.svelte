<script lang="ts">
  import { getNpcFieldTypeLabel, type NpcPropertyField } from "../../propertyModel";
  import { workspace } from "../../workspace.svelte";
  import FieldPanel from "../FieldPanel.svelte";

  let { field }: { field: NpcPropertyField } = $props();

  let checked = $state(false);

  $effect(() => {
    checked = field.value.kind === "literal" && field.value.value === true;
  });

  const fieldVscodeContext = $derived(workspace.buildFieldVscodeContext(field.fieldPath));
  const issues = $derived(workspace.getFieldIssues(field.fieldPath));
</script>

<FieldPanel
  title={field.label}
  typeLabel={getNpcFieldTypeLabel(field)}
  description={field.description}
  issues={issues}
  vscodeContext={fieldVscodeContext}
  onunset={field.canUnset !== false && field.isSet !== false
    ? () => {
        workspace.unsetField(field.fieldPath);
      }
    : undefined}
>
  <div class="inline-flex">
    <input
      class="size-6 accent-vsc-activity-bar-badge-bg"
      type="checkbox"
      data-vscode-context={"{}"}
      bind:checked
      onchange={event => workspace.updateFieldValue(field.fieldPath, event.currentTarget.checked)}
    />
  </div>
</FieldPanel>
