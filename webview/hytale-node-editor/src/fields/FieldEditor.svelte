<script lang="ts">
  import type { NodeField } from "@shared/node-editor/workspaceTypes";
  import TextField from "./TextField.svelte";
  import BooleanField from "./BooleanField.svelte";
  import NumberField from "./NumberField.svelte";
  import SliderField from "./SliderField.svelte";
  import FilePathField from "./FilePathField.svelte";
  import EnumField from "./EnumField.svelte";
  import ListField from "./ListField.svelte";

  let {
    nodeId,
    schemaKey,
    type,
    label,
    value,
    inputWidth,
    onchange,
  }: NodeField & { nodeId?: string; onchange: (value: unknown) => void } = $props();
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
  <ListField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "enum"}
  <EnumField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "filepath"}
  <FilePathField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "intslider"}
  <SliderField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "checkbox"}
  <BooleanField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "int" || type === "float"}
  <NumberField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else}
  <TextField {nodeId} {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{/if}
