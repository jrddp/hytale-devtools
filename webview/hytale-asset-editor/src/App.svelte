<script lang="ts">
  import type { AssetEditorExtensionToWebviewMessage } from "@shared/asset-editor/messageTypes";
  import DevtoolsAttribution from "@webview-shared/components/DevtoolsAttribution.svelte";
  import DocumentEditorShell from "@webview-shared/components/DocumentEditorShell.svelte";
  import type { VSCodeApi } from "src/common";
  import { workspace } from "src/workspace.svelte";
  import { onMount, tick } from "svelte";
  import { setFieldPanelStateContext } from "./components/fieldPanelStateContext";
  import type { OutlineSection } from "./components/fieldHelpers";
  import ObjectField from "./components/fields/ObjectField.svelte";
  import VariantField from "./components/fields/VariantField.svelte";
  import AssetPreview from "./preview/AssetPreview.svelte";
  import {
    ensureWebviewStateForDocument,
    updateFieldCollapseByPath,
    type AssetEditorWebviewState,
  } from "./webviewState";

  const OUTLINE_ACTIVE_OFFSET_PX = 16;

  const { vscode }: { vscode: VSCodeApi } = $props();

  let extensionError = $state("");
  let scrollRootElement = $state<HTMLDivElement>();
  let scrollRootHeight = $state(0);
  let lastOutlineSectionHeight = $state(0);
  let outlineSections = $state<OutlineSection[]>([]);
  let activeOutlineSectionId = $state<string | null>(null);
  let pendingOutlineSectionId = $state<string | null>(null);
  let localWebviewState = $state<AssetEditorWebviewState>({});
  let restoredDocumentPath = $state<string | null>(null);
  let isRestoringMainScroll = false;
  let mainScrollPersistFrame: number | null = null;

  setFieldPanelStateContext({
    getCollapsed: fieldPath => localWebviewState.fieldCollapseByPath?.[fieldPath],
    onCollapseChange: (fieldPath, collapsed, defaultCollapsed) => {
      persistFieldCollapseState(fieldPath, collapsed, defaultCollapsed);
    },
  });

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
      schedulePersistMainScrollTop();
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
    if (!workspace.documentPath || !workspace.documentRootField) {
      return;
    }

    if (restoredDocumentPath === workspace.documentPath) {
      return;
    }

    localWebviewState = ensureWebviewStateForDocument(localWebviewState, workspace.documentPath);
    restoredDocumentPath = workspace.documentPath;
    void restoreMainScrollPosition();
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
        workspace.assetsByRef = message.assetsByRef;
        workspace.setAssetDefinition(message.assetDefinition);
        workspace.setParentState(message.parent);
        workspace.setPreview(message.preview);
        extensionError = "";
        return;
      case "parentUpdate":
        workspace.setParentState(message.parent);
        return;
      case "previewUpdate":
        workspace.setPreview(message.preview);
        return;
      case "update":
        workspace.setDocument(message);
        localWebviewState = ensureWebviewStateForDocument(
          localWebviewState,
          message.documentPath,
        );
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
      behavior: "instant",
      top: scrollRootElement.scrollTop + sectionTop - rootTop - OUTLINE_ACTIVE_OFFSET_PX,
    });
    pendingOutlineSectionId = null;
    updateActiveOutlineSection();
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

  function persistWebviewState(nextState: AssetEditorWebviewState) {
    const stateForDocument = workspace.documentPath
      ? ensureWebviewStateForDocument(nextState, workspace.documentPath)
      : nextState;
    localWebviewState = stateForDocument;
    vscode.setState?.(stateForDocument);
  }

  function schedulePersistMainScrollTop() {
    if (
      !scrollRootElement ||
      isRestoringMainScroll ||
      !workspace.documentPath ||
      !workspace.documentRootField ||
      restoredDocumentPath !== workspace.documentPath
    ) {
      return;
    }

    if (mainScrollPersistFrame !== null) {
      return;
    }

    mainScrollPersistFrame = requestAnimationFrame(() => {
      mainScrollPersistFrame = null;
      if (!scrollRootElement) {
        return;
      }

      persistWebviewState({
        ...localWebviewState,
        mainScrollTop: scrollRootElement.scrollTop,
      });
    });
  }

  async function restoreMainScrollPosition() {
    isRestoringMainScroll = true;
    await tick();
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });

    if (!scrollRootElement) {
      isRestoringMainScroll = false;
      return;
    }

    scrollRootElement.scrollTop = localWebviewState.mainScrollTop ?? 0;
    updateActiveOutlineSection();
    requestAnimationFrame(() => {
      isRestoringMainScroll = false;
    });
  }

  function persistFieldCollapseState(
    fieldPath: string,
    collapsed: boolean,
    defaultCollapsed: boolean,
  ) {
    const nextFieldCollapseByPath = updateFieldCollapseByPath(
      localWebviewState.fieldCollapseByPath,
      fieldPath,
      collapsed,
      defaultCollapsed,
    );
    const nextState: AssetEditorWebviewState = {
      ...localWebviewState,
    };

    if (nextFieldCollapseByPath) {
      nextState.fieldCollapseByPath = nextFieldCollapseByPath;
    } else {
      delete nextState.fieldCollapseByPath;
    }

    persistWebviewState(nextState);
  }

  onMount(() => {
    if (typeof vscode.getState === "function") {
      localWebviewState = (vscode.getState() as AssetEditorWebviewState | undefined) ?? {};
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    if (vscode.isDevEnv) {
      workspace.expandAllPanels();
    }

    return () => {
      if (mainScrollPersistFrame !== null) {
        cancelAnimationFrame(mainScrollPersistFrame);
        mainScrollPersistFrame = null;
      }
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

{#if extensionError}
  <div class="px-3 py-2 border rounded-md border-vsc-border bg-red-500/10 text-vsc-error">
    {extensionError}
  </div>
{:else if workspace.documentParseError}
  <div class="px-3 py-2 mb-4 border rounded-md border-vsc-border bg-red-500/10 text-vsc-error">
    {workspace.documentParseError}
  </div>
{:else if workspace.documentRootField && workspace.assetDefinition}
  <DocumentEditorShell
    title={workspace.documentPath.split("/").pop().split(".")[0]}
    subtitle={workspace.assetDefinition?.title ?? "Asset Editor"}
    path={workspace.documentPath.substring(
      workspace.documentPath.indexOf(workspace.assetDefinition?.path ?? ""),
    ) || "Waiting for document..."}
    bind:scrollRootElement
  >
    {#snippet actions()}
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
    {/snippet}

    {#snippet sidebar()}
      <AssetPreview />
      <div class="rounded-xl border border-vsc-border bg-vsc-panel p-2">
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
                <div class="truncate text-sm font-semibold">{section.name}</div>
                <div class="text-xs opacity-70">
                  {section.fieldCount}
                  {section.fieldCount === 1 ? "property" : "properties"}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}

    {#if workspace.documentRootField.type === "object"}
      <ObjectField
        field={workspace.documentRootField}
        depth={0}
        root
        onSectionsChange={handleSectionsChange}
      />
    {:else}
      <VariantField
        field={workspace.documentRootField}
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
  </DocumentEditorShell>
  <DevtoolsAttribution class="fixed bottom-2 left-2 z-20" />
{/if}
