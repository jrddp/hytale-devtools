<script lang="ts">
  import IconToggleButton from "@webview-shared/components/IconToggleButton.svelte";
  import { Link } from "lucide-svelte";

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
  activeLabel="Switch to inline mode"
  inactiveLabel="Switch to reference mode"
  {ontoggle}
>
  <Link size={12} />
</IconToggleButton>
