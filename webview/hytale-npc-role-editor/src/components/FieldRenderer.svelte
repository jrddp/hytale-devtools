<script lang="ts">
  import type { Snippet } from "svelte";
  import type { NpcPropertyField } from "../propertyModel";
  import BooleanField from "./fields/BooleanField.svelte";
  import ListField from "./fields/ListField.svelte";
  import RawJsonField from "./fields/RawJsonField.svelte";
  import RichObjectField from "./fields/RichObjectField.svelte";
  import ScalarField from "./fields/ScalarField.svelte";
  import StateTransitionsField from "./fields/StateTransitionsField.svelte";

  let {
    field,
    root = false,
    handle,
  }: {
    field: NpcPropertyField;
    root?: boolean;
    handle?: Snippet;
  } = $props();
</script>

{#if field.kind === "boolean"}
  <BooleanField {field} />
{:else if field.kind === "list"}
  <ListField {field} />
{:else if field.kind === "rawJson" || field.kind === "graph"}
  <RawJsonField {field} {root} {handle} />
{:else if field.kind === "richObject"}
  <RichObjectField {field} {root} {handle} />
{:else if field.kind === "stateTransitions"}
  <StateTransitionsField {field} {root} {handle} />
{:else}
  <ScalarField {field} />
{/if}
