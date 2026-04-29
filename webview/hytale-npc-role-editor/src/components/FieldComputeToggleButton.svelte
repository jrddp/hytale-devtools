<script lang="ts">
  import ComputeToggleButton from "@webview-shared/components/ComputeToggleButton.svelte";

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

<ComputeToggleButton {enabled} {active} {ontoggle} />
