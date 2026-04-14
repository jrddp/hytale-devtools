<script lang="ts">
  import type { NpcPropertySection } from "../propertyModel";
  import SingleRootSection from "./SingleRootSection.svelte";

  let { section }: { section: NpcPropertySection } = $props();
</script>

<SingleRootSection {section} />
