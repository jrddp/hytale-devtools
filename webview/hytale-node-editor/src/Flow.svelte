<script lang="ts">
  import {
    Background,
    Position,
    SelectionMode,
    SvelteFlow,
    type SvelteFlowProps,
    useStore,
    useSvelteFlow,
    useViewport,
    type Viewport,
    type XYPosition,
  } from "@xyflow/svelte";
  import { getOverlappingArea, nodeToRect, pointToRendererPoint } from "@xyflow/system";
  import "@xyflow/svelte/dist/style.css";

  import { type NodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
  import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
  import AddNodeMenu, { type AddMenuProps } from "src/components/AddNodeMenu.svelte";
  import NodeEditorActionMenu from "src/components/NodeEditorActionMenu.svelte";
  import NodeHelpPanel from "src/components/NodeHelpPanel.svelte";
  import NodeSearchPanel from "src/components/NodeSearchPanel.svelte";
  import { CONNECTION_RADIUS, GROUP_NODE_TYPE, MULTISELECT_KEY, nodeTypes } from "src/constants";
  import { logVSCodeTheme } from "src/node-editor/dev/mockVSCodeTheme";
  import { getAutoPositionNodeUpdates } from "src/node-editor/layout/autoLayout";
  import { isShortcutBlockedByEditableTarget } from "src/node-editor/utils/flowKeyboard";
  import { createUuidV4 } from "src/node-editor/utils/idUtils";
  import {
    getAbsoluteCenterPosition,
    getAbsolutePosition,
    getSiblingOrderUpdates,
    isValidConnection,
    pruneConflictingEdges,
    recalculateGroupParents,
    resolveFitViewNodeIds,
  } from "src/node-editor/utils/nodeUtils.svelte";
  import { applyDocumentState, workspace } from "src/workspace.svelte";
  import { untrack } from "svelte";
  import type { FlowEdge, FlowNode } from "./common";
  import { createNodeFromTemplate } from "./node-editor/utils/nodeFactory.svelte";

  const {
    fitView,
    screenToFlowPosition,
    setCenter: setViewportCenter,
    setViewport,
    updateNodeData,
    updateNode,
    deleteElements,
  } = useSvelteFlow();
  const flowStore = $derived(useStore<FlowNode, FlowEdge>());

  const viewport = useViewport();
  const getViewportCenter = (viewport: Viewport) => ({
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom,
  });

  let { nodes = $bindable([]), edges = $bindable([]) }: { nodes?: FlowNode[]; edges?: FlowEdge[] } =
    $props();

  const MIN_FLOW_ZOOM = 0;
  const SEARCH_NODE_FOCUS_DURATION_MS = 100;
  const SEARCH_NODE_FOCUS_ZOOM = 0.9;

  let flowWrapperElement: HTMLDivElement | undefined = undefined;
  let multiselectModifierPressed = $state(false);
  let lastUserSelectionRect = $state<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  let cursorPos = $state<XYPosition>();
  let pendingSourceConnection: { source: string; sourceHandle: string } | undefined;
  let pendingSourceConflictingEdges: FlowEdge[] = [];
  let pendingTargetConnection: { target: string; targetHandle: string } | undefined;
  let pendingTargetConflictingEdges: FlowEdge[] = [];

  let addMenuInstance:
    | { screenPosition: XYPosition; spawnPosition: XYPosition; connectionFilter?: string }
    | undefined = $state();
  let searchMenuInstance:
    | {
        initialViewport: Viewport;
      }
    | undefined = $state();
  let helpMenuOpen = $state(false);

  // # Handle actions requests
  $effect(() => {
    void workspace.areNodesMeasured;
    if (workspace.actionRequests.length > 0) untrack(() => handleActionRequests());
  });

  // custom box-selection handling
  // edges + nodes intersect partially, groups only intersect with full selection
  function applySelectionBoxOverrides(domSelectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const selectionOrigin = pointToRendererPoint(
      { x: domSelectionRect.x, y: domSelectionRect.y },
      [flowStore.viewport.x, flowStore.viewport.y, flowStore.viewport.zoom],
    );
    const selectionRect = {
      x: selectionOrigin.x,
      y: selectionOrigin.y,
      width: domSelectionRect.width / flowStore.viewport.zoom,
      height: domSelectionRect.height / flowStore.viewport.zoom,
    };
    const containerRect = flowStore.domNode?.getBoundingClientRect();
    const defaultNodeSelectable = flowStore.elementsSelectable;
    const defaultEdgeSelectable = flowStore.defaultEdgeOptions.selectable ?? true;

    const selectedNodeIds = new Set<string>();
    for (const internalNode of flowStore.nodeLookup.values()) {
      const node = internalNode.internals.userNode;
      const isSelectable = node.selectable ?? defaultNodeSelectable;
      if (!isSelectable || internalNode.hidden) {
        continue;
      }

      const nodeRect = nodeToRect(internalNode);
      const nodeArea = nodeRect.width * nodeRect.height;
      const overlappingArea = getOverlappingArea(selectionRect, nodeRect);
      if (node.type === GROUP_NODE_TYPE) {
        if (overlappingArea >= nodeArea) {
          selectedNodeIds.add(node.id);
        }
      } else if (overlappingArea > 0) {
        selectedNodeIds.add(node.id);
      }
    }

    const nextNodes = flowStore.nodes.map(node => {
      const shouldSelect = selectedNodeIds.has(node.id);
      if (!!node.selected === shouldSelect) {
        return node;
      }

      return { ...node, selected: shouldSelect };
    });

    const selectedEdgeIds = new Set<string>();
    if (containerRect) {
      for (const edge of flowStore.edges) {
        const isSelectable = edge.selectable ?? defaultEdgeSelectable;
        if (!isSelectable || edge.hidden) {
          continue;
        }

        const edgeElement = flowStore.domNode?.querySelector<SVGGElement>(
          `.svelte-flow__edge[data-id="${CSS.escape(edge.id)}"]`,
        );
        if (!edgeElement) {
          continue;
        }

        const edgeRect = edgeElement.getBoundingClientRect();
        const relativeEdgeRect = {
          x: edgeRect.left - containerRect.left,
          y: edgeRect.top - containerRect.top,
          width: edgeRect.width,
          height: edgeRect.height,
        };
        if (getOverlappingArea(domSelectionRect, relativeEdgeRect) > 0) {
          selectedEdgeIds.add(edge.id);
        }
      }
    }

    const nextEdges = flowStore.edges.map(edge => {
      const shouldSelect = selectedEdgeIds.has(edge.id);
      if (!!edge.selected === shouldSelect) {
        return edge;
      }

      return { ...edge, selected: shouldSelect };
    });

    if (nextNodes.some((node, index) => node !== flowStore.nodes[index])) {
      flowStore.nodes = nextNodes;
    }
    if (nextEdges.some((edge, index) => edge !== flowStore.edges[index])) {
      flowStore.edges = nextEdges;
    }
  }

  $effect(() => {
    if (flowStore.selectionRectMode !== "user" || !flowStore.selectionRect) {
      return;
    }

    lastUserSelectionRect = { ...flowStore.selectionRect };
    applySelectionBoxOverrides(flowStore.selectionRect);
  });

  function handleActionRequests() {
    // retain any actions that are not able to be processed yet
    const retained = [];
    for (const action of workspace.actionRequests) {
      switch (action.type) {
        case "reveal-node":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          const targetNodeId = action.nodeId ?? workspace.rootNodeId;
          if (!targetNodeId) {
            break;
          }

          const node = workspace.getNodeById(targetNodeId);
          if (!node) {
            console.warn(`Attempted to reveal node ${targetNodeId} but it was not found.`);
            continue;
          }
          const absolutePosition = getAbsolutePosition(node);
          const width = node.measured!.width!;
          const height = node.measured!.height!;
          const maxZoom = Math.min(
            (window.innerWidth / width) * 0.8,
            (window.innerHeight / height) * 0.8,
          );
          setViewportCenter(absolutePosition.x + width / 2, absolutePosition.y + height / 2, {
            zoom: Math.min(1.2, maxZoom),
            duration: action.duration ?? 250,
          });
          break;

        case "fit-view":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          const fitNodes = resolveFitViewNodeIds({
            nodes: workspace.nodes,
            rootNodeId: workspace.rootNodeId,
            maxDistanceToRoot: action.maxDistanceToRoot,
          });
          fitView({
            nodes: fitNodes.length > 0 ? fitNodes : undefined,
            padding: 0.2,
            minZoom: MIN_FLOW_ZOOM,
            duration: action.duration ?? 250,
          });
          break;

        case "select-all":
          workspace.selectNodes(
            workspace.nodes.map(node => node.id),
            "replace",
          );
          break;

        case "search-nodes":
          searchMenuInstance = { initialViewport: $state.snapshot(viewport.current) };
          break;

        case "auto-position-nodes":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          let targetNodes = workspace.getEffectivelySelectedNodes();
          if (targetNodes.length === 0) {
            const rootNode = workspace.getRootNode();
            if (rootNode) {
              targetNodes = [rootNode];
            } else if (workspace.nodes.length > 0) {
              targetNodes = workspace.nodes;
            } else {
              break;
            }
          }

          const updates = getAutoPositionNodeUpdates(targetNodes);
          if (updates.length > 0) {
            updates.forEach(update => updateNode(...update));
            recalculateGroupParents();
            applyDocumentState("auto-layout-applied");
          }
          break;

        case "view-raw-json":
          workspace.vscode.postMessage({ type: "openRawJson" });
          break;

        case "help-and-hotkeys":
          helpMenuOpen = !helpMenuOpen;
          break;

        case "customize-keybinds":
          workspace.vscode.postMessage({ type: "openKeybindings", query: "Hytale Node Editor" });
          break;
        case "document-refresh":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          // reorder siblings based on y position
          nodes
            .map(node => getSiblingOrderUpdates(node))
            .flat()
            .forEach(update => updateNodeData(...update));

          clearPendingConnection("both", true);
          recalculateGroupParents();
          break;
        case "reveal-selection":
          console.log("reveal-selection called but not implemented");
          break;
        default:
          const _exhaustiveCheck: never = action;
      }
    }
    // length check to avoid trigger reactivity when there is no change
    if (retained.length !== workspace.actionRequests.length) workspace.actionRequests = retained;
  }

  /** @returns true if there were conflicts to restore/remove */
  function clearPendingConnection(
    type: "source" | "target" | "both",
    restoreConflicts: boolean,
  ): boolean {
    let hadConflicts = false;
    if (type === "source" || type === "both") {
      pendingSourceConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(pendingSourceConflictingEdges);
      }
      hadConflicts = pendingSourceConflictingEdges.length > 0;
      pendingSourceConflictingEdges = [];
    }
    if (type === "target" || type === "both") {
      pendingTargetConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(pendingTargetConflictingEdges);
      }
      hadConflicts = hadConflicts || pendingTargetConflictingEdges.length > 0;
      pendingTargetConflictingEdges = [];
    }
    return hadConflicts;
  }

  // ! window event
  function handleWindowKeyDown(event: KeyboardEvent) {
    if (event.key === MULTISELECT_KEY) {
      multiselectModifierPressed = true;
    }

    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      isShortcutBlockedByEditableTarget(event.target)
    ) {
      return;
    }

    let captured = false;

    switch (event.key) {
      case "d":
        if (event.metaKey) {
          console.log("workspace", workspace);
          if (workspace.selectedNodes) console.log(...workspace.selectedNodes);
          logVSCodeTheme();
        }
        captured = true;
        break;
      case "Escape":
        helpMenuOpen = false;
        addMenuInstance = undefined;
        searchMenuInstance = undefined;
        captured = true;
        workspace.selectNodes([], "replace");
        break;
    }

    if (captured) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleWindowKeyUp(event: KeyboardEvent) {
    if (event.key === MULTISELECT_KEY) {
      multiselectModifierPressed = false;
    }
  }

  /** @returns deep-copy clones of the nodes with their positions relative to their collective center */
  function normalizeNodePositions(nodes: FlowNode[]) {
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
      const position = getAbsoluteCenterPosition(node);
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x);
      maxY = Math.max(maxY, position.y);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return nodes.map(node => {
      const copiedNode = structuredClone($state.snapshot(node)) as FlowNode;
      const absolutePosition = getAbsolutePosition(node);
      return {
        ...copiedNode,
        position: {
          x: absolutePosition.x - centerX,
          y: absolutePosition.y - centerY,
        },
        parentId: undefined,
        selected: false,
      };
    });
  }

  function buildCopiedSelection(nodes: FlowNode[]): NodeEditorClipboardSelection {
    const selectedNodeIds = new Set(nodes.map(node => node.id));
    const copiedEdges = workspace.edges
      .filter(edge => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target))
      .map(edge => {
        const copiedEdge = structuredClone($state.snapshot(edge)) as FlowEdge;
        copiedEdge.selected = false;
        return copiedEdge;
      });

    return {
      nodes: normalizeNodePositions(nodes),
      edges: copiedEdges,
    };
  }

  function updateCopiedSelection(copiedSelection: NodeEditorClipboardSelection) {
    workspace.copiedSelection = copiedSelection;
    workspace.vscode.postMessage({ type: "clipboard", clipboard: copiedSelection });
  }

  function handleWindowCopy(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    updateCopiedSelection(buildCopiedSelection(workspace.getEffectivelySelectedNodes()));

    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowCut(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }

    const nodesCut = workspace.getEffectivelySelectedNodes();
    updateCopiedSelection(buildCopiedSelection(nodesCut));

    void deleteElements({ nodes: nodesCut });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowPaste(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    const mouseFlowPosition = screenToFlowPosition(cursorPos);
    const { nodes: copiedNodes, edges: copiedEdges } = workspace.copiedSelection;

    // deselect existing nodes
    workspace.nodes.forEach(node => {
      updateNode(node.id, { selected: false });
    });

    const pastedNodeIds = new Map<string, string>();
    const pastedNodes = copiedNodes.map(node => {
      const pastedNode = structuredClone($state.snapshot(node)) as FlowNode;
      const newNodeId = node.id.split("-")[0] + "-" + createUuidV4();
      pastedNodeIds.set(node.id, newNodeId);

      return {
        ...pastedNode,
        position: {
          x: node.position.x + mouseFlowPosition.x,
          y: node.position.y + mouseFlowPosition.y,
        },
        selected: true,
        id: newNodeId,
      };
    });
    const pastedEdges = copiedEdges.flatMap(edge => {
      const sourceId = pastedNodeIds.get(edge.source);
      const targetId = pastedNodeIds.get(edge.target);
      if (!sourceId || !targetId) {
        return [];
      }

      const pastedEdge = structuredClone($state.snapshot(edge)) as FlowEdge;
      return [
        {
          ...pastedEdge,
          id: `${sourceId}:${pastedEdge.sourceHandle}-${targetId}`,
          source: sourceId,
          target: targetId,
          selected: false,
        },
      ];
    });

    workspace.nodes = [...workspace.nodes, ...pastedNodes];
    workspace.addEdges(pastedEdges);
    applyDocumentState("nodes-pasted");
    event.preventDefault();
    event.stopPropagation();
  }

  // # Window Events
  const windowEvents = {
    onkeydowncapture: handleWindowKeyDown,
    onkeyupcapture: handleWindowKeyUp,
    oncopycapture: handleWindowCopy,
    oncutcapture: handleWindowCut,
    onpastecapture: handleWindowPaste,
    onpointermovecapture: (event: PointerEvent) => {
      cursorPos = { x: event.clientX, y: event.clientY };
    },
    onpointerdown: (event: PointerEvent) => {
      if (!(event.target as HTMLElement)?.closest("[data-add-menu]")) {
        addMenuInstance = undefined;
        if (clearPendingConnection("both", false)) {
          applyDocumentState("connection-removed");
        }
      }
      if (!(event.target as HTMLElement)?.closest("[data-search-menu]"))
        searchMenuInstance = undefined;
    },
    onblur: () => {
      multiselectModifierPressed = false;
    },
  };

  // # Svelte Flow Events
  const svelteFlowEvents: SvelteFlowProps<FlowNode, FlowEdge> = {
    // ## On Connect
    onconnect: connection => {
      pruneConflictingEdges(connection);
      workspace.addEdges([connection]);
      applyDocumentState("edge-created");
    },
    // ## On Connect Start
    onconnectstart: (pointerEvent, { nodeId, handleId, handleType }) => {
      switch (handleType) {
        case "source":
          pendingSourceConnection = {
            source: nodeId!,
            sourceHandle: handleId!,
          };
          pendingSourceConflictingEdges = pruneConflictingEdges(pendingSourceConnection);
          break;
        case "target":
          pendingTargetConnection = {
            target: nodeId!,
            targetHandle: handleId!,
          };
          pendingTargetConflictingEdges = pruneConflictingEdges(pendingTargetConnection);
          break;
      }
    },
    // ## On Connect End
    onconnectend: (event, connectionState) => {
      // spawn add menu if ended not on another pin and started from the parent node
      if (connectionState.fromPosition === Position.Right && connectionState.toNode === null) {
        const fromNode = workspace.getNodeById(connectionState.fromNode!.id);
        const connectionFilter = fromNode.data.childTypes[connectionState.fromHandle!.id];
        addMenuInstance = {
          screenPosition: connectionState.pointer!,
          spawnPosition: screenToFlowPosition(connectionState.pointer!),
          connectionFilter: connectionFilter,
        };
      } else {
        // restore conflicts if invalid
        clearPendingConnection("both", !connectionState.isValid);
      }
    },
    // ## On Node Drag Stop
    onnodedragstop: event => {
      recalculateGroupParents();
      applyDocumentState("node-moved");
    },
    // ## On Node Context Menu
    onnodecontextmenu: ({ event: pointerEvent, node }) => {
      // groups should open add menu on right click
      if (node.type === GROUP_NODE_TYPE) {
        const flowPosition = screenToFlowPosition({
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        });
        addMenuInstance = {
          screenPosition: { x: pointerEvent.clientX, y: pointerEvent.clientY },
          spawnPosition: flowPosition,
        };
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
      }
    },
    // ## On Pane Click (left click)
    onpaneclick: () => {
      addMenuInstance = undefined;
      searchMenuInstance = undefined;
      helpMenuOpen = false;
    },
    onselectionend: () => {
      if (!lastUserSelectionRect) {
        return;
      }

      const selectionRect = lastUserSelectionRect;
      requestAnimationFrame(() => applySelectionBoxOverrides(selectionRect));
    },
    // ## On Pane Context Menu (right click)
    onpanecontextmenu: ({ event }) => {
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addMenuInstance = {
        screenPosition: { x: event.clientX, y: event.clientY },
        spawnPosition: flowPosition,
      };
      event.preventDefault();
    },
    ondelete: ({ nodes, edges }) => {
      if (nodes.some(node => node.id === workspace.rootNodeId)) {
        workspace.rootNodeId = undefined;
      }
      applyDocumentState("elements-deleted");
    },
  };

  // # Add Menu Events
  const addMenuEvents: Partial<AddMenuProps> = {
    // ## On Add Menu Cancel
    oncancel: () => {
      clearPendingConnection("both", true);
      addMenuInstance = undefined;
    },

    // ## On Template Selection (create new node)
    onselection: template => {
      const isCreatingRootNode = !workspace.getRootNode();
      const newNode: FlowNode = {
        ...createNodeFromTemplate(template, addMenuInstance!.spawnPosition),
      };
      workspace.nodes = [...workspace.nodes, newNode];
      if (isCreatingRootNode) {
        workspace.rootNodeId = newNode.id;
      } else if (pendingSourceConnection) {
        workspace.addEdges([
          { ...pendingSourceConnection, target: newNode.id, targetHandle: INPUT_HANDLE_ID },
        ]);
      }
      clearPendingConnection("both", false);

      // this is to recalculate group parents - we can't do it immediately because the node does not yet have dimensions
      workspace.actionRequests.push({ type: "document-refresh" });
      addMenuInstance = undefined;
      applyDocumentState("node-created");
    },
  };
</script>

<svelte:window
  // svelte won't let you ...spread window events :'(
  onkeydowncapture={windowEvents.onkeydowncapture}
  onkeyupcapture={windowEvents.onkeyupcapture}
  oncopycapture={windowEvents.oncopycapture}
  oncutcapture={windowEvents.oncutcapture}
  onpastecapture={windowEvents.onpastecapture}
  onpointermovecapture={windowEvents.onpointermovecapture}
  onpointerdown={windowEvents.onpointerdown}
  onblur={windowEvents.onblur}
/>

<div class="relative w-full h-full overflow-hidden" bind:this={flowWrapperElement}>
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    disableKeyboardA11y={!!addMenuInstance || !!searchMenuInstance || helpMenuOpen}
    deleteKey={["Delete", "Backspace"]}
    selectionKey={null}
    selectionMode={SelectionMode.Partial}
    selectNodesOnDrag={false}
    zIndexMode={"auto"}
    panOnDrag={workspace.controlScheme === "mouse" && !multiselectModifierPressed}
    panOnScroll={workspace.controlScheme === "trackpad"}
    multiSelectionKey={MULTISELECT_KEY}
    selectionOnDrag={workspace.controlScheme === "trackpad" || multiselectModifierPressed}
    panActivationKey={null}
    minZoom={MIN_FLOW_ZOOM}
    onlyRenderVisibleElements={nodes.length >= 50}
    connectionRadius={CONNECTION_RADIUS}
    isValidConnection={connection => {
      // todo abuse validation checking + connection radius detection to trigger events for snap/snapping handles (so we can preview the pruning)
      // todo also while you're at it instead of *removing* conflicting edges we should render them as dashed lines it'll probably look better
      return isValidConnection(connection);
    }}
    {...svelteFlowEvents}
  >
    <Background bgColor={"var(--vscode-editor-background)"} />
    <NodeEditorActionMenu />
    {#if searchMenuInstance}
      <NodeSearchPanel
        oncancel={() => {
          setViewport(searchMenuInstance!.initialViewport, { duration: 250 });
          searchMenuInstance = undefined;
        }}
        onselection={(node, inputId) => {
          workspace.actionRequests.push({ type: "reveal-node", nodeId: node.id });
          workspace.selectNode(node.id, "replace");
          searchMenuInstance = undefined;
          // focus field that matched the search
          if (inputId) {
            const inputElement = document.getElementById(inputId);
            if (inputElement) {
              inputElement.focus();
              // inputElement.select();
            }
          }
        }}
        viewportCenter={getViewportCenter(searchMenuInstance!.initialViewport)}
      />
    {/if}
  </SvelteFlow>

  {#if addMenuInstance}
    {@const { screenPosition, connectionFilter } = addMenuInstance}
    <AddNodeMenu {connectionFilter} {screenPosition} {...addMenuEvents} />
  {/if}

  {#if helpMenuOpen}
    <NodeHelpPanel onclose={() => (helpMenuOpen = false)} />
  {/if}
</div>
