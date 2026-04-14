<script lang="ts">
  import { SvelteFlowProvider, type Viewport } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import Flow from "./Flow.svelte";
  import { type NodeEditorSession, setNodeEditorSessionContext } from "./workspace.svelte";

  let {
    session,
    initialViewport,
    onviewportchange,
  }: {
    session: NodeEditorSession;
    initialViewport?: Viewport;
    onviewportchange?: (viewport: Viewport) => void;
  } = $props();

  untrack(() => setNodeEditorSessionContext(session));
</script>

<SvelteFlowProvider>
  <Flow
    bind:nodes={session.nodes}
    bind:edges={session.edges}
    {initialViewport}
    {onviewportchange}
  />
</SvelteFlowProvider>
