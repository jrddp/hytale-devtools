<script lang="ts">
  import type { ActionRequest } from "@shared/node-editor/messageTypes";
  import { Panel } from "@xyflow/svelte";
  import {
    ArrowLeftToLine,
    Binoculars,
    Braces,
    CircleQuestionMark,
    Network,
    Search,
  } from "lucide-svelte";
  import { useNodeEditorSession } from "@node-editor/workspace.svelte";
  import HoverTooltip from "./HoverTooltip.svelte";

  type MenuItem =
    | { type: "action"; request: ActionRequest; name: string; icon: any; iconClass?: string }
    | { type: "separator" };

  const MENU_ITEMS: MenuItem[] = [
    {
      type: "action",
      name: "Go to root",
      request: { type: "reveal-node" },
      icon: ArrowLeftToLine,
    },
    { type: "action", name: "Fit full view", request: { type: "fit-view" }, icon: Binoculars },
    { type: "separator" },
    { type: "action", name: "Search nodes", request: { type: "search-nodes" }, icon: Search },
    {
      type: "action",
      name: "Auto position nodes",
      request: { type: "auto-position-nodes" },
      icon: Network,
      iconClass: "-rotate-90",
    },
    { type: "separator" },
    { type: "action", name: "View raw json", request: { type: "view-raw-json" }, icon: Braces },
    {
      type: "action",
      name: "Help and hotkeys",
      request: { type: "help-and-hotkeys" },
      icon: CircleQuestionMark,
    },
  ];
  const workspace = useNodeEditorSession();

  const visibleMenuItems = $derived(
    MENU_ITEMS.filter(menuItem => {
      if (
        menuItem.type === "action" &&
        menuItem.request.type === "view-raw-json" &&
        !workspace.allowOpenRawJson
      ) {
        return false;
      }
      return true;
    }),
  );
</script>

<Panel position="top-center" class="pointer-events-auto">
  <nav
    aria-label="Node editor quick actions"
    class="flex items-center gap-1 rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-0.5 shadow-2xl"
  >
    {#each visibleMenuItems as menuItem}
      {#if menuItem.type === "separator"}
        <span aria-hidden="true" class="mx-0.5 h-5 w-px bg-vsc-editor-widget-border"></span>
      {:else}
        {@const Icon = menuItem.icon}
        <HoverTooltip text={menuItem.name} placement="bottom" delayMs={220}>
          <button
            type="button"
            aria-label={menuItem.name}
            class="flex items-center justify-center w-8 h-8 transition-colors border border-transparent rounded-md text-vsc-muted hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
            onclick={() => workspace.actionRequests.push(menuItem.request)}
          >
            <Icon class={menuItem.iconClass} size={16} strokeWidth={2} />
          </button>
        </HoverTooltip>
      {/if}
    {/each}
  </nav>
</Panel>
