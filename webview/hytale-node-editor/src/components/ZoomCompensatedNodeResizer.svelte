<script lang="ts">
  import { NodeResizer, useViewport } from "@xyflow/svelte";

  export let isVisible = false;
  export let autoScale = false;
  export let minWidth = 0;
  export let minHeight = 0;
  export let color = "var(--vscode-focusBorder)";
  export let handleClass = "rounded-sm border border-vsc-focus bg-vsc-editor-widget-bg";
  export let lineClass = "border-vsc-focus";
  export let onResizeEnd = undefined;

  const RESIZER_HANDLE_BASE_SIZE_PX = 8;
  const RESIZER_HANDLE_MAX_COMPENSATION_SCALE = 12;

  const viewport = useViewport();

  $: viewportZoom = readViewportZoom(viewport.current?.zoom);
  $: resizerHandleCompensationScale = readResizerHandleCompensationScale(viewportZoom);
  $: resizerHandleSizePx = Math.round(RESIZER_HANDLE_BASE_SIZE_PX * resizerHandleCompensationScale);
  $: computedHandleStyle = `width:${resizerHandleSizePx}px;height:${resizerHandleSizePx}px;`;

  function readViewportZoom(candidateZoom) {
    const zoom = Number(candidateZoom);
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return 1;
    }

    return zoom;
  }

  function readResizerHandleCompensationScale(zoom) {
    if (!Number.isFinite(zoom) || zoom >= 1) {
      return 1;
    }

    const inverseScale = 1 / zoom;
    return Math.min(RESIZER_HANDLE_MAX_COMPENSATION_SCALE, Math.max(1, inverseScale));
  }
</script>

<NodeResizer
  {isVisible}
  {autoScale}
  {minWidth}
  {minHeight}
  {color}
  {handleClass}
  handleStyle={computedHandleStyle}
  {lineClass}
  onResizeEnd={onResizeEnd}
/>
