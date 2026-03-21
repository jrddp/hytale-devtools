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
  const areNodesVisible = $derived(nonGroupNodes.every(node => !node.hidden));
  const areGroupsVisible = $derived(groupNodes.every(node => !node.hidden));
  const areEdgesVisible = $derived(workspace.edges.every(edge => !edge.hidden));

  let fps = $state(0);
  let worstFrameMs = $state(0);

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
      worstFrameMs = 0;
    } else {
      const totalFrameMs = durations.reduce((sum, duration) => sum + duration, 0);
      fps = totalFrameMs > 0 ? (durations.length * 1000) / totalFrameMs : 0;
      worstFrameMs = Math.max(...durations);
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

  function updateNodes(
    predicate: (node: FlowNode) => boolean,
    updater: (node: FlowNode) => FlowNode,
  ) {
    let didChange = false;
    const nextNodes = workspace.nodes.map(node => {
      if (!predicate(node)) {
        return node;
      }

      const nextNode = updater(node);
      didChange = didChange || nextNode !== node;
      return nextNode;
    });

    if (didChange) {
      workspace.nodes = nextNodes;
    }
  }

  function updateEdges(updater: (edge: FlowEdge) => FlowEdge) {
    let didChange = false;
    const nextEdges = workspace.edges.map(edge => {
      const nextEdge = updater(edge);
      didChange = didChange || nextEdge !== edge;
      return nextEdge;
    });

    if (didChange) {
      workspace.edges = nextEdges;
    }
  }

  function setElementVisibility(target: "nodes" | "groups" | "edges", visible: boolean) {
    const hidden = !visible;

    switch (target) {
      case "nodes":
        updateNodes(
          node => node.type !== GROUP_NODE_TYPE && !!node.hidden !== hidden,
          node => ({ ...node, hidden }),
        );
        break;
      case "groups":
        updateNodes(
          node => node.type === GROUP_NODE_TYPE && !!node.hidden !== hidden,
          node => ({ ...node, hidden }),
        );
        break;
      case "edges":
        updateEdges(edge => (!!edge.hidden === hidden ? edge : { ...edge, hidden }));
        break;
    }
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

      <div>Max frame</div>
      <div class="text-vsc-editor-fg">{formatMetric(worstFrameMs, 1)} ms</div>

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

    <div class="grid gap-2 border-t border-vsc-editor-widget-border pt-3 text-xs text-vsc-muted">
      <label class="flex items-center justify-between gap-3">
        <span>Custom box selection</span>
        <input
          class="h-4 w-4"
          type="checkbox"
          checked={workspace.useCustomSelectionBoxLogic}
          onchange={event => (workspace.useCustomSelectionBoxLogic = event.currentTarget.checked)}
        />
      </label>

      <label class="flex items-center justify-between gap-3">
        <span>Show nodes ({nonGroupNodes.length})</span>
        <input
          class="h-4 w-4"
          type="checkbox"
          checked={areNodesVisible}
          onchange={event => setElementVisibility("nodes", event.currentTarget.checked)}
        />
      </label>

      <label class="flex items-center justify-between gap-3">
        <span>Show groups ({groupNodes.length})</span>
        <input
          class="h-4 w-4"
          type="checkbox"
          checked={areGroupsVisible}
          onchange={event => setElementVisibility("groups", event.currentTarget.checked)}
        />
      </label>

      <label class="flex items-center justify-between gap-3">
        <span>Show edges ({workspace.edges.length})</span>
        <input
          class="h-4 w-4"
          type="checkbox"
          checked={areEdgesVisible}
          onchange={event => setElementVisibility("edges", event.currentTarget.checked)}
        />
      </label>
    </div>
  </section>
</Panel>
