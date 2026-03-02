<script lang="ts">
  import { type LinkNodeType } from "../common";
  import BaseNode from "./BaseNode.svelte";

  let { id, ...props }: LinkNodeType = $props();
</script>

<BaseNode {id} {...props} />
