<script lang="ts">
  import { SquareFunction } from "lucide-svelte";
  import IconToggleButton from "./IconToggleButton.svelte";

  let {
    enabled = false,
    active = false,
    ontoggle,
  }: {
    enabled?: boolean;
    active?: boolean;
    ontoggle?: () => void;
  } = $props();
</script>

<IconToggleButton
  {enabled}
  {active}
  activeLabel="Switch to literal mode"
  inactiveLabel="Switch to compute mode"
  {ontoggle}
>
  <SquareFunction size={12} />
</IconToggleButton>
