<!-- This component renders optimized canvas-based node and group mockups above xy-flow in low-detail mode. -->
<script lang="ts">
  import { useStore } from "@xyflow/svelte";
  import type { FlowEdge, FlowNode } from "src/common";
  import { GROUP_NODE_TYPE } from "src/constants";
  import { readColorForCss } from "src/node-editor/utils/colors";
  import { getAbsolutePosition } from "src/node-editor/utils/nodeUtils.svelte";
  import { workspace } from "src/workspace.svelte";
  import { onDestroy } from "svelte";

  const DEFAULT_NODE_WIDTH_PX = 112;
  const DEFAULT_NODE_HEIGHT_PX = 28;

  let {
    active = false,
  }: {
    active?: boolean;
  } = $props();

  const flowStore = $derived(useStore<FlowNode, FlowEdge>());
  const overlayNodes = $derived.by(() => {
    if (!active) {
      return [];
    }

    const { width, height, viewport } = flowStore;
    if (!width || !height || viewport.zoom <= 0) {
      return [];
    }

    const viewportPadding = 96 / viewport.zoom;
    const minX = -viewport.x / viewport.zoom - viewportPadding;
    const minY = -viewport.y / viewport.zoom - viewportPadding;
    const maxX = (width - viewport.x) / viewport.zoom + viewportPadding;
    const maxY = (height - viewport.y) / viewport.zoom + viewportPadding;

    const overlayItems = [];

    for (const node of workspace.nodes) {
      if (node.hidden) {
        continue;
      }

      const nodeWidth = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH_PX;
      const nodeHeight = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT_PX;
      const position = getAbsolutePosition(node);

      if (
        position.x + nodeWidth < minX ||
        position.y + nodeHeight < minY ||
        position.x > maxX ||
        position.y > maxY
      ) {
        continue;
      }

      if (node.type === GROUP_NODE_TYPE) {
        overlayItems.push({
          kind: "group" as const,
          x: position.x,
          y: position.y,
          width: nodeWidth,
          height: nodeHeight,
          selected: !!node.selected,
        });
        continue;
      }

      overlayItems.push({
        kind: "node" as const,
        x: position.x,
        y: position.y,
        width: nodeWidth,
        height: nodeHeight,
        accentColor: readColorForCss(node.data.nodeColor),
        selected: !!node.selected,
      });
    }

    return overlayItems;
  });

  let canvasElement = $state<HTMLCanvasElement | undefined>();
  let drawFrame: number | undefined;

  onDestroy(() => {
    if (drawFrame !== undefined) {
      cancelAnimationFrame(drawFrame);
    }
  });

  $effect(() => {
    const canvas = canvasElement;
    const width = flowStore.width;
    const height = flowStore.height;
    const viewport = flowStore.viewport;
    const nodes = overlayNodes;
    const isActive = active;

    if (!canvas) {
      return;
    }

    if (drawFrame !== undefined) {
      cancelAnimationFrame(drawFrame);
    }

    drawFrame = requestAnimationFrame(() => {
      drawOverlay({
        canvas,
        width,
        height,
        viewport,
        nodes,
        active: isActive,
      });
    });

    return () => {
      if (drawFrame !== undefined) {
        cancelAnimationFrame(drawFrame);
        drawFrame = undefined;
      }
    };
  });

  function readThemeVariable(variableName: string) {
    if (typeof window === "undefined") {
      return "";
    }

    const bodyResolved = document.body
      ? getComputedStyle(document.body).getPropertyValue(variableName).trim()
      : "";
    const rootResolved = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return bodyResolved || rootResolved;
  }

  function resolveCanvasColor(color: string) {
    const trimmed = color.trim();
    if (!trimmed.startsWith("var(") || typeof window === "undefined") {
      return trimmed;
    }

    const variableName = trimmed.slice(4, -1).trim();
    const resolved = readThemeVariable(variableName);
    return resolved.startsWith("var(") ? resolveCanvasColor(resolved) : resolved || trimmed;
  }

  function drawRect({
    context,
    x,
    y,
    width,
    height,
    fillStyle,
    alpha = 1,
  }: {
    context: CanvasRenderingContext2D;
    x: number;
    y: number;
    width: number;
    height: number;
    fillStyle: string;
    alpha?: number;
  }) {
    if (width <= 0 || height <= 0) {
      return;
    }

    context.globalAlpha = alpha;
    context.fillStyle = fillStyle;
    context.fillRect(x, y, width, height);
  }

  function drawOverlay({
    canvas,
    width,
    height,
    viewport,
    nodes,
    active,
  }: {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    viewport: { x: number; y: number; zoom: number };
    nodes: Array<{
      kind: "group" | "node";
      x: number;
      y: number;
      width: number;
      height: number;
      selected: boolean;
      accentColor?: string;
    }>;
    active: boolean;
  }) {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const cssWidth = Math.max(0, width);
    const cssHeight = Math.max(0, height);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const targetHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));

    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!active || cssWidth === 0 || cssHeight === 0) {
      return;
    }

    const shellFill =
      readThemeVariable("--vscode-editorWidget-background") ||
      resolveCanvasColor("var(--vscode-editorWidget-background)");
    const shellBorder = resolveCanvasColor("var(--vscode-editorWidget-border)");
    const selectionBorder = resolveCanvasColor("var(--vscode-focusBorder)");
    const groupFill = shellFill;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.translate(viewport.x, viewport.y);
    context.scale(viewport.zoom, viewport.zoom);

    for (const node of nodes) {
      if (node.kind === "group") {
        drawRect({
          context,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          fillStyle: groupFill,
          alpha: 0.4,
        });

        context.globalAlpha = 1;
        context.strokeStyle = node.selected ? selectionBorder : shellBorder;
        context.lineWidth = node.selected ? 2 : 1;
        context.setLineDash(node.selected ? [] : [6, 4]);
        context.strokeRect(node.x + 0.5, node.y + 0.5, node.width - 1, node.height - 1);
        context.setLineDash([]);
        continue;
      }

      drawRect({
        context,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        fillStyle: shellFill,
      });

      drawRect({
        context,
        x: node.x,
        y: node.y,
        width: node.width,
        height: Math.min(node.height, 4),
        fillStyle: resolveCanvasColor(node.accentColor ?? "var(--vscode-focusBorder)"),
      });

      context.globalAlpha = 1;
      context.strokeStyle = node.selected ? selectionBorder : shellBorder;
      context.lineWidth = node.selected ? 2 : 1;
      context.strokeRect(node.x + 0.5, node.y + 0.5, node.width - 1, node.height - 1);
    }
  }
</script>

{#if active}
  <canvas
    bind:this={canvasElement}
    aria-hidden="true"
    class="absolute inset-0 pointer-events-none"
    style:z-index={4}
  ></canvas>
{/if}
