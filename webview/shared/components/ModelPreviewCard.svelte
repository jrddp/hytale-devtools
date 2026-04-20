<script lang="ts">
  import type {
    ModelPreviewState,
    ResolvedModelPreviewAttachment,
  } from "@shared/modelPreviewTypes";
  import { BlockymodelPreview, type BlockymodelFile } from "@webview-shared/blockymodel";
  import { LoaderCircle } from "lucide-svelte";
  import { resolveParsedPreviewAnimation } from "./modelPreviewAnimation";

  let {
    preview,
    emptyLabel = "No model found.",
    class: className = "",
  }: {
    preview?: ModelPreviewState;
    emptyLabel?: string;
    class?: string;
  } = $props();

  let lastPreviewAttachments: ResolvedModelPreviewAttachment[] | undefined = undefined;
  let lastResolvedAttachments: Array<{
    model: BlockymodelFile;
    textureBytes?: number[];
  }> = [];

  const resolvedAttachments = $derived.by(() => {
    const previewAttachments = preview?.type === "Model" ? preview.attachments : undefined;
    if (previewAttachments === lastPreviewAttachments) {
      return lastResolvedAttachments;
    }

    lastPreviewAttachments = previewAttachments;
    lastResolvedAttachments = (previewAttachments ?? [])
      .filter(attachment => attachment.model)
      .map(attachment => ({
        model: attachment.model as unknown as BlockymodelFile,
        textureBytes: attachment.texture,
      }));
    return lastResolvedAttachments;
  });
  const parsedAnimation = $derived(resolveParsedPreviewAnimation(preview));
</script>

<div
  class={`aspect-square overflow-hidden rounded-xl border border-vsc-border bg-vsc-panel ${className}`.trim()}
>
  {#if preview?.type === "Model" && preview.model}
    <BlockymodelPreview
      model={preview.model as unknown as BlockymodelFile}
      textureBytes={preview.texture}
      attachments={resolvedAttachments}
      animation={parsedAnimation}
      animationSpeed={preview.animationSpeed}
      animationLooping={preview.animationLooping}
      orbit={true}
      scale={1.5}
      showGrid={false}
      class="size-full"
    />
  {:else if preview?.loading}
    <div
      class="flex size-full flex-col items-center justify-center gap-3 px-6 text-center text-sm font-medium text-vsc-muted"
    >
      <LoaderCircle size={18} class="origin-center animate-spin duration-700" />
      <div>Loading assets...</div>
    </div>
  {:else}
    <div
      class="flex size-full items-center justify-center px-6 text-center text-sm font-medium text-vsc-muted"
    >
      {emptyLabel}
    </div>
  {/if}
</div>
