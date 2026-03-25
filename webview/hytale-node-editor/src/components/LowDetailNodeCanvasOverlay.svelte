<!-- This component renders optimized canvas-based node and group mockups above xy-flow in low-detail mode. -->
<script lang="ts">
  import { useStore, type XYPosition } from "@xyflow/svelte";
  import RBush, { type BBox } from "rbush";
  import type { FlowEdge, FlowNode } from "src/common";
  import { resolveComputedColor } from "src/node-editor/utils/colors";
  import { onDestroy } from "svelte";

  type OverlayItem = {
    id: string;
    kind: "group" | "node";
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    accentColor?: string;
  };

  type IndexedOverlayItem = OverlayItem & {
    order: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  type VisibleOverlayItem = IndexedOverlayItem & {
    selected: boolean;
  };

  type OverlayEdge = {
    id: string;
    path: string;
    selected: boolean;
    animated: boolean;
  };

  const GROUP_LABEL_BASE_SIZE_PX = 18;
  const GROUP_LABEL_MAX_COMPENSATION_SCALE = 24;
  const NODE_LABEL_BASE_SIZE_PX = 46;
  const GROUP_LABEL_OFFSET_PX = 6;
  const NODE_LABEL_PADDING_X = 8;
  const NODE_LABEL_PADDING_Y = 8;
  const NODE_LABEL_LINE_HEIGHT = 1.25;

  let {
    active = false,
    items = [],
    edges = [],
    selectedNodeIds = [],
    draggedNodeIds = [],
    dragDelta = { x: 0, y: 0 },
    dragging = false,
    edgeWidth = 1,
    zoomCompensationScale = 1,
  }: {
    active?: boolean;
    items?: OverlayItem[];
    edges?: OverlayEdge[];
    selectedNodeIds?: string[];
    draggedNodeIds?: string[];
    dragDelta?: XYPosition;
    dragging?: boolean;
    edgeWidth?: number;
    zoomCompensationScale?: number;
  } = $props();

  const flowStore = $derived(useStore<FlowNode, FlowEdge>());
  const selectedNodeIdSet = $derived(new Set(selectedNodeIds));
  const draggedNodeIdSet = $derived(new Set(draggedNodeIds));
  const indexedItems = $derived(
    items.map((item, order) => ({
      ...item,
      order,
      minX: item.x,
      minY: item.y,
      maxX: item.x + item.width,
      maxY: item.y + item.height,
    })),
  );
  const itemById = $derived(new Map(indexedItems.map(item => [item.id, item])));
  const edgePathsById = $derived(new Map(edges.map(edge => [edge.id, new Path2D(edge.path)])));
  const overlayIndex = $derived.by(() => {
    const index = new RBush<IndexedOverlayItem>();
    index.load(indexedItems);
    return index;
  });

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

    const visibleBounds: BBox = { minX, minY, maxX, maxY };
    const visibleNodes: VisibleOverlayItem[] = [];
    for (const item of overlayIndex.search(visibleBounds)) {
      if (dragging && draggedNodeIdSet.has(item.id)) {
        continue;
      }

      visibleNodes.push({
        ...item,
        selected: selectedNodeIdSet.has(item.id),
      });
    }

    if (dragging) {
      for (const draggedNodeId of draggedNodeIdSet) {
        const item = itemById.get(draggedNodeId);
        if (!item) {
          continue;
        }

        const x = item.x + dragDelta.x;
        const y = item.y + dragDelta.y;
        if (x + item.width < minX || y + item.height < minY || x > maxX || y > maxY) {
          continue;
        }

        visibleNodes.push({
          ...item,
          x,
          y,
          minX: x,
          minY: y,
          maxX: x + item.width,
          maxY: y + item.height,
          selected: selectedNodeIdSet.has(item.id),
        });
      }
    }

    visibleNodes.sort((a, b) => a.order - b.order);
    return visibleNodes;
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
    const overlayEdges = edges;
    const edgePaths = edgePathsById;
    const isActive = active;
    const compensationScale = zoomCompensationScale;

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
        edges: overlayEdges,
        edgePaths,
        edgeWidth,
        zoomCompensationScale: compensationScale,
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

  function drawNodeTitle({
    context,
    x,
    y,
    width,
    height,
    title,
    fillStyle,
    fontSize,
  }: {
    context: CanvasRenderingContext2D;
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    fillStyle: string;
    fontSize: number;
  }) {
    if (!title) {
      return;
    }

    const maxTextWidth = Math.max(0, width - 2 * NODE_LABEL_PADDING_X);
    const maxTextHeight = Math.max(0, height - 2 * NODE_LABEL_PADDING_Y);
    if (maxTextWidth <= 0 || maxTextHeight <= 0) {
      return;
    }

    const lineHeight = fontSize * NODE_LABEL_LINE_HEIGHT;
    const maxLines = Math.max(1, Math.floor(maxTextHeight / lineHeight));
    const words = title.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = "";

    const commitLine = (line: string) => {
      if (line.length > 0) {
        lines.push(line);
      }
    };

    context.save();
    context.globalAlpha = 1;
    context.fillStyle = fillStyle;
    context.font = `700 ${fontSize}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();

    if (words.length === 0) {
      currentLine = title;
    } else {
      for (const word of words) {
        const nextLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;
        if (context.measureText(nextLine).width <= maxTextWidth) {
          currentLine = nextLine;
          continue;
        }

        commitLine(currentLine);
        currentLine = word;

        if (lines.length === maxLines) {
          break;
        }
      }
    }

    if (lines.length < maxLines) {
      commitLine(currentLine);
    }

    if (lines.length > maxLines) {
      lines.length = maxLines;
    }

    if (lines.length === maxLines && words.length > 0) {
      let lastLine = lines[maxLines - 1] ?? "";
      if (context.measureText(lastLine).width > maxTextWidth || title.trim() !== lines.join(" ")) {
        while (lastLine.length > 0 && context.measureText(`${lastLine}...`).width > maxTextWidth) {
          lastLine = lastLine.slice(0, -1).trimEnd();
        }
        lines[maxLines - 1] = lastLine.length > 0 ? `${lastLine}...` : "...";
      }
    }

    for (const [index, line] of lines.entries()) {
      context.fillText(
        line,
        x + NODE_LABEL_PADDING_X,
        y + NODE_LABEL_PADDING_Y + index * lineHeight,
      );
    }
    context.restore();
  }

  function drawGroupTitle({
    context,
    x,
    y,
    title,
    fillStyle,
    fontSize,
  }: {
    context: CanvasRenderingContext2D;
    x: number;
    y: number;
    title: string;
    fillStyle: string;
    fontSize: number;
  }) {
    if (!title) {
      return;
    }

    context.globalAlpha = 1;
    context.fillStyle = fillStyle;
    context.font = `700 ${fontSize}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(title, x, y - GROUP_LABEL_OFFSET_PX);
  }

  function drawOverlay({
    canvas,
    width,
    height,
    viewport,
    edges,
    edgePaths,
    edgeWidth,
    zoomCompensationScale,
    nodes,
    active,
  }: {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    viewport: { x: number; y: number; zoom: number };
    edges: OverlayEdge[];
    edgePaths: Map<string, Path2D>;
    edgeWidth: number;
    zoomCompensationScale: number;
    nodes: Array<{
      id: string;
      kind: "group" | "node";
      title: string;
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

    const shellFill = resolveComputedColor("var(--vscode-editorWidget-background)");
    const shellBorder = resolveComputedColor("var(--vscode-editorWidget-border)");
    const selectionBorder = resolveComputedColor("var(--vscode-focusBorder)");
    const nodeTitleFill = resolveComputedColor("var(--vscode-input-foreground)");
    const groupTitleFill = resolveComputedColor("var(--vscode-editor-foreground)");
    const edgeStroke = getComputedStyle(flowStore.domNode).getPropertyValue("--xy-edge-stroke") || "#b1b1b7";
    const selectedEdgeStroke =
      getComputedStyle(flowStore.domNode).getPropertyValue("--xy-edge-stroke-selected") || "#555";
    const groupFill = shellFill;
    const groupLabelFontSize =
      GROUP_LABEL_BASE_SIZE_PX *
      Math.min(GROUP_LABEL_MAX_COMPENSATION_SCALE, zoomCompensationScale);
    const nodeLabelFontSize = NODE_LABEL_BASE_SIZE_PX;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.translate(viewport.x, viewport.y);
    context.scale(viewport.zoom, viewport.zoom);

    context.setLineDash([]);
    for (const edge of edges) {
      const path = edgePaths.get(edge.id);
      if (!path) {
        continue;
      }

      context.globalAlpha = 1;
      context.strokeStyle = edge.selected ? selectedEdgeStroke : edgeStroke;
      context.lineWidth = edgeWidth;
      context.setLineDash(edge.animated ? [5, 5] : []);
      context.stroke(path);
    }

    context.setLineDash([]);

    for (const node of nodes) {
      if (node.kind !== "group") {
        continue;
      }

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
    }

    for (const node of nodes) {
      if (node.kind === "group") {
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
        fillStyle: node.accentColor ?? selectionBorder,
      });

      context.globalAlpha = 1;
      context.strokeStyle = node.selected ? selectionBorder : shellBorder;
      context.lineWidth = node.selected ? 2 : 1;
      context.strokeRect(node.x + 0.5, node.y + 0.5, node.width - 1, node.height - 1);
      drawNodeTitle({
        context,
        x: node.x,
        y: node.y + Math.min(node.height, 4),
        width: node.width,
        height: Math.max(0, node.height - Math.min(node.height, 4)),
        title: node.title,
        fillStyle: nodeTitleFill,
        fontSize: nodeLabelFontSize,
      });
    }

    for (const node of nodes) {
      if (node.kind !== "group") {
        continue;
      }

      drawGroupTitle({
        context,
        x: node.x,
        y: node.y,
        title: node.title,
        fillStyle: groupTitleFill,
        fontSize: groupLabelFontSize,
      });
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
