<script lang="ts">
  import type { NpcPropertyField } from "../propertyModel";
  import BooleanField from "./fields/BooleanField.svelte";
  import ListField from "./fields/ListField.svelte";
  import RawJsonField from "./fields/RawJsonField.svelte";
  import ScalarField from "./fields/ScalarField.svelte";

  let { field }: { field: NpcPropertyField } = $props();
</script>

{#if field.kind === "boolean"}
  <BooleanField {field} />
{:else if field.kind === "list"}
  <ListField {field} />
{:else if field.kind === "rawJson" || field.kind === "graph"}
  <RawJsonField {field} />
{:else}
  <ScalarField {field} />
{/if}
