<script lang="ts">
  import {
    type Component,
    ComponentType,
    createEventDispatcher,
    type SvelteComponentTyped,
  } from "svelte";
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
    type NodeEditorQuickActionDefinition,
    type NodeEditorQuickActionId,
    getNodeEditorQuickActionById,
  } from "../node-editor/ui/nodeEditorQuickActions";

  type MenuItem = { type: "action"; id: NodeEditorQuickActionId; icon: any };
  type MenuSeparatorItem = { type: "separator"; id: string };
  type MenuItemWithAction = MenuItem & { action: NodeEditorQuickActionDefinition };

  const MENU_ITEMS = [
    { type: "action" as const, id: "go-to-root" as const, icon: ArrowLeftToLine },
    { type: "action" as const, id: "fit-full-view" as const, icon: Binoculars },
    { type: "separator" as const, id: "separator-navigation" },
    { type: "action" as const, id: "search-nodes" as const, icon: Search },
    { type: "action" as const, id: "auto-position-nodes" as const, icon: Network },
    { type: "separator" as const, id: "separator-utility" },
    { type: "action" as const, id: "view-raw-json" as const, icon: Braces },
    { type: "action" as const, id: "help-and-hotkeys" as const, icon: CircleQuestionMark },
  ].map(item =>
    item.type === "action"
      ? { ...item, action: getNodeEditorQuickActionById(item.id as NodeEditorQuickActionId) }
      : item,
  ) as (MenuItemWithAction | MenuSeparatorItem)[];

  const dispatch = createEventDispatcher();

  function emitAction(action) {
    if (!action?.eventName) {
      return;
    }

    dispatch(action.eventName);
  }

  function readItemIconClass(item) {
    return item?.id === "auto-position-nodes" ? "-rotate-90" : undefined;
  }
</script>

<Panel position="top-center" class="pointer-events-auto">
  <nav
    aria-label="Node editor quick actions"
    class="flex items-center gap-1 rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-2 py-0.5 shadow-2xl"
  >
    {#each MENU_ITEMS as item (item.id)}
      {#if item.type === "separator"}
        <span aria-hidden="true" class="mx-0.5 h-5 w-px bg-vsc-editor-widget-border"></span>
      {:else}
        <HoverTooltip text={item.action.name} placement="bottom" delayMs={220}>
          <button
            type="button"
            aria-label={item.action.name}
            class="flex items-center justify-center w-8 h-8 transition-colors border border-transparent rounded-md text-vsc-muted hover:border-vsc-editor-widget-border hover:bg-vsc-list-hover hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
            onclick={() => emitAction(item.action)}
          >
            <svelte:component
              this={item.icon as Component}
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
