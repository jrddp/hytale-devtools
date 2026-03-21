<script lang="ts">
  import * as THREE from "three";
  import { onMount, untrack } from "svelte";
  import { buildBlockymodelObject3D } from "./buildBlockymodelObject";
  import type { BlockymodelFile } from "./blockymodelTypes";
  import {
    createBlockymodelViewerRuntime,
    type BlockymodelViewerRuntime,
  } from "./viewerRuntime";

  interface Props {
    model?: BlockymodelFile | null;
    textureUrl?: string | null;
    textureBytes?: Uint8Array | number[] | null;
    orbit?: boolean;
    /** View angles in degrees. */
    roll?: number;
    pitch?: number;
    yaw?: number;
    scale?: number;
    showGrid?: boolean;
    class?: string;
  }

  let {
    model = null,
    textureUrl = null,
    textureBytes = null,
    orbit = false,
    roll = $bindable(),
    pitch = $bindable(),
    yaw = $bindable(),
    scale = 1,
    showGrid = true,
    class: className = "",
  }: Props = $props();

  let container = $state<HTMLDivElement | null>(null);
  let runtime = $state<BlockymodelViewerRuntime | null>(null);
  let currentTexture = $state<THREE.Texture | null>(null);
  let currentObject = $state<THREE.Object3D | null>(null);
  let rebuildVersion = 0;
  let errorMessage = $state("");
  let loading = $state(false);
  let syncingViewAngles = false;

  const resolvedTextureUrl = $derived.by(() => {
    if (textureUrl) {
      return textureUrl;
    }
    if (textureBytes && textureBytes.length > 0) {
      return createPngDataUrl(textureBytes);
    }
    return undefined;
  });

  function createPngDataUrl(bytes: Uint8Array | number[]): string {
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...Array.from(bytes.slice(index, index + chunkSize)));
    }

    return `data:image/png;base64,${btoa(binary)}`;
  }

  function loadTexture(url: string): Promise<THREE.Texture> {
    const loader = new THREE.TextureLoader();
    return loader.loadAsync(url).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      return texture;
    });
  }

  function registerMaterial(
    material: THREE.Material | THREE.Material[],
    set: Set<THREE.Material>,
  ): void {
    if (Array.isArray(material)) {
      for (const part of material) {
        set.add(part);
      }
      return;
    }

    set.add(material);
  }

  function disposeObject3D(object: THREE.Object3D): void {
    const materials = new Set<THREE.Material>();

    object.traverse(entry => {
      const mesh = entry as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }

      mesh.geometry?.dispose();
      if (mesh.material) {
        registerMaterial(mesh.material, materials);
      }
    });

    for (const material of materials) {
      material.dispose();
    }
  }

  function clearCurrentModel(): void {
    runtime?.setModelObject(null);
    if (currentObject) {
      disposeObject3D(currentObject);
      currentObject = null;
    }
  }

  function clearCurrentTexture(): void {
    currentTexture?.dispose();
    currentTexture = null;
  }

  function clearCurrentSceneState(): void {
    clearCurrentModel();
    clearCurrentTexture();
  }

  async function rebuild(
    nextRuntime: BlockymodelViewerRuntime,
    nextModel: BlockymodelFile | null,
    nextTextureUrl: string | undefined,
  ): Promise<void> {
    if (!nextModel) {
      clearCurrentSceneState();
      errorMessage = "";
      loading = false;
      return;
    }

    const version = ++rebuildVersion;
    loading = Boolean(nextTextureUrl);
    errorMessage = "";

    try {
      const nextTexture = nextTextureUrl ? await loadTexture(nextTextureUrl) : null;
      if (version !== rebuildVersion) {
        nextTexture?.dispose();
        return;
      }

      clearCurrentSceneState();
      currentTexture = nextTexture;
      currentObject = buildBlockymodelObject3D(nextModel, nextTexture ?? undefined);
      nextRuntime.setModelObject(currentObject);
    } catch (error) {
      if (version !== rebuildVersion) {
        return;
      }

      clearCurrentSceneState();
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      if (version === rebuildVersion) {
        loading = false;
      }
    }
  }

  onMount(() => {
    if (!container) {
      return;
    }

    runtime = createBlockymodelViewerRuntime(container, {
      orbit,
      scale,
      showGrid,
      onViewAnglesChange: angles => {
        syncingViewAngles = true;
        roll = angles.roll;
        pitch = angles.pitch;
        yaw = angles.yaw;
        queueMicrotask(() => {
          syncingViewAngles = false;
        });
      },
    });

    return () => {
      rebuildVersion += 1;
      clearCurrentSceneState();
      runtime?.dispose();
      runtime = null;
    };
  });

  $effect(() => {
    runtime?.setOrbit(orbit);
  });

  $effect(() => {
    runtime?.setGridVisible(showGrid);
  });

  $effect(() => {
    runtime?.setScale(scale);
  });

  $effect(() => {
    if (!runtime || syncingViewAngles) {
      return;
    }

    if (roll === undefined && pitch === undefined && yaw === undefined) {
      return;
    }

    runtime.setViewAngles({
      roll,
      pitch,
      yaw,
    });
  });

  $effect(() => {
    const nextRuntime = runtime;
    const nextModel = model;
    const nextTextureUrl = resolvedTextureUrl;

    if (!nextRuntime) {
      return;
    }

    untrack(() => {
      void rebuild(nextRuntime, nextModel, nextTextureUrl);
    });
  });
</script>

<div class={`preview ${className}`} data-blockymodel-preview>
  <div bind:this={container} class="viewport"></div>
  {#if loading}
    <div class="status status-loading">Loading model...</div>
  {/if}
  {#if errorMessage}
    <div class="status status-error">{errorMessage}</div>
  {/if}
</div>

<style>
  .preview {
    position: relative;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .status {
    position: absolute;
    inset-inline-start: 12px;
    max-inline-size: min(60ch, calc(100% - 24px));
    font-size: 13px;
    line-height: 1.4;
    border-radius: 8px;
    padding: 8px 10px;
    pointer-events: none;
  }

  .status-loading {
    inset-block-start: 12px;
    background: rgba(24, 36, 49, 0.7);
    color: #f0f5ff;
    border: 1px solid rgba(165, 193, 225, 0.45);
  }

  .status-error {
    inset-block-start: 46px;
    background: rgba(112, 20, 20, 0.9);
    color: #ffe5e5;
    border: 1px solid rgba(255, 173, 173, 0.56);
  }
</style>
