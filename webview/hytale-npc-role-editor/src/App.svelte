<script lang="ts">
  import type {
    NpcRoleEditorExtensionToWebviewMessage,
    NpcRoleEditorBootstrapMessage,
  } from "@shared/npc-role-editor/messageTypes";
  import type {
    NodeEditorControlScheme,
    NodeEditorPlatform,
  } from "@shared/node-editor/messageTypes";
  import {
    createEmptyNodeEditorClipboardSelection,
    type NodeEditorClipboardSelection,
  } from "@shared/node-editor/clipboardTypes";
  import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import type { VSCodeApi } from "./common";
  import type { NpcPropertyField, NpcPropertySection, NpcSectionId } from "./propertyModel";
  import PropertySection from "./components/PropertySection.svelte";
  import NpcGraphPage from "./components/NpcGraphPage.svelte";
  import { workspace } from "./workspace.svelte";

  const OUTLINE_ACTIVE_OFFSET_PX = 16;
  const { vscode }: { vscode: VSCodeApi } = $props();
  type GraphViewport = {
    x: number;
    y: number;
    zoom: number;
  };
  type NpcRoleEditorWebviewState = {
    graphViewports?: Partial<Record<NpcSectionId, GraphViewport>>;
  };

  let extensionError = $state("");
  let scrollRootElement = $state<HTMLDivElement>();
  let scrollRootHeight = $state(0);
  let lastOutlineSectionHeight = $state(0);
  let activePropertySectionId = $state<string | null>(null);
  let pendingPropertySectionId = $state<string | null>(null);
  let activeGraphSectionId = $state<NpcSectionId | null>(null);
  let nodeEditorControlScheme = $state<NodeEditorControlScheme>("mouse");
  let nodeEditorPlatform = $state<NodeEditorPlatform>("win");
  let nodeEditorClipboard = $state.raw<NodeEditorClipboardSelection>(
    createEmptyNodeEditorClipboardSelection(),
  );
  let localWebviewState = $state<NpcRoleEditorWebviewState>({});
  let npcBehaviorGraphContexts = $state.raw<
    Partial<Record<"Instructions" | "Instruction" | "Sensor", NodeEditorWorkspaceContext>>
  >({});

  $effect(() => {
    workspace.vscode = vscode;
  });

  const visiblePropertySections = $derived.by(() =>
    workspace.propertySections.filter(section => !isGraphPageSection(section)),
  );

  const propertyNavigationEntries = $derived.by(() =>
    visiblePropertySections.map(section => ({
      id: section.id,
      name: section.name,
      fieldCount: section.fields.length,
      kind: "properties" as const,
    })),
  );

  const graphNavigationEntries = $derived.by(() =>
    workspace.propertySections
      .filter(section => isGraphPageSection(section))
      .map(section => ({
        id: section.id,
        name: section.name,
        fieldCount: section.fields.length,
        kind: "graph" as const,
        section,
      })),
  );

  const hasNavigationEntries = $derived(
    propertyNavigationEntries.length > 0 || graphNavigationEntries.length > 0,
  );

  const getSectionById = (sectionId: string) =>
    workspace.propertySections.find(candidate => candidate.id === sectionId) ?? null;

  const renderNavigationButton = (entry: {
    id: string;
    name: string;
    fieldCount: number;
    kind: "properties" | "graph";
  }) => ({
    id: entry.id,
    name: entry.name,
    fieldCount: entry.fieldCount,
    kind: entry.kind,
    active: entry.id === activeNavigationEntryId,
    onclick: () => {
      const section = getSectionById(entry.id);
      if (section) {
        void navigateToSection(section);
      }
    },
  });

  const activeNavigationEntryId = $derived(activeGraphSectionId ?? activePropertySectionId);
  const activeGraphSection = $derived.by(() =>
    activeGraphSectionId
      ? (workspace.propertySections.find(section => section.id === activeGraphSectionId) ?? null)
      : null,
  );
  const activeGraphField = $derived(activeGraphSection?.fields[0] ?? null);
  const activeGraphWorkspaceContext = $derived.by(() =>
    activeGraphSection ? getGraphWorkspaceContextForSection(activeGraphSection) : undefined,
  );
  const activeGraphViewport = $derived.by(() =>
    activeGraphSectionId ? localWebviewState.graphViewports?.[activeGraphSectionId] : undefined,
  );

  $effect(() => {
    if (activeGraphSectionId && !activeGraphSection) {
      activeGraphSectionId = null;
    }
  });

  $effect(() => {
    if (!scrollRootElement || activeGraphSectionId) {
      scrollRootHeight = 0;
      lastOutlineSectionHeight = 0;
      activePropertySectionId = visiblePropertySections[0]?.id ?? null;
      return;
    }

    const updateLayoutMetrics = () => {
      scrollRootHeight = scrollRootElement.clientHeight;
      lastOutlineSectionHeight =
        getOutlineSectionElement(visiblePropertySections.at(-1)?.id ?? "")?.getBoundingClientRect()
          .height ?? 0;
    };

    const handleScroll = () => {
      updateLayoutMetrics();
      updateActivePropertySection();
    };
    const handleScrollEnd = () => {
      pendingPropertySectionId = null;
      updateActivePropertySection();
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateLayoutMetrics();
          });

    resizeObserver?.observe(scrollRootElement);
    const lastSectionElement = getOutlineSectionElement(visiblePropertySections.at(-1)?.id ?? "");
    if (lastSectionElement) {
      resizeObserver?.observe(lastSectionElement);
    }

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
    if (visiblePropertySections.length === 0) {
      activePropertySectionId = null;
      pendingPropertySectionId = null;
      lastOutlineSectionHeight = 0;
      return;
    }

    if (
      !activePropertySectionId ||
      !visiblePropertySections.some(section => section.id === activePropertySectionId)
    ) {
      activePropertySectionId = visiblePropertySections[0]?.id ?? null;
    }
  });

  function handleMessage(event: MessageEvent<NpcRoleEditorExtensionToWebviewMessage>) {
    const message = event.data;

    switch (message.type) {
      case "bootstrap":
        applyBootstrapMessage(message);
        extensionError = "";
        return;
      case "update":
        workspace.setDocument(message);
        return;
      case "clipboard":
        nodeEditorClipboard = message.clipboard;
        return;
      case "autocompletionValues":
        workspace.setAutocompleteValues(message.fieldId, message.values);
        return;
      case "referenceUpdate":
        workspace.setVariantReferenceState(message.reference);
        return;
      case "error":
        extensionError = message.message;
        return;
      case "contextAction":
        workspace.handleContextAction(message);
        return;
      default:
        return;
    }
  }

  function applyBootstrapMessage(message: NpcRoleEditorBootstrapMessage) {
    workspace.setDevelopment(message.isDevelopment);
    workspace.setDescriptors({
      descriptors: message.descriptors,
      descriptorPath: message.descriptorPath,
      descriptorSource: message.descriptorSource,
    });
    nodeEditorControlScheme = message.nodeEditorControlScheme;
    nodeEditorPlatform = message.nodeEditorPlatform;
    nodeEditorClipboard = message.nodeEditorClipboard;
    npcBehaviorGraphContexts = message.npcBehaviorGraphContexts;
  }

  function isGraphPageSection(section: NpcPropertySection): boolean {
    return getGraphRootField(section) !== null;
  }

  function getGraphWorkspaceContextForSection(
    section: NpcPropertySection,
  ): NodeEditorWorkspaceContext | undefined {
    const graphField = getGraphRootField(section);
    if (!graphField?.rootType) {
      return undefined;
    }

    return getGraphWorkspaceContextByRootType(graphField.rootType);
  }

  function getGraphRootField(section: NpcPropertySection): NpcPropertyField | null {
    if (section.fields.length !== 1) {
      return null;
    }

    const [field] = section.fields;
    return field.kind === "graph" ? field : null;
  }

  function getGraphWorkspaceContextByRootType(
    rootType: string,
  ): NodeEditorWorkspaceContext | undefined {
    switch (rootType) {
      case "Instructions":
        return npcBehaviorGraphContexts.Instructions;
      case "Instruction":
        return npcBehaviorGraphContexts.Instruction;
      case "Sensor":
        return npcBehaviorGraphContexts.Sensor;
      default:
        return undefined;
    }
  }

  function getOutlineSectionElement(sectionId: string) {
    return scrollRootElement?.querySelector<HTMLElement>(
      `[data-outline-section-id="${sectionId}"]`,
    );
  }

  async function navigateToSection(section: NpcPropertySection) {
    if (isGraphPageSection(section)) {
      activeGraphSectionId = section.id;
      return;
    }

    activeGraphSectionId = null;
    pendingPropertySectionId = section.id;
    activePropertySectionId = section.id;

    await tick();
    const sectionElement = getOutlineSectionElement(section.id);
    if (!sectionElement || !scrollRootElement) {
      return;
    }

    const rootTop = scrollRootElement.getBoundingClientRect().top;
    const sectionTop = sectionElement.getBoundingClientRect().top;

    scrollRootElement.scrollTo({
      behavior: "smooth",
      top: scrollRootElement.scrollTop + sectionTop - rootTop - OUTLINE_ACTIVE_OFFSET_PX,
    });
  }

  function updateActivePropertySection() {
    if (!scrollRootElement || visiblePropertySections.length === 0) {
      activePropertySectionId = visiblePropertySections[0]?.id ?? null;
      return;
    }

    if (pendingPropertySectionId) {
      return;
    }

    const thresholdTop = scrollRootElement.getBoundingClientRect().top + OUTLINE_ACTIVE_OFFSET_PX;
    let nextActiveSectionId = visiblePropertySections[0]?.id ?? null;

    for (const section of visiblePropertySections) {
      const sectionElement = getOutlineSectionElement(section.id);
      if (!sectionElement) continue;

      if (sectionElement.getBoundingClientRect().top <= thresholdTop) {
        nextActiveSectionId = section.id;
        continue;
      }

      break;
    }

    activePropertySectionId = nextActiveSectionId;
  }

  function openRawJson() {
    vscode.postMessage({ type: "openRawJson" });
  }

  function persistWebviewState(nextState: NpcRoleEditorWebviewState) {
    localWebviewState = nextState;
    vscode.setState?.(nextState);
  }

  function persistGraphViewport(sectionId: NpcSectionId, viewport: GraphViewport) {
    persistWebviewState({
      ...localWebviewState,
      graphViewports: {
        ...(localWebviewState.graphViewports ?? {}),
        [sectionId]: viewport,
      },
    });
  }

  function getDocumentTitle() {
    const fileName = workspace.documentPath.split("/").pop();
    return fileName ? fileName.replace(/\.json$/i, "") : "NPC Role";
  }

  onMount(() => {
    if (typeof vscode.getState === "function") {
      localWebviewState = (vscode.getState() as NpcRoleEditorWebviewState | undefined) ?? {};
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<main
  class="flex h-screen min-h-0 flex-col bg-vsc-bg text-sm text-vsc-editor-fg"
  in:fade={{ duration: 50 }}
>
  {#if extensionError}
    <div class="m-4 rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
      {extensionError}
    </div>
  {:else}
    <header
      class="flex items-center justify-between gap-3 border-b border-vsc-border bg-vsc-panel px-4 py-3"
    >
      <div class="min-w-0">
        <div class="space-x-1">
          <span class="truncate text-lg font-semibold">{getDocumentTitle()}</span>
          <span class="text-xs italic font-normal text-vsc-muted">
            NPCRole
          </span>
        </div>
        <div class="mt-1 truncate text-xs text-vsc-muted">
          {workspace.documentPath || "Waiting for document..."}
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if workspace.roleType}
          <span class="rounded-full bg-vsc-chip-bg px-2.5 py-1 text-xs font-medium text-vsc-chip-fg">
            {workspace.roleType}
          </span>
        {/if}
        <button
          type="button"
          class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
          onclick={openRawJson}
        >
          Open JSON
        </button>
      </div>
    </header>

    <div class="flex-1 min-h-0 p-4">
      <div class="grid h-full min-h-0 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside class="space-y-4 self-start">
          {#if !hasNavigationEntries}
            <div class="rounded-xl border border-vsc-border bg-vsc-panel p-2">
              <div class="px-3 py-2 text-xs text-vsc-muted">No sections available yet.</div>
            </div>
          {:else}
            {#if propertyNavigationEntries.length > 0}
              <div class="space-y-2">
                <div class="rounded-xl border border-vsc-border bg-vsc-panel p-2">
                  <div class="space-y-2">
                    {#each propertyNavigationEntries as entry (entry.id)}
                      {@const button = renderNavigationButton(entry)}
                      <button
                        type="button"
                        class="w-full rounded-lg border px-3 py-2 text-left transition-[border-color,background-color,color]"
                        class:border-vsc-focus={button.active}
                        class:bg-vsc-list-active-bg={button.active}
                        class:text-vsc-list-active-fg={button.active}
                        class:border-vsc-border={!button.active}
                        class:bg-vsc-button-secondary-bg={!button.active}
                        class:text-vsc-button-secondary-fg={!button.active}
                        onclick={button.onclick}
                      >
                        <div class="truncate text-sm font-semibold">{button.name}</div>
                        <div class="text-xs opacity-70">
                          {button.fieldCount}
                          {button.fieldCount === 1 ? "property" : "properties"}
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}

            {#if graphNavigationEntries.length > 0}
              <div class="rounded-xl border border-vsc-border bg-vsc-panel p-2">
                <div class="space-y-2">
                  {#each graphNavigationEntries as entry (entry.id)}
                    {@const button = renderNavigationButton(entry)}
                    <button
                      type="button"
                      class="w-full rounded-lg border px-3 py-2 text-left transition-[border-color,background-color,color]"
                      class:border-vsc-focus={button.active}
                      class:bg-vsc-list-active-bg={button.active}
                      class:text-vsc-list-active-fg={button.active}
                      class:border-vsc-border={!button.active}
                      class:bg-vsc-button-secondary-bg={!button.active}
                      class:text-vsc-button-secondary-fg={!button.active}
                      onclick={button.onclick}
                    >
                      <div class="truncate text-sm font-semibold">{button.name}</div>
                      <div class="text-xs opacity-70">Graph page</div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </aside>

        <div class="flex h-full min-h-0 min-w-0 self-stretch overflow-hidden flex-col">
          {#if workspace.documentParseError}
            <div class="rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
              {workspace.documentParseError}
            </div>
          {:else if activeGraphSection && activeGraphField}
            {#key activeGraphSectionId}
              <NpcGraphPage
                field={activeGraphField}
                workspaceContext={activeGraphWorkspaceContext}
                controlScheme={nodeEditorControlScheme}
                platform={nodeEditorPlatform}
                clipboard={nodeEditorClipboard}
                autocompleteField={workspace.autocompleteField}
                autocompleteValues={workspace.autocompleteValues}
                initialViewport={activeGraphViewport}
                onviewportchange={viewport => {
                  if (activeGraphSectionId) {
                    persistGraphViewport(activeGraphSectionId, viewport);
                  }
                }}
                documentVersion={workspace.documentVersion}
                {vscode}
              />
            {/key}
          {:else if visiblePropertySections.length === 0}
            <div class="rounded-md border border-dashed border-vsc-border px-4 py-3 text-sm text-vsc-muted">
              No property sections are available for this NPC role yet.
            </div>
          {:else}
            <div
              bind:this={scrollRootElement}
              class="h-full min-h-0 overflow-auto [overflow-anchor:none]"
            >
              <div class="space-y-4">
                {#each visiblePropertySections as section (section.id)}
                  <PropertySection {section} />
                {/each}

                <div aria-hidden="true" class="min-h-24 h-[50vh]"></div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</main>
