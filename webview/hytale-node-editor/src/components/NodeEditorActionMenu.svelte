<script lang="ts">
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
  import {
    NODE_EDITOR_QUICK_ACTION_IDS,
    getNodeEditorQuickActionById,
  } from "../node-editor/ui/nodeEditorQuickActions";

  const dispatch = createEventDispatcher();
  const MENU_ITEMS = [
    { id: NODE_EDITOR_QUICK_ACTION_IDS.GO_TO_ROOT, icon: ArrowLeftToLine },
    { id: NODE_EDITOR_QUICK_ACTION_IDS.FIT_FULL_VIEW, icon: Binoculars },
    { key: "separator-navigation", separator: true },
    { id: NODE_EDITOR_QUICK_ACTION_IDS.SEARCH_NODES, icon: Search },
    { id: NODE_EDITOR_QUICK_ACTION_IDS.AUTO_POSITION_NODES, icon: Network },
    { key: "separator-utility", separator: true },
    { id: NODE_EDITOR_QUICK_ACTION_IDS.VIEW_RAW_JSON, icon: Braces },
    { id: NODE_EDITOR_QUICK_ACTION_IDS.HELP_AND_HOTKEYS, icon: CircleQuestionMark },
  ];
  const RESOLVED_MENU_ITEMS = MENU_ITEMS
    .map((item) => {
      if (item.separator) {
        return item;
      }

      return {
        ...item,
        action: getNodeEditorQuickActionById(item.id),
      };
    })
    .filter((item) => item.separator === true || Boolean(item?.action));

  function emitAction(action) {
    if (!action?.eventName) {
      return;
    }

    dispatch(action.eventName);
  }

  function readItemIconClass(item) {
    return item?.id === NODE_EDITOR_QUICK_ACTION_IDS.AUTO_POSITION_NODES
      ? "-rotate-90"
      : undefined;
  }
</script>

<Panel position="top-center" class="pointer-events-auto">
  <nav
    aria-label="Node editor quick actions"
    class="flex items-center gap-1 rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-0.5 shadow-2xl"
  >
    {#each RESOLVED_MENU_ITEMS as item (item.key ?? item.id)}
      {#if item.separator}
        <span aria-hidden="true" class="mx-0.5 h-5 w-px bg-vsc-editor-widget-border"></span>
      {:else}
        <HoverTooltip text={item.action.name} placement="bottom" delayMs={220}>
          <button
            type="button"
            aria-label={item.action.name}
            class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-vsc-muted transition-colors hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
            onclick={() => emitAction(item.action)}
          >
            <svelte:component
              this={item.icon}
              class={readItemIconClass(item)}
              size={16}
              strokeWidth={2}
            />
          </button>
        </HoverTooltip>
      {/if}
    {/each}
  </nav>
</Panel>
