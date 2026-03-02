<script lang="ts">
  import { NodeField } from "@shared/node-editor/workspaceTypes";
  import { isObject } from "@shared/typeUtils";
  import { Panel, type XYPosition } from "@xyflow/svelte";
  import { Search } from "lucide-svelte";
  import { type FlowNode } from "src/common";
  import { readColorForCss } from "src/node-editor/utils/colors";
  import { buildFieldInputId } from "src/node-editor/utils/fieldUtils";
  import { getAbsoluteCenterPosition } from "src/node-editor/utils/nodeUtils.svelte";
  import { workspace } from "src/workspace.svelte";
  import { onMount, untrack } from "svelte";

  const {
    oncancel,
    onselection,
    viewportCenter,
  }: {
    oncancel: () => void;
    onselection: (node: FlowNode, inputId?: string) => void;
    viewportCenter: XYPosition;
  } = $props();
  interface SearchedNode {
    node: FlowNode;
    effectiveTitle: string;
    distanceToViewport: number;
    innerContent: ContentEntry[];
  }

  let searchQuery = $state("");
  let searchInput = $state<HTMLInputElement>();
  let resultListElement = $state<HTMLDivElement>();

  onMount(() => {
    searchInput.focus();
  });

  const allNodes = $derived(workspace.nodes);

  interface ContentEntry {
    content: string;
    inputId?: string;
  }

  const aggregateEntries = (entryList: ContentEntry[], fields: NodeField[], parentTag?: string,  parentObject?: object): void => {
    for (const field of fields) {
      const value = parentObject ? parentObject[field.schemaKey] : field.value;
      let str = parentTag ? parentTag + "." : "";
      str += (field.label ?? field.schemaKey);
      if (isObject(value)) {
        aggregateEntries(entryList, field.subfields ?? [], str, value as object);
      } else {
        entryList.push({ content: (str + ": " + String(value)).trim() });
      }
    }
  }

  /** @returns {content, itemid?} where itemid is the calculated ID of any field item that should be focused upon selection */
  function getInnerContent(node: FlowNode): ContentEntry[] {
    const content: ContentEntry[] = [{ content: node.data.templateId }];
    if (node.data.comment) {
      content.push({ content: node.data.comment });
    }
    if (node.data.jsonString) {
      // todo give json string unique id
      content.push({ content: node.data.jsonString as string });
    }
    aggregateEntries(content, Object.values(node.data.fieldsBySchemaKey));
    // const parentList = getGroupList(node.id)
    //   .map(parent => workspace.getNodeById(parent))
    //   .map(parent => parent.data.titleOverride ?? parent.data.defaultTitle)
    //   .join(" - ");
    // if (parentList.length > 0) {
    //   content.push("Group: " + parentList);
    // }
    return content;
  }

  const enrichedNodes: SearchedNode[] = $derived.by(() => {
    return allNodes
      .map(node => {
        const postion = getAbsoluteCenterPosition(node);
        return {
          node,
          effectiveTitle: node.data.titleOverride ?? node.data.defaultTitle,
          distanceToViewport: Math.hypot(
            postion.x - viewportCenter.x,
            postion.y - viewportCenter.y,
          ),
          innerContent: getInnerContent(node),
        };
      })
      .sort((a, b) => a.distanceToViewport - b.distanceToViewport);
  });

  // matched node and the subtitle to display (display searched content if the search matches something other than the title)
  const matchedNodes: [SearchedNode, ContentEntry][] = $derived.by(() => {
    return enrichedNodes.reduce((acc, node) => {
      if (searchQuery.trim() === "") {
        acc.push([node, { content: node.node.data.templateId }]);
      } else if (node.effectiveTitle.toLowerCase().includes(searchQuery.toLowerCase())) {
        acc.push([node, { content: `Name: ${node.effectiveTitle}` }]);
      } else {
        const contentMatch = node.innerContent.find(entry =>
          entry.content.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        if (contentMatch) {
          acc.push([node, contentMatch]);
        }
      }
      return acc;
    }, []);
  });

  let activeIndex = $state(0);
  let activeNode = $derived(matchedNodes.at(activeIndex)?.[0].node);
  let matchedContent = $derived(matchedNodes.at(activeIndex)?.[1]);
  $effect(() => {
    void activeNode;
    untrack(() => workspace.actionRequests.push({ type: "reveal-node", nodeId: activeNode.id }));
  });

  $effect(() => {
    void searchQuery;
    activeIndex = 0;
  });

  function handleKeyDown(event) {
    switch (event.key) {
      case "Escape":
        oncancel();
        break;
      case "Enter":
        if (matchedNodes.length === 0) return;
        onselection(activeNode, matchedContent?.inputId);
        break;
      case "ArrowDown":
        if (matchedNodes.length === 0) return;
        activeIndex = (activeIndex + 1) % matchedNodes.length;
        queueMicrotask(() => scrollActiveItemIntoView());
        break;
      case "ArrowUp":
        if (matchedNodes.length === 0) return;
        activeIndex = (activeIndex - 1 + matchedNodes.length) % matchedNodes.length;
        queueMicrotask(() => scrollActiveItemIntoView());
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function scrollActiveItemIntoView() {
    const activeItemElement = resultListElement.querySelector('[data-active="true"]');
    activeItemElement?.scrollIntoView({ block: "nearest" });
  }
</script>

{#if open}
  <Panel position="top-left" class="pointer-events-auto">
    <div
      data-node-search-menu
      role="dialog"
      aria-label="Search nodes"
      tabindex="-1"
      class="mt-2 ml-2 w-[30rem] max-w-[92vw] max-h-[72vh] overflow-hidden rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-3 text-vsc-editor-fg shadow-2xl"
    >
      <div class="relative">
        <Search
          aria-hidden="true"
          size={14}
          strokeWidth={2}
          class="absolute -translate-y-1/2 pointer-events-none top-1/2 left-3 text-vsc-muted"
        />
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          onkeydown={handleKeyDown}
          class="w-full rounded-md border border-vsc-input-border bg-vsc-input-bg pr-2 py-1.5 pl-9 text-xs text-vsc-input-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
          type="search"
        />
      </div>

      <div
        bind:this={resultListElement}
        class="relative mt-3 flex max-h-[calc(72vh-4.75rem)] flex-col gap-3 overflow-auto pr-0.5"
        role="listbox"
      >
        {#if matchedNodes.length === 0}
          <div class="px-1 py-4 text-xs text-vsc-muted">No matching nodes</div>
        {:else}
          {#each matchedNodes as [item, contentMatch], index}
            {@const isActive = index === activeIndex}
            <button
              role="option"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg border border-vsc-editor-widget-border bg-vsc-button-secondary-bg px-2 py-1.5 text-vsc-button-secondary-fg overflow-clip relative"
              class:border-vsc-focus={isActive}
              class:bg-vsc-list-active-bg={isActive}
              class:text-vsc-list-active-fg={isActive}
              data-active={isActive}
              aria-selected={isActive}
              onpointerenter={() => (activeIndex = index)}
              onclick={() => {
                onselection(item.node, contentMatch.inputId);
              }}
            >
              <span
                aria-hidden="true"
                class="absolute left-0 w-6 h-full"
                style="background-color: {readColorForCss(item.node.data.nodeColor)};"
              ></span>

              <div class="flex flex-col items-start justify-center ml-6">
                <div class="font-semibold truncate">{item.effectiveTitle}</div>
                <div class="text-xs truncate text-vsc-muted whitespace-nowrap">
                  {contentMatch.content}
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </Panel>
{/if}
