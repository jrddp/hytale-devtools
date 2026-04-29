<script lang="ts">
  import { SvelteFlowProvider, type Viewport } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";
  import { type NodeEditorSession, setNodeEditorSessionContext } from "./workspace.svelte";

  export let session: NodeEditorSession;
  export let initialViewport: Viewport | undefined = undefined;
  export let onviewportchange: ((viewport: Viewport) => void) | undefined = undefined;

  setNodeEditorSessionContext(session);
</script>

<SvelteFlowProvider>
  <Flow
    bind:nodes={session.nodes}
    bind:edges={session.edges}
    {initialViewport}
    {onviewportchange}
  />
</SvelteFlowProvider>
