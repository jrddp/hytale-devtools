import { type SvelteFlowStore } from "@xyflow/svelte";
import { XYHandle } from "@xyflow/system";
import type { FlowEdge, FlowNode } from "src/common";

const HANDLE_PRIORITY_EDGE_TARGET_SELECTOR =
  ".svelte-flow__edge, .svelte-flow__edge-path, .svelte-flow__edge-interaction";
const HANDLE_PRIORITY_SELECTOR =
  ".svelte-flow__handle.connectionindicator, .svelte-flow__handle.connectingfrom";
const HANDLE_PRIORITY_CLICK_SLOP_PX = 4;

// Gives handles priority over overlapping edge hit targets by rerouting mouse-down
// to XYFlow's native handle connection-start logic.
export class HandlePriorityController {
  private pendingClickStart = $state<{ x: number; y: number } | undefined>();

  constructor(private overlayTargetSelector: string) {}

  trackPointerMove(event: Pick<PointerEvent, "clientX" | "clientY">) {
    if (!this.pendingClickStart) {
      return;
    }

    const dx = event.clientX - this.pendingClickStart.x;
    const dy = event.clientY - this.pendingClickStart.y;
    if (Math.hypot(dx, dy) > HANDLE_PRIORITY_CLICK_SLOP_PX) {
      this.pendingClickStart = undefined;
    }
  }

  reset() {
    this.pendingClickStart = undefined;
  }

  handleMouseDownCapture(
    event: MouseEvent,
    {
      useCanvasLowDetailOverlay,
      helpMenuOpen,
      flowStore,
    }: {
      useCanvasLowDetailOverlay: boolean;
      helpMenuOpen: boolean;
      flowStore: SvelteFlowStore<FlowNode, FlowEdge>;
    },
  ) {
    const handleTarget = this.getHandlePriorityTarget(event, {
      useCanvasLowDetailOverlay,
      helpMenuOpen,
    });
    if (!handleTarget) {
      return;
    }

    this.routeMouseDownToHandle(event, handleTarget, flowStore);
  }

  suppressEdgeClick(event: MouseEvent) {
    if (
      !this.pendingClickStart ||
      !(event.target instanceof Element) ||
      !event.target.closest(HANDLE_PRIORITY_EDGE_TARGET_SELECTOR)
    ) {
      return false;
    }

    const dx = event.clientX - this.pendingClickStart.x;
    const dy = event.clientY - this.pendingClickStart.y;
    this.pendingClickStart = undefined;
    if (Math.hypot(dx, dy) > HANDLE_PRIORITY_CLICK_SLOP_PX) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  private getHandlePriorityTarget(
    event: MouseEvent,
    {
      useCanvasLowDetailOverlay,
      helpMenuOpen,
    }: {
      useCanvasLowDetailOverlay: boolean;
      helpMenuOpen: boolean;
    },
  ) {
    if (
      useCanvasLowDetailOverlay ||
      helpMenuOpen ||
      event.button !== 0 ||
      event.defaultPrevented ||
      !(event.target instanceof Element) ||
      !event.target.closest(HANDLE_PRIORITY_EDGE_TARGET_SELECTOR) ||
      event.target.closest(this.overlayTargetSelector)
    ) {
      return undefined;
    }

    return event.target.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .find(
        (element): element is HTMLDivElement =>
          element instanceof HTMLDivElement && element.matches(HANDLE_PRIORITY_SELECTOR),
      );
  }

  private routeMouseDownToHandle(
    event: MouseEvent,
    handleTarget: HTMLDivElement,
    flowStore: SvelteFlowStore<FlowNode, FlowEdge>,
  ) {
    const nodeId = handleTarget.dataset.nodeid;
    if (!nodeId) {
      return;
    }

    const rawHandleId = handleTarget.dataset.handleid;
    const handleId = !rawHandleId || rawHandleId === "null" ? null : rawHandleId;
    const isTarget = handleTarget.classList.contains("target");

    this.pendingClickStart = { x: event.clientX, y: event.clientY };
    event.stopPropagation();

    XYHandle.onPointerDown(event, {
      handleId,
      nodeId,
      isTarget,
      connectionRadius: flowStore.connectionRadius,
      domNode: flowStore.domNode,
      nodeLookup: flowStore.nodeLookup,
      connectionMode: flowStore.connectionMode,
      lib: "svelte",
      autoPanOnConnect: flowStore.autoPanOnConnect,
      flowId: flowStore.flowId,
      panBy: flowStore.panBy,
      cancelConnection: flowStore.cancelConnection,
      onConnectStart: flowStore.onconnectstart,
      onConnect: connection => {
        const edge = flowStore.onbeforeconnect ? flowStore.onbeforeconnect(connection) : connection;
        if (!edge) {
          return;
        }

        flowStore.addEdge(edge);
        flowStore.onconnect?.(connection);
      },
      onConnectEnd: (...args) => flowStore.onconnectend?.(...args),
      isValidConnection: flowStore.isValidConnection ?? (() => true),
      updateConnection: flowStore.updateConnection,
      getTransform: () => [flowStore.viewport.x, flowStore.viewport.y, flowStore.viewport.zoom],
      getFromHandle: () => flowStore.connection.fromHandle,
      autoPanSpeed: flowStore.autoPanSpeed,
      dragThreshold: flowStore.connectionDragThreshold,
      handleDomNode: handleTarget,
    });
  }
}

export function createHandlePriorityController(overlayTargetSelector: string) {
  return new HandlePriorityController(overlayTargetSelector);
}
