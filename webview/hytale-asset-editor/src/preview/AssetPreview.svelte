<script lang="ts">
  import { BlockymodelPreview, type BlockymodelFile } from "@webview-shared/blockymodel";
  import { LoaderCircle } from "lucide-svelte";
  import { workspace } from "../workspace.svelte";

  const previewImageUrl = $derived.by(() => {
    const preview = workspace.preview;

    if (preview?.type !== "Item" || !preview.icon) {
      return null;
    }

    return createPngDataUrl(preview.icon);
  });

  function createPngDataUrl(bytes: number[]): string {
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return `data:image/png;base64,${btoa(binary)}`;
  }
</script>

{#if workspace.assetDefinition?.preview === "Item" || workspace.assetDefinition?.preview === "Model"}
  <!-- bg #1F2C3C is the actual in-game hotbar color -->
  <div
    class="overflow-hidden border aspect-square rounded-xl border-vsc-border bg-vsc-panel"
    class:!bg-[#1F2C3C]={workspace.preview?.type === "Item" && previewImageUrl}
  >
    {#if workspace.preview?.type === "Item" && previewImageUrl}
      <div class="flex items-center justify-center p-3 size-full">
        <img
          src={previewImageUrl}
          alt="Asset preview"
          class="object-contain size-full"
          style:image-rendering="pixelated"
        />
      </div>
    {:else if workspace.preview?.type === "Model" && workspace.preview.model}
      <BlockymodelPreview
        model={workspace.preview.model as unknown as BlockymodelFile}
        textureBytes={workspace.preview.texture}
        showGrid={false}
        class="size-full"
      />
    {:else if workspace.preview?.loading}
      <div
        class="flex flex-col items-center justify-center gap-3 px-6 text-sm font-medium text-center size-full text-vsc-muted"
      >
        <LoaderCircle size={18} class="duration-700 origin-center animate-spin" />
        <div>Loading assets...</div>
      </div>
    {:else}
      <div
        class="flex items-center justify-center px-6 text-sm font-medium text-center size-full text-vsc-muted"
      >
        {workspace.assetDefinition.preview === "Item" ? "No icon found." : "No model found."}
      </div>
    {/if}
  </div>
{/if}
