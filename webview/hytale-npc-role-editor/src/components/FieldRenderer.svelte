<script lang="ts">
  import type { NpcPropertyField } from "../propertyModel";
  import BooleanField from "./fields/BooleanField.svelte";
  import ListField from "./fields/ListField.svelte";
  import ParameterField from "./fields/ParameterField.svelte";
  import RawJsonField from "./fields/RawJsonField.svelte";
  import ScalarField from "./fields/ScalarField.svelte";

  let { field }: { field: NpcPropertyField } = $props();
</script>

{#if field.type === "boolean"}
  <BooleanField {field} />
{:else if field.type === "parameter"}
  <ParameterField {field} />
{:else if field.type === "list"}
  <ListField {field} />
{:else if field.type === "rawJson"}
  <RawJsonField {field} />
{:else}
  <ScalarField {field} />
{/if}
