<script lang="ts">
  import * as THREE from "three";
  import { onMount, untrack } from "svelte";
  import {
    createBlockyanimController,
    type BlockyanimController,
  } from "./blockyanimPlayer";
  import type { BlockyAnimFile } from "./blockyanimTypes";
  import {
    buildCompositeBlockymodelScene,
    type BuiltCompositeBlockymodelScene,
  } from "./buildCompositeBlockymodelScene";
  import type { BlockymodelFile } from "./blockymodelTypes";
  import {
    createBlockymodelViewerRuntime,
    type BlockymodelViewerRuntime,
  } from "./viewerRuntime";

  interface Props {
    model?: BlockymodelFile | null;
    textureUrl?: string | null;
    textureBytes?: Uint8Array | number[] | null;
    attachments?: Array<{
      model: BlockymodelFile;
      textureUrl?: string | null;
      textureBytes?: Uint8Array | number[] | null;
    }>;
    animation?: BlockyAnimFile | null;
    playing?: boolean;
    animationSpeed?: number;
    animationLooping?: boolean;
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
    attachments = [],
    animation = null,
    playing = true,
    animationSpeed = 1,
    animationLooping = undefined,
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
  let currentTextures = $state<THREE.Texture[]>([]);
  let currentScene = $state<BuiltCompositeBlockymodelScene | null>(null);
  let animationController = $state<BlockyanimController | null>(null);
  let rebuildVersion = 0;
  let errorMessage = $state("");
  let loading = $state(false);
  let syncingViewAngles = false;

  function createPngDataUrl(bytes: Uint8Array | number[]): string {
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...Array.from(bytes.slice(index, index + chunkSize)));
    }

    return `data:image/png;base64,${btoa(binary)}`;
  }

  function resolveTextureUrl(
    nextTextureUrl: string | null | undefined,
    nextTextureBytes: Uint8Array | number[] | null | undefined,
  ): string | undefined {
    if (nextTextureUrl) {
      return nextTextureUrl;
    }
    if (nextTextureBytes && nextTextureBytes.length > 0) {
      return createPngDataUrl(nextTextureBytes);
    }
    return undefined;
  }

  const resolvedTextureUrl = $derived(resolveTextureUrl(textureUrl, textureBytes));
  const resolvedAttachments = $derived.by(() =>
    attachments.map(attachment => ({
      model: attachment.model,
      textureUrl: resolveTextureUrl(attachment.textureUrl, attachment.textureBytes),
    })),
  );

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
    runtime?.setFrameHandler(null);
    animationController?.dispose();
    animationController = null;
    runtime?.setModelObject(null);
    if (currentScene) {
      disposeObject3D(currentScene.root);
      currentScene = null;
    }
  }

  function clearCurrentTexture(): void {
    for (const texture of currentTextures) {
      texture.dispose();
    }
    currentTextures = [];
  }

  function clearCurrentSceneState(): void {
    clearCurrentModel();
    clearCurrentTexture();
  }

  function syncAnimationState(): void {
    if (!runtime || !currentScene) {
      return;
    }

    if (!animationController) {
      animationController = createBlockyanimController(currentScene.animationRig);
    }

    animationController.setAnimation(animation ?? null);
    animationController.setPlaying(playing);
    animationController.setPlaybackRate(animationSpeed);
    animationController.setLoopingOverride(animationLooping);
    runtime.setFrameHandler(animation && playing ? deltaSeconds => animationController?.update(deltaSeconds) : null);

    if (!animation) {
      animationController.resetPose();
      runtime.requestRender();
      return;
    }

    animationController.update(0);
    runtime.requestRender();
  }

  async function rebuild(
    nextRuntime: BlockymodelViewerRuntime,
    nextModel: BlockymodelFile | null,
    nextTextureUrl: string | undefined,
    nextAttachments: Array<{ model: BlockymodelFile; textureUrl?: string }>,
  ): Promise<void> {
    if (!nextModel) {
      clearCurrentSceneState();
      errorMessage = "";
      loading = false;
      return;
    }

    const version = ++rebuildVersion;
    loading = Boolean(nextTextureUrl || nextAttachments.some(attachment => attachment.textureUrl));
    errorMessage = "";

    try {
      const nextTextures = await Promise.all([
        nextTextureUrl ? loadTexture(nextTextureUrl) : Promise.resolve(null),
        ...nextAttachments.map(attachment =>
          attachment.textureUrl ? loadTexture(attachment.textureUrl) : Promise.resolve(null),
        ),
      ]);
      if (version !== rebuildVersion) {
        for (const texture of nextTextures) {
          texture?.dispose();
        }
        return;
      }

      clearCurrentSceneState();
      currentTextures = nextTextures.filter((texture): texture is THREE.Texture => Boolean(texture));
      currentScene = buildCompositeBlockymodelScene(
        nextModel,
        nextTextures[0] ?? undefined,
        nextAttachments.map((attachment, index) => ({
          model: attachment.model,
          texture: nextTextures[index + 1] ?? undefined,
        })),
      );
      nextRuntime.setModelObject(currentScene.root);
      syncAnimationState();
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
    const nextAttachments = resolvedAttachments;

    if (!nextRuntime) {
      return;
    }

    untrack(() => {
      void rebuild(nextRuntime, nextModel, nextTextureUrl, nextAttachments);
    });
  });

  $effect(() => {
    const nextRuntime = runtime;
    const nextScene = currentScene;
    const nextAnimation = animation;
    const nextPlaying = playing;
    const nextAnimationSpeed = animationSpeed;
    const nextAnimationLooping = animationLooping;
    void nextAnimation;
    void nextPlaying;
    void nextAnimationSpeed;
    void nextAnimationLooping;

    if (!nextRuntime || !nextScene) {
      return;
    }

    syncAnimationState();
  });
</script>

<div class={`preview ${className}`} data-blockymodel-preview>
  <div bind:this={container} class="viewport"></div>
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

  .status-error {
    inset-block-start: 12px;
    background: rgba(112, 20, 20, 0.9);
    color: #ffe5e5;
    border: 1px solid rgba(255, 173, 173, 0.56);
  }
</style>
