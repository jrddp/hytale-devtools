<script lang="ts">
  import type {
    NpcRoleEditorExtensionToWebviewMessage,
    NpcRoleEditorBootstrapMessage,
    NpcRoleEditorGraphUpdateMessage,
  } from "@shared/npc-role-editor/messageTypes";
  import type {
    NodeEditorControlScheme,
    NodeEditorPlatform,
  } from "@shared/node-editor/messageTypes";
  import DocumentEditorShell from "@webview-shared/components/DocumentEditorShell.svelte";
  import ModelPreviewCard from "@webview-shared/components/ModelPreviewCard.svelte";
  import {
    createEmptyNodeEditorClipboardSelection,
    type NodeEditorClipboardSelection,
  } from "@shared/node-editor/clipboardTypes";
  import { parseAssetDocumentToGraphDocument } from "@shared/node-editor/graphDocument";
  import { adaptGraphHostValueToDocumentRoot } from "@shared/npc-role-editor/graphRootAdapter";
  import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
  import { onMount, tick, untrack } from "svelte";
  import type { VSCodeApi } from "./common";
  import type { NpcPropertyField, NpcPropertySection, NpcSectionId } from "./propertyModel";
  import { buildNpcComputeAutocompleteOptions } from "./compute/computeAutocomplete";
  import {
    isAppearancePreviewAnimationUpdateCurrent,
    isAppearancePreviewBaseUpdateCurrent,
    requestAppearancePreviewBase,
    syncAppearancePreviewAnimationRequest,
    type AppearancePreviewAnimationRequestState,
  } from "./appearancePreviewRequests";
  import { resolveDesiredAppearanceAnimationSetId } from "./workspace/appearancePreviewState";
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
  let latestGraphUpdate = $state<NpcRoleEditorGraphUpdateMessage | null>(null);
  let lastRequestedAppearanceAnimationRequest = $state<AppearancePreviewAnimationRequestState | null>(null);
  let npcBehaviorGraphContexts = $state.raw<
    Partial<Record<"Instructions" | "Instruction" | "Sensor", NodeEditorWorkspaceContext>>
  >({});
  let previousActiveGraphSectionId: NpcSectionId | null = null;

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
        subtitle: getGraphNavigationSubtitle(section),
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
    subtitle?: string;
  }) => ({
    id: entry.id,
    name: entry.name,
    fieldCount: entry.fieldCount,
    kind: entry.kind,
    subtitle: entry.subtitle,
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
  const standardParameterFields = $derived.by(() => workspace.getStandardParameterFields());
  const computeAutocompleteOptions = $derived(
    buildNpcComputeAutocompleteOptions({
      parameters: standardParameterFields,
    }),
  );
  const effectiveAppearanceAssetName = $derived.by(
    () => workspace.getEffectiveAppearanceAssetName() ?? null,
  );
  const desiredAppearanceAnimationSetId = $derived.by(
    () =>
      resolveDesiredAppearanceAnimationSetId({
        assetName: effectiveAppearanceAssetName,
        autocompleteAnimationOverride: workspace.appearanceAutocompleteAnimationOverride,
        focusedAnimationOverride: workspace.appearanceFocusedAnimationOverride,
      }),
  );

  function syncAppearancePreviewBaseRequestState() {
    if (effectiveAppearanceAssetName === workspace.appearanceBasePreviewAssetName) {
      return;
    }

    untrack(() => {
      workspace.beginAppearanceBasePreviewLoad(effectiveAppearanceAssetName);
    });
    lastRequestedAppearanceAnimationRequest = null;
    if (!effectiveAppearanceAssetName) {
      return;
    }

    requestAppearancePreviewBase(vscode, effectiveAppearanceAssetName);
  }

  function syncAppearancePreviewAnimationRequestState() {
    if (!effectiveAppearanceAssetName || !desiredAppearanceAnimationSetId) {
      lastRequestedAppearanceAnimationRequest = null;
      return;
    }

    if (!workspace.hasAppearanceBasePreviewForAsset(effectiveAppearanceAssetName)) {
      lastRequestedAppearanceAnimationRequest = null;
      return;
    }

    if (
      untrack(() =>
        workspace.showAppearanceAnimationPreview(
          effectiveAppearanceAssetName,
          desiredAppearanceAnimationSetId,
        ),
      )
    ) {
      lastRequestedAppearanceAnimationRequest = null;
      return;
    }

    if (desiredAppearanceAnimationSetId === "Idle") {
      lastRequestedAppearanceAnimationRequest = null;
      return;
    }

    lastRequestedAppearanceAnimationRequest = syncAppearancePreviewAnimationRequest({
      assetName: effectiveAppearanceAssetName,
      animationSetId: desiredAppearanceAnimationSetId,
      lastRequestedRequest: lastRequestedAppearanceAnimationRequest,
      vscode,
    });
  }

  $effect(() => {
    if (activeGraphSectionId && !activeGraphSection) {
      activeGraphSectionId = null;
    }
  });

  $effect(() => {
    if (previousActiveGraphSectionId && !activeGraphSectionId) {
      latestGraphUpdate = null;
      workspace.flushDeferredDocumentState();
    }

    previousActiveGraphSectionId = activeGraphSectionId;
  });

  $effect(() => {
    syncAppearancePreviewBaseRequestState();
  });

  $effect(() => {
    syncAppearancePreviewAnimationRequestState();
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
    console.log(message);

    switch (message.type) {
      case "bootstrap":
        applyBootstrapMessage(message);
        extensionError = "";
        return;
      case "update":
        if (activeGraphSectionId) {
          if (latestGraphUpdate?.version !== message.version) {
            latestGraphUpdate = null;
          }
          workspace.setDeferredDocument(message);
        } else {
          workspace.setDocument(message);
          latestGraphUpdate = null;
        }
        return;
      case "graphUpdate":
        if (activeGraphSectionId) {
          latestGraphUpdate = message;
          workspace.setDeferredDocument(message);
        }
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
      case "componentReferenceTargetUpdate":
        workspace.setComponentReferenceTarget(message.target);
        return;
      case "appearancePreviewBaseUpdate":
        if (
          !isAppearancePreviewBaseUpdateCurrent({
            assetName: message.assetName,
            currentAssetName: effectiveAppearanceAssetName,
          })
        ) {
          return;
        }
        workspace.setAppearanceBasePreviewResult({
          assetName: message.assetName ?? null,
          basePreview: message.basePreview,
          animationIds: message.animationIds ?? [],
          idleAnimationPreview: message.idleAnimationPreview,
        });
        return;
      case "appearancePreviewAnimationUpdate":
        if (
          !isAppearancePreviewAnimationUpdateCurrent({
            assetName: message.assetName,
            animationSetId: message.animationSetId,
            currentAssetName: effectiveAppearanceAssetName,
            currentAnimationSetId: desiredAppearanceAnimationSetId,
          })
        ) {
          return;
        }
        workspace.setAppearanceAnimationPreviewResult({
          assetName: message.assetName,
          animationSetId: message.animationSetId,
          animationPreview: message.animationPreview,
        });
        workspace.showAppearanceAnimationPreview(message.assetName, message.animationSetId);
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

  function getGraphNavigationSubtitle(section: NpcPropertySection): string {
    const field = getGraphRootField(section);
    if (!field || field.isSet === false) {
      return "Not set";
    }

    const workspaceContext = getGraphWorkspaceContextForSection(section);
    if (!workspaceContext) {
      return "Not set";
    }

    try {
      const value = field.value.kind === "literal" ? field.value.value : undefined;
      const graphDocument = parseAssetDocumentToGraphDocument(
        adaptGraphHostValueToDocumentRoot(value, workspaceContext, field.preservedData),
        workspaceContext,
      );
      const count = graphDocument.nodes.filter(
        node =>
          node.id !== graphDocument.rootNodeId &&
          node.type !== "groupnode" &&
          node.type !== "comment",
      ).length;
      return `${count} ${count === 1 ? "node" : "nodes"}`;
    } catch {
      return "Not set";
    }
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
      pendingPropertySectionId = null;
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
      behavior: "instant",
      top: scrollRootElement.scrollTop + sectionTop - rootTop - OUTLINE_ACTIVE_OFFSET_PX,
    });
    pendingPropertySectionId = null;
    updateActivePropertySection();
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

{#if extensionError}
  <div class="m-4 rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
    {extensionError}
  </div>
{:else}
  <DocumentEditorShell
    title={getDocumentTitle()}
    subtitle="NPCRole"
    path={workspace.documentPath || "Waiting for document..."}
    bind:scrollRootElement
  >
    {#snippet actions()}
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
    {/snippet}

    {#snippet sidebar()}
      {#if effectiveAppearanceAssetName || workspace.appearancePreview}
        <ModelPreviewCard preview={workspace.appearancePreview} />
      {/if}

      {#if !hasNavigationEntries}
        <div class="rounded-xl border border-vsc-border bg-vsc-panel p-2">
          <div class="px-3 py-2 text-xs text-vsc-muted">No sections available yet.</div>
        </div>
      {:else}
        {#if propertyNavigationEntries.length > 0}
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
                  {#if button.subtitle}
                    <div class="text-xs opacity-70">{button.subtitle}</div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    {/snippet}

    {#if workspace.documentParseError}
      <div class="rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
        {workspace.documentParseError}
      </div>
    {:else if activeGraphSection && activeGraphField}
      <div class="min-h-[32rem] h-[calc(100vh-9rem)]">
        {#key activeGraphSectionId}
          <NpcGraphPage
            field={activeGraphField}
            workspaceContext={activeGraphWorkspaceContext}
            controlScheme={nodeEditorControlScheme}
            platform={nodeEditorPlatform}
            clipboard={nodeEditorClipboard}
            autocompleteField={workspace.autocompleteField}
            autocompleteValues={workspace.autocompleteValues}
          {computeAutocompleteOptions}
            documentText={workspace.documentText}
            initialViewport={activeGraphViewport}
            onviewportchange={viewport => {
              if (activeGraphSectionId) {
                persistGraphViewport(activeGraphSectionId, viewport);
              }
            }}
            documentVersion={workspace.documentVersion}
            graphUpdate={latestGraphUpdate}
            {vscode}
          />
        {/key}
      </div>
    {:else if visiblePropertySections.length === 0}
      <div class="rounded-md border border-dashed border-vsc-border px-4 py-3 text-sm text-vsc-muted">
        No property sections are available for this NPC role yet.
      </div>
    {:else}
      <div class="space-y-4">
        {#each visiblePropertySections as section (section.id)}
          <PropertySection {section} />
        {/each}

        <div aria-hidden="true" class="min-h-24 h-[50vh]"></div>
      </div>
    {/if}
  </DocumentEditorShell>
{/if}
