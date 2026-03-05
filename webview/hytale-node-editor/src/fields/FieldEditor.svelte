<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import ObjectField from "src/fields/ObjectField.svelte";
  import { buildFieldInputId } from "src/node-editor/utils/fieldUtils";
  import BooleanField from "./BooleanField.svelte";
  import EnumField from "./EnumField.svelte";
  import FilePathField from "./FilePathField.svelte";
  import ListField from "./ListField.svelte";
  import NumberField from "./NumberField.svelte";
  import SliderField from "./SliderField.svelte";
  import TextField from "./TextField.svelte";

  let {
    nodeId,
    schemaKey,
    type,
    label,
    value,
    subfields,
    onconfirm,
    parentSchemaKey,
    symbolLookup,
  }: NodeField & {
    nodeId?: string;
    onconfirm: (value: unknown) => void;
    parentSchemaKey?: string;
    initialValue?: unknown;
  } = $props();

  const fieldLabel = $derived(label ?? schemaKey ?? "Field");
  const inputId = $derived(buildFieldInputId(nodeId, schemaKey, parentSchemaKey));
</script>

{#if type === "object"}
  <ObjectField
    {inputId}
    {nodeId}
    {parentSchemaKey}
    {schemaKey}
    label={fieldLabel}
    initialValue={value as object}
    {onconfirm}
    {subfields}
  />
{:else if type === "list"}
  <ListField {inputId} label={fieldLabel} initialValue={value as string[]} {onconfirm} />
{:else if type === "enum"}
  <EnumField {inputId} label={fieldLabel} initialValue={value as string} {onconfirm} />
{:else if type === "filepath"}
  <FilePathField {inputId} label={fieldLabel} initialValue={value as string} {onconfirm} />
{:else if type === "intslider"}
  <SliderField {inputId} label={fieldLabel} initialValue={value as number} {onconfirm} />
{:else if type === "checkbox"}
  <BooleanField {inputId} label={fieldLabel} initialValue={value as boolean} {onconfirm} />
{:else if type === "int" || type === "float"}
  <NumberField
    {inputId}
    label={fieldLabel}
    initialValue={value as number}
    isFloat={type === "float"}
    {onconfirm}
  />
{:else}
  <TextField
    {inputId}
    label={fieldLabel}
    initialValue={value as string}
    multiline={type === "text"}
    {symbolLookup}
    {onconfirm}
  />
{/if}
