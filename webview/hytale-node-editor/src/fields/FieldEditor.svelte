<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import TextField from "./TextField.svelte";
  import BooleanField from "./BooleanField.svelte";
  import NumberField from "./NumberField.svelte";
  import SliderField from "./SliderField.svelte";
  import FilePathField from "./FilePathField.svelte";
  import EnumField from "./EnumField.svelte";
  import ListField from "./ListField.svelte";
  import { buildFieldInputId } from "../utils/fieldUtils";

  let {
    nodeId,
    schemaKey,
    type,
    label,
    value,
    onvalidate,
  }: NodeField & { nodeId?: string; onvalidate: (value: unknown) => void } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const inputId = $derived(buildFieldInputId("field", nodeId, schemaKey, type));
</script>

{#if type === "object"}
<!-- TODO implement object-type fields -->
  <!-- <ObjectField {field} hasNestedFields={nestedFields.length > 0}>
    {#each nestedFields as nestedField}
      {#if typeof nestedField?.id === "string" && nestedField.id.trim()}
        <svelte:self
          field={nestedField}
          value={currentValue?.[nestedField.id]}
          on:change={event => updateNestedField(nestedField.id, event.detail.value)}
        />
      {/if}
    {/each}
  </ObjectField> -->
{:else if type === "list"}
  <ListField {inputId} label={fieldLabel} initialValue={value} onconfirm={onvalidate} />
{:else if type === "enum"}
  <EnumField {inputId} label={fieldLabel} initialValue={value} onconfirm={onvalidate} />
{:else if type === "filepath"}
  <FilePathField {inputId} label={fieldLabel} initialValue={value} onconfirm={onvalidate} />
{:else if type === "intslider"}
  <SliderField {inputId} label={fieldLabel} initialValue={value} onconfirm={onvalidate} />
{:else if type === "checkbox"}
  <BooleanField {inputId} label={fieldLabel} initialValue={value} onconfirm={onvalidate} />
{:else if type === "int" || type === "float"}
  <NumberField
    {inputId}
    label={fieldLabel}
    initialValue={value}
    isFloat={type === "float"}
    onconfirm={onvalidate}
  />
{:else}
  <TextField
    {inputId}
    label={fieldLabel}
    initialValue={value}
    multiline={type === "text"}
    onconfirm={onvalidate}
  />
{/if}
