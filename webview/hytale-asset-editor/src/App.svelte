<script lang="ts">
  import type { AssetEditorExtensionToWebviewMessage } from "@shared/asset-editor/messageTypes";
  import type { VSCodeApi } from "src/common";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";
  import FieldRenderer from "./components/FieldRenderer.svelte";
  import type { OutlineSection } from "./components/fieldHelpers";
  import ObjectField from "./components/fields/ObjectField.svelte";
  import VariantField from "./components/fields/VariantField.svelte";
  import type { FieldInstance } from "./parsing/fieldInstances";

  const OUTLINE_ACTIVE_OFFSET_PX = 16;

  const { vscode }: { vscode: VSCodeApi } = $props();

  let extensionError = $state("");
  let scrollRootElement = $state<HTMLDivElement>();
  let scrollRootHeight = $state(0);
  let lastOutlineSectionHeight = $state(0);
  let outlineSections = $state<OutlineSection[]>([]);
  let activeOutlineSectionId = $state<string | null>(null);
  let pendingOutlineSectionId = $state<string | null>(null);

  $effect(() => {
    workspace.vscode = vscode;
  });

  $effect(() => {
    if (!scrollRootElement) {
      scrollRootHeight = 0;
      lastOutlineSectionHeight = 0;
      activeOutlineSectionId = outlineSections[0]?.id ?? null;
      return;
    }

    const updateLayoutMetrics = () => {
      scrollRootHeight = scrollRootElement.clientHeight;
      lastOutlineSectionHeight =
        getOutlineSectionElement(outlineSections.at(-1)?.id ?? "")?.getBoundingClientRect()
          .height ?? 0;
    };

    const handleScroll = () => {
      updateLayoutMetrics();
      updateActiveOutlineSection();
    };
    const handleScrollEnd = () => {
      pendingOutlineSectionId = null;
      updateActiveOutlineSection();
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateLayoutMetrics();
          });

    resizeObserver?.observe(scrollRootElement);
    getOutlineSectionElement(outlineSections.at(-1)?.id ?? "") &&
      resizeObserver?.observe(getOutlineSectionElement(outlineSections.at(-1)?.id ?? "")!);

    queueMicrotask(handleScroll);
    scrollRootElement.addEventListener("scroll", handleScroll, { passive: true });
    scrollRootElement.addEventListener("scrollend", handleScrollEnd);
    window.addEventListener("resize", handleScroll);

    return () => {
      resizeObserver?.disconnect();
      scrollRootElement?.removeEventListener("scroll", handleScroll);
      scrollRootElement?.removeEventListener("scrollend", handleScrollEnd);
      window.removeEventListener("resize", handleScroll);
    };
  });

  $effect(() => {
    if (workspace.documentRootField) {
      return;
    }

    outlineSections = [];
    activeOutlineSectionId = null;
    pendingOutlineSectionId = null;
    lastOutlineSectionHeight = 0;
  });

  function handleMessage(event: MessageEvent<AssetEditorExtensionToWebviewMessage>) {
    const message = event.data;
    console.log("message received", message);

    switch (message.type) {
      case "bootstrap":
        workspace.setAssetDefinition(message.assetDefinition);
        extensionError = "";
        return;
      case "update":
        workspace.setDocument(message);
        return;
      case "resolvedRef":
        workspace.setResolvedRef(message.$ref, message.field);
        return;
      case "autocompletionValues":
        workspace.setAutocompleteValues(message.fieldId, message.values);
        return;
      case "error":
        extensionError = message.message;
        return;
      default:
        return;
    }
  }

  function handleSectionsChange(nextSections: OutlineSection[]) {
    outlineSections = nextSections;

    if (
      pendingOutlineSectionId &&
      !nextSections.some(section => section.id === pendingOutlineSectionId)
    ) {
      pendingOutlineSectionId = null;
    }

    if (!nextSections.some(section => section.id === activeOutlineSectionId)) {
      activeOutlineSectionId = nextSections[0]?.id ?? null;
    }

    queueMicrotask(() => {
      scrollRootHeight = scrollRootElement?.clientHeight ?? scrollRootHeight;
      lastOutlineSectionHeight =
        getOutlineSectionElement(nextSections.at(-1)?.id ?? "")?.getBoundingClientRect().height ??
        lastOutlineSectionHeight;
      updateActiveOutlineSection();
    });
  }

  function getOutlineSectionElement(sectionId: string) {
    return scrollRootElement?.querySelector<HTMLElement>(
      `[data-outline-section-id="${sectionId}"]`,
    );
  }

  function scrollToOutlineSection(sectionId: string) {
    const sectionElement = getOutlineSectionElement(sectionId);
    if (!sectionElement || !scrollRootElement) return;

    pendingOutlineSectionId = sectionId;
    activeOutlineSectionId = sectionId;

    const rootTop = scrollRootElement.getBoundingClientRect().top;
    const sectionTop = sectionElement.getBoundingClientRect().top;

    scrollRootElement.scrollTo({
      behavior: "smooth",
      top: scrollRootElement.scrollTop + sectionTop - rootTop - OUTLINE_ACTIVE_OFFSET_PX,
    });
  }

  function updateActiveOutlineSection() {
    if (!scrollRootElement || outlineSections.length === 0) {
      activeOutlineSectionId = outlineSections[0]?.id ?? null;
      return;
    }

    if (pendingOutlineSectionId) {
      return;
    }

    const thresholdTop = scrollRootElement.getBoundingClientRect().top + OUTLINE_ACTIVE_OFFSET_PX;
    let nextActiveSectionId = outlineSections[0]?.id ?? null;

    for (const section of outlineSections) {
      const sectionElement = getOutlineSectionElement(section.id);
      if (!sectionElement) continue;

      if (sectionElement.getBoundingClientRect().top <= thresholdTop) {
        nextActiveSectionId = section.id;
        continue;
      }

      break;
    }

    activeOutlineSectionId = nextActiveSectionId;
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<main class="flex flex-col h-screen min-h-0 text-sm bg-vsc-bg text-vsc-editor-fg">
  <header
    class="flex items-center justify-between gap-3 px-4 py-3 border-b border-vsc-border bg-vsc-panel"
  >
    <div class="min-w-0">
      <div class="space-x-1">
        <span class="text-lg font-semibold truncate"
          >{workspace.documentPath.split("/").pop().split(".")[0]}</span
        >
        <span class="text-xs italic font-normal text-vsc-muted"
          >{workspace.assetDefinition?.title ?? "Asset Editor"}</span
        >
      </div>
      <div class="mt-1 text-xs truncate text-vsc-muted">
        {workspace.documentPath.substring(
          workspace.documentPath.indexOf(workspace.assetDefinition?.path ?? ""),
        ) || "Waiting for document..."}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
        onclick={() => workspace.expandAllPanels()}
      >
        Expand All
      </button>
      <button
        type="button"
        class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
        onclick={() => workspace.collapseAllPanels()}
      >
        Collapse All
      </button>
      <button
        type="button"
        class="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        class:border-vsc-focus={workspace.hideUnsetFields}
        class:bg-vsc-list-active-bg={workspace.hideUnsetFields}
        class:text-vsc-list-active-fg={workspace.hideUnsetFields}
        class:border-vsc-border={!workspace.hideUnsetFields}
        class:bg-vsc-button-bg={!workspace.hideUnsetFields}
        class:text-vsc-button-fg={!workspace.hideUnsetFields}
        class:hover:bg-vsc-button-hover={!workspace.hideUnsetFields}
        aria-pressed={workspace.hideUnsetFields}
        onclick={() => workspace.toggleHideUnsetFields()}
      >
        Hide Unset
      </button>
      <button
        type="button"
        class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
        onclick={() => vscode.postMessage({ type: "openRawJson" })}
      >
        Open JSON
      </button>
    </div>
  </header>

  <div bind:this={scrollRootElement} class="flex-1 min-h-0 overflow-auto" data-sticky-scroll-root>
    <div class="p-4">
      {#if extensionError}
        <div class="px-3 py-2 border rounded-md border-vsc-border bg-red-500/10 text-vsc-error">
          {extensionError}
        </div>
      {:else if !workspace.assetDefinition}
        <div class="px-3 py-2 border rounded-md border-vsc-border bg-vsc-panel opacity-70">
          Loading asset definition...
        </div>
      {:else}
        {#snippet renderField(field: FieldInstance, depth: number, onunset?: () => void)}
          <FieldRenderer {field} {depth} {onunset} />
        {/snippet}

        {#if workspace.documentParseError}
          <div
            class="px-3 py-2 mb-4 border rounded-md border-vsc-border bg-red-500/10 text-vsc-error"
          >
            {workspace.documentParseError}
          </div>
        {/if}

        {#if workspace.documentParseStatus === "waiting-for-refs" && !workspace.documentRootField}
          <div class="px-3 py-2 border rounded-md border-vsc-border bg-vsc-panel opacity-70">
            Resolving schema references...
          </div>
        {:else if workspace.documentParseStatus === "error" && !workspace.documentRootField}
          <div class="px-3 py-2 border rounded-md border-vsc-border bg-vsc-panel opacity-70">
            Unable to parse document.
          </div>
        {:else if workspace.documentRootField}
          <div class="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside class="lg:sticky lg:top-4">
              <div class="p-2 border rounded-xl border-vsc-border bg-vsc-panel">
                {#if outlineSections.length === 0}
                  <div class="px-3 py-2 text-xs text-vsc-muted">No sections available yet.</div>
                {:else}
                  <div class="space-y-2">
                    {#each outlineSections as section (section.id)}
                      <button
                        type="button"
                        class="w-full rounded-lg border px-3 py-2 text-left transition-[border-color,background-color,color]"
                        class:border-vsc-focus={section.id === activeOutlineSectionId}
                        class:bg-vsc-list-active-bg={section.id === activeOutlineSectionId}
                        class:text-vsc-list-active-fg={section.id === activeOutlineSectionId}
                        class:border-vsc-border={section.id !== activeOutlineSectionId}
                        class:bg-vsc-button-secondary-bg={section.id !== activeOutlineSectionId}
                        class:text-vsc-button-secondary-fg={section.id !== activeOutlineSectionId}
                        onclick={() => scrollToOutlineSection(section.id)}
                      >
                        <div class="text-sm font-semibold truncate">{section.name}</div>
                        <div class="text-xs opacity-70">
                          {section.fieldCount}
                          {section.fieldCount === 1 ? "property" : "properties"}
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </aside>

            <div class="min-w-0">
              {#if workspace.documentRootField.type === "object"}
                <ObjectField
                  field={workspace.documentRootField}
                  {renderField}
                  depth={0}
                  root
                  onSectionsChange={handleSectionsChange}
                />
              {:else}
                <VariantField
                  field={workspace.documentRootField}
                  {renderField}
                  depth={0}
                  root
                  onSectionsChange={handleSectionsChange}
                />
              {/if}

              <div
                aria-hidden="true"
                style:height={outlineSections.length > 0
                  ? `${Math.max(scrollRootHeight - OUTLINE_ACTIVE_OFFSET_PX - lastOutlineSectionHeight, scrollRootHeight / 2)}px`
                  : undefined}
              ></div>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</main>
