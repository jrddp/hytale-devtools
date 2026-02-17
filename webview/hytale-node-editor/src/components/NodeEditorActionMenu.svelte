<script>
  import { createEventDispatcher } from "svelte";
  import { Panel } from "@xyflow/svelte";
  import {
    ArrowLeftToLine,
    Binoculars,
    Braces,
    CircleQuestionMark,
    Network,
    Search,
  } from "lucide-svelte";
  import HoverTooltip from "./HoverTooltip.svelte";

  const dispatch = createEventDispatcher();

  function emitAction(actionName) {
    dispatch(actionName);
  }
</script>

<Panel position="top-center" class="pointer-events-auto">
  <nav
    aria-label="Node editor quick actions"
    class="flex items-center gap-1 rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-0.5 shadow-2xl"
  >
    <HoverTooltip text="Go to root" placement="bottom" delayMs={220}>
      <button
        type="button"
        aria-label="Go to root"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() => emitAction("gotoroot")}
      >
        <ArrowLeftToLine size={16} strokeWidth={2} />
      </button>
    </HoverTooltip>

    <HoverTooltip text="Fit full view" placement="bottom" delayMs={220}>
      <button
        type="button"
        aria-label="Fit full view"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() => emitAction("fitfullview")}
      >
        <Binoculars size={16} strokeWidth={2} />
      </button>
    </HoverTooltip>

    <span aria-hidden="true" class="mx-0.5 h-5 w-px bg-vsc-editor-widget-border"></span>

    <HoverTooltip text="Search nodes" placement="bottom" delayMs={220}>
      <button
        type="button"
        aria-label="Search nodes"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() => emitAction("searchnodes")}
      >
        <Search size={16} strokeWidth={2} />
      </button>
    </HoverTooltip>

    <HoverTooltip text="Auto position nodes" placement="bottom" delayMs={220}>
      <button
        type="button"
        aria-label="Auto position nodes"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() => emitAction("autopositionnodes")}
      >
        <Network class="-rotate-90" size={16} strokeWidth={2} />
      </button>
    </HoverTooltip>

    <span aria-hidden="true" class="mx-0.5 h-5 w-px bg-vsc-editor-widget-border"></span>

    <HoverTooltip text="View raw json" placement="bottom" delayMs={220}>
      <button
        type="button"
        aria-label="View raw json"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() => emitAction("viewrawjson")}
      >
        <Braces size={16} strokeWidth={2} />
      </button>
    </HoverTooltip>

    <HoverTooltip text="Help and hotkeys" placement="bottom" delayMs={220}>
      <button
        type="button"
        aria-label="Help and hotkeys"
        class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
        onclick={() => emitAction("helphotkeys")}
      >
        <CircleQuestionMark size={16} strokeWidth={2} />
      </button>
    </HoverTooltip>
  </nav>
</Panel>
