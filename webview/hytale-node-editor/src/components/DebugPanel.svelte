<script lang="ts">
  import { Panel, useStore } from "@xyflow/svelte";
  import { onDestroy } from "svelte";
  import type { FlowEdge, FlowNode } from "src/common";
  import { GROUP_NODE_TYPE } from "src/constants";
  import { workspace } from "src/workspace.svelte";

  const FRAME_SAMPLE_WINDOW_MS = 1000;
  const FRAME_STATS_REFRESH_MS = 250;
  const MIN_THRESHOLD = 0.02;
  const MAX_THRESHOLD = 1;
  const THRESHOLD_STEP = 0.01;

  const flowStore = $derived(useStore<FlowNode, FlowEdge>());
  const nonGroupNodes = $derived.by(() =>
    workspace.nodes.filter(node => node.type !== GROUP_NODE_TYPE),
  );
  const groupNodes = $derived.by(() => workspace.nodes.filter(node => node.type === GROUP_NODE_TYPE));
  const visibleNodeCount = $derived(flowStore.visible.nodes.size);
  const visibleEdgeCount = $derived(flowStore.visible.edges.size);
  const visibleNonGroupNodeCount = $derived.by(() => {
    let count = 0;
    for (const node of flowStore.visible.nodes.values()) {
      if (node.type !== GROUP_NODE_TYPE) {
        count++;
      }
    }
    return count;
  });
  const visibleGroupCount = $derived(visibleNodeCount - visibleNonGroupNodeCount);
  const currentZoom = $derived(flowStore.viewport.zoom);

  let fps = $state(0);

  let rafId: number | undefined;
  let lastFrameTimestamp = 0;
  let lastStatsRefreshTimestamp = 0;
  let frameSamples: Array<{ timestamp: number; duration: number }> = [];

  onDestroy(() => {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
    }
  });

  $effect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const frameLoop = (timestamp: number) => {
      if (disposed) {
        return;
      }

      if (lastFrameTimestamp > 0) {
        frameSamples.push({
          timestamp,
          duration: timestamp - lastFrameTimestamp,
        });
        trimFrameSamples(timestamp);

        if (
          lastStatsRefreshTimestamp === 0 ||
          timestamp - lastStatsRefreshTimestamp >= FRAME_STATS_REFRESH_MS
        ) {
          commitFrameStats(timestamp);
          lastStatsRefreshTimestamp = timestamp;
        }
      }

      lastFrameTimestamp = timestamp;
      rafId = requestAnimationFrame(frameLoop);
    };

    rafId = requestAnimationFrame(frameLoop);

    return () => {
      disposed = true;
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }
      rafId = undefined;
      lastFrameTimestamp = 0;
      lastStatsRefreshTimestamp = 0;
      frameSamples = [];
    };
  });

  function trimFrameSamples(timestamp: number) {
    while (
      frameSamples.length > 0 &&
      timestamp - frameSamples[0].timestamp > FRAME_SAMPLE_WINDOW_MS
    ) {
      frameSamples.shift();
    }
  }

  function commitFrameStats(timestamp: number) {
    trimFrameSamples(timestamp);
    const durations = frameSamples.map(sample => sample.duration);
    if (durations.length === 0) {
      fps = 0;
    } else {
      const totalFrameMs = durations.reduce((sum, duration) => sum + duration, 0);
      fps = totalFrameMs > 0 ? (durations.length * 1000) / totalFrameMs : 0;
    }
  }

  function formatMetric(value: number, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
  }

  function handleThresholdInput(event: Event) {
    const nextValue = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    workspace.lowDetailZoomThreshold = Math.min(
      MAX_THRESHOLD,
      Math.max(MIN_THRESHOLD, nextValue),
    );
  }
</script>

<Panel position="bottom-left" class="pointer-events-auto">
  <section
    aria-label="Debug Panel"
    class="mb-2 ml-2 flex w-64 max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-xl border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-3 text-vsc-editor-fg shadow-2xl"
  >
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="m-0 text-sm font-semibold">Performance Debug</h2>
      <div class="text-[0.65rem] text-vsc-muted">Cmd/Ctrl+D</div>
    </div>

    <div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.7rem] text-vsc-muted">
      <div>FPS</div>
      <div class="text-vsc-editor-fg">{formatMetric(fps, 0)}</div>

      <div>Zoom</div>
      <div class="text-vsc-editor-fg">{formatMetric(currentZoom, 2)}x</div>

      <div>Nodes</div>
      <div class="text-vsc-editor-fg">{visibleNodeCount} / {workspace.nodes.length}</div>

      <div>Non-groups</div>
      <div class="text-vsc-editor-fg">{visibleNonGroupNodeCount} / {nonGroupNodes.length}</div>

      <div>Groups</div>
      <div class="text-vsc-editor-fg">{visibleGroupCount} / {groupNodes.length}</div>

      <div>Edges</div>
      <div class="text-vsc-editor-fg">{visibleEdgeCount} / {workspace.edges.length}</div>
    </div>

    <div class="grid gap-1 border-t border-vsc-editor-widget-border pt-3 text-[0.7rem] text-vsc-muted">
      <div class="flex items-center justify-between gap-2">
        <span>Low-detail threshold</span>
        <span class="text-vsc-editor-fg">{formatMetric(workspace.lowDetailZoomThreshold, 2)}x</span>
      </div>
      <input
        class="w-full"
        type="range"
        min={MIN_THRESHOLD}
        max={MAX_THRESHOLD}
        step={THRESHOLD_STEP}
        value={workspace.lowDetailZoomThreshold}
        oninput={handleThresholdInput}
      />
    </div>
  </section>
</Panel>
