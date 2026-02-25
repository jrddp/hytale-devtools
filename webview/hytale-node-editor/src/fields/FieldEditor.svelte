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
    schemaKey,
    type,
    label,
    value,
    inputWidth,
    onchange,
  }: NodeField & { onchange: (value: unknown) => void } = $props();
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
  <ListField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "enum"}
  <EnumField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "filepath"}
  <FilePathField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "intslider"}
  <SliderField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "checkbox"}
  <BooleanField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else if type === "int" || type === "float"}
  <NumberField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{:else}
  <TextField {schemaKey} {type} {label} {value} {inputWidth} {onchange} />
{/if}
