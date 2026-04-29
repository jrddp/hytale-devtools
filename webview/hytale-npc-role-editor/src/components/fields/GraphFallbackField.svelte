<script lang="ts">
  import type { Snippet } from "svelte";
  import type { NpcPropertyField } from "../../propertyModel";
  import RawJsonField from "./RawJsonField.svelte";

  let {
    field,
    root = false,
    handle,
    notice = "Graph editing is unavailable for this field. Raw JSON fallback is shown instead.",
  }: {
    field: NpcPropertyField;
    root?: boolean;
    handle?: Snippet;
    notice?: string;
  } = $props();
</script>

<RawJsonField {field} {root} {handle} {notice} />
