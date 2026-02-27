<script lang="ts">
  import { NodeResizer, type OnResizeEnd, useViewport } from "@xyflow/svelte";

  const RESIZER_HANDLE_BASE_SIZE_PX = 10;
  const RESIZER_HANDLE_MAX_COMPENSATION_SCALE = 5.5;

  type Props = {
    isVisible?: boolean;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    color?: string;
    handleClass?: string;
    lineClass?: string;
    onResizeEnd?: OnResizeEnd;
  };

  let {
    isVisible = false,
    minWidth = 10,
    minHeight = 10,
    maxWidth = Number.MAX_VALUE,
    maxHeight = Number.MAX_VALUE,
    color = "var(--vscode-focusBorder)",
    handleClass = "rounded-sm border border-vsc-focus bg-vsc-editor-widget-bg",
    lineClass = "border-vsc-focus",
    onResizeEnd = undefined,
  }: Props = $props();

  const viewport = useViewport();

  let viewportZoom = $derived(readViewportZoom(viewport.current.zoom));
  let handleCompensationScale = $derived(readHandleCompensationScale(viewportZoom));
  let handleSizePx = $derived(Math.round(RESIZER_HANDLE_BASE_SIZE_PX * handleCompensationScale));
  let computedHandleStyle = $derived(`width:${handleSizePx}px;height:${handleSizePx}px;`);

  function readViewportZoom(candidateZoom: unknown) {
    const zoom = Number(candidateZoom);
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return 1;
    }

    return zoom;
  }

  function readHandleCompensationScale(zoom: number) {
    if (!Number.isFinite(zoom) || zoom >= 1) {
      return 1;
    }

    const inverseScale = 1 / zoom;
    return Math.min(RESIZER_HANDLE_MAX_COMPENSATION_SCALE, Math.max(1, inverseScale));
  }
</script>

<NodeResizer
  {isVisible}
  autoScale={false}
  {minWidth}
  {minHeight}
  {maxWidth}
  {maxHeight}
  {color}
  {handleClass}
  handleStyle={computedHandleStyle}
  {lineClass}
  {onResizeEnd}
/>
