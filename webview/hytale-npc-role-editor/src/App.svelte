<script lang="ts">
  import type { NpcRoleEditorExtensionToWebviewMessage } from "@shared/npc-role-editor/messageTypes";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import type { VSCodeApi } from "./common";
  import type { NpcPropertySection } from "./propertyModel";
  import PropertySection from "./components/PropertySection.svelte";
  import { workspace } from "./workspace.svelte";

  const OUTLINE_ACTIVE_OFFSET_PX = 16;
  const { vscode }: { vscode: VSCodeApi } = $props();

  let extensionError = $state("");
  let scrollRootElement = $state<HTMLDivElement>();
  let scrollRootHeight = $state(0);
  let lastOutlineSectionHeight = $state(0);
  let activeOutlineSectionId = $state<string | null>(null);
  let pendingOutlineSectionId = $state<string | null>(null);

  $effect(() => {
    workspace.vscode = vscode;
  });

  const outlineSections = $derived.by(() =>
    workspace.propertySections.map(section => ({
      id: section.id,
      name: section.name,
      fieldCount: section.fields.length,
    })),
  );

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
    if (outlineSections.length === 0) {
      activeOutlineSectionId = null;
      pendingOutlineSectionId = null;
      lastOutlineSectionHeight = 0;
      return;
    }

    if (
      !activeOutlineSectionId ||
      !outlineSections.some(section => section.id === activeOutlineSectionId)
    ) {
      activeOutlineSectionId = outlineSections[0]?.id ?? null;
    }
  });

  function handleMessage(event: MessageEvent<NpcRoleEditorExtensionToWebviewMessage>) {
    const message = event.data;

    switch (message.type) {
      case "bootstrap":
        workspace.setDescriptors({
          descriptors: message.descriptors,
          descriptorPath: message.descriptorPath,
          descriptorSource: message.descriptorSource,
        });
        extensionError = "";
        return;
      case "update":
        workspace.setDocument(message);
        return;
      case "autocompletionValues":
        // ! TEMP
        console.log("Autocomplete values received.", message);
        workspace.setAutocompleteValues(message.fieldId, message.values);
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

  function openRawJson() {
    vscode.postMessage({ type: "openRawJson" });
  }

  function getDocumentTitle() {
    const fileName = workspace.documentPath.split("/").pop();
    return fileName ? fileName.replace(/\.json$/i, "") : "NPC Role";
  }

  onMount(() => {
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

    <div bind:this={scrollRootElement} class="flex-1 min-h-0 overflow-auto">
      <div class="p-4">
        <div class="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside class="space-y-4 lg:sticky lg:top-4">
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
          </aside>

          <div class="min-w-0">
            {#if workspace.documentParseError}
              <div class="rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
                {workspace.documentParseError}
              </div>
            {:else if workspace.propertySections.length === 0}
              <div class="rounded-md border border-dashed border-vsc-border px-4 py-3 text-sm text-vsc-muted">
                No property sections are available for this NPC role yet.
              </div>
            {:else}
              <div class="space-y-4">
                {#each workspace.propertySections as section (section.id)}
                  <PropertySection {section} />
                {/each}

                <div
                  aria-hidden="true"
                  style:height={`${Math.max(
                    scrollRootHeight - OUTLINE_ACTIVE_OFFSET_PX - lastOutlineSectionHeight,
                    scrollRootHeight / 2,
                  )}px`}
                ></div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</main>
