<script lang="ts">
  import {
    Background,
    Position,
    SelectionMode,
    SvelteFlow,
    type SvelteFlowProps,
    useSvelteFlow,
    useViewport,
    type Viewport,
    type XYPosition,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
  import AddNodeMenu, { type AddMenuProps } from "src/components/AddNodeMenu.svelte";
  import NodeEditorActionMenu from "src/components/NodeEditorActionMenu.svelte";
  import NodeHelpPanel from "src/components/NodeHelpPanel.svelte";
  import { CONNECTION_RADIUS, GROUP_NODE_TYPE, nodeTypes } from "src/constants";
  import {
    getSiblingOrderUpdates,
    isValidConnection,
    pruneConflictingEdges,
    recalculateGroupParents,
  } from "src/node-editor/utils/nodeUtils.svelte";
  import { applyDocumentState, workspace } from "src/workspace.svelte";
  import { untrack } from "svelte";
  import type { FlowEdge, FlowNode } from "./common";
  import { isShortcutBlockedByEditableTarget } from "./node-editor/ui/flowKeyboard";
  import { createNodeFromTemplate } from "./node-editor/utils/nodeFactory.svelte";
  import { getAutoPositionNodeUpdates } from "src/node-editor/layout/autoLayout";

  const {
    fitView,
    screenToFlowPosition,
    setCenter: setViewportCenter,
    setViewport,
    updateNodeData,
    updateNode,
  } = useSvelteFlow();

  let { nodes = $bindable([]), edges = $bindable([]) }: { nodes?: FlowNode[]; edges?: FlowEdge[] } =
    $props();

  const INITIAL_FIT_ROOT_DISTANCE_LIMIT = 6500;
  const MIN_FLOW_ZOOM = 0;
  const SEARCH_NODE_FOCUS_DURATION_MS = 100;
  const SEARCH_NODE_FOCUS_ZOOM = 0.9;

  let flowWrapperElement: HTMLDivElement | undefined = undefined;

  let cursorPos = $state<XYPosition>();
  let pendingSourceConnection: { source: string; sourceHandle: string } | undefined;
  let pendingSourceConflictingEdges: FlowEdge[] = [];
  let pendingTargetConnection: { target: string; targetHandle: string } | undefined;
  let pendingTargetConflictingEdges: FlowEdge[] = [];
  let pendingConnectionFrom: "source" | "target" | undefined;

  let addMenuInstance:
    | { screenPosition: XYPosition; spawnPosition: XYPosition; connectionFilter?: string }
    | undefined = $state();
  let searchMenuInstance:
    | {
        initialViewport: Viewport;
        lastPreviewedNodeId?: string;
      }
    | undefined = $state();
  let helpMenuOpen = $state(false);

  // # Handle actions requests
  $effect(() => {
    console.log($state.snapshot(workspace.actionRequests));
    void workspace.actionRequests;
    void workspace.areNodesMeasured;
    if (workspace.actionRequests.length > 0) untrack(() => handleActionRequests());
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
          const node = workspace.getNodeById(action.nodeId ?? workspace.rootNodeId);
          if (!node) {
            console.warn(`Attempted to reveal node ${action.nodeId} but it was not found.`);
            continue;
          }
          setViewportCenter(
            node.position.x + node.measured!.width! / 2,
            node.position.y + node.measured!.height! / 2,
            {
              zoom: 1.2,
              duration: 250,
            },
          );
          break;

        case "fit-view":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          fitView({
            padding: 0.2,
            minZoom: MIN_FLOW_ZOOM,
            duration: action.duration ?? 250,
          });
          break;

        case "search-nodes":
          searchMenuInstance = { initialViewport: useViewport().current };
          break;

        case "auto-position-nodes":
          if (!workspace.areNodesMeasured) {
            retained.push(action);
            break;
          }
          let targetNodes = workspace.getEffectivelySelectedNodes();
          if (targetNodes.length === 0) {
            targetNodes = [workspace.getRootNode()];
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

  function clearPendingConnection(type: "source" | "target" | "both", restoreConflicts: boolean) {
    if (type === "both" || type === pendingConnectionFrom) {
      pendingConnectionFrom = undefined;
    }
    if (type === "source" || type === "both") {
      pendingSourceConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(pendingSourceConflictingEdges);
      }
      pendingSourceConflictingEdges = [];
    }
    if (type === "target" || type === "both") {
      pendingTargetConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(pendingTargetConflictingEdges);
      }
      pendingTargetConflictingEdges = [];
    }
  }

  // ! window event
  function handleWindowKeyDown(event: KeyboardEvent) {
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
          if (workspace.selectedNodes) console.log(workspace.selectedNodes);
        }
        captured = true;
        break;
      case "Escape":
        helpMenuOpen = false;
        addMenuInstance = undefined;
        searchMenuInstance = undefined;
        captured = true;
        break;
    }

    if (captured) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // ! window event
  function handleWindowCopy(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    // TODO implement

    event.preventDefault();
    event.stopPropagation();
  }

  // ! window event
  function handleWindowCut(event: ClipboardEvent) {
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    // TODO implement

    clearPendingConnection("both", true);
    applyDocumentState("nodes-cut");
    event.preventDefault();
    event.stopPropagation();
  }

  // ! window event
  function handleWindowPaste(event: ClipboardEvent) {
    // TODO implement
    if (isShortcutBlockedByEditableTarget(event.target)) {
      return;
    }
    applyDocumentState("nodes-pasted");
    event.preventDefault();
    event.stopPropagation();
  }

  // # Window Events
  const windowEvents = {
    onkeydowncapture: handleWindowKeyDown,
    oncopycapture: handleWindowCopy,
    oncutcapture: handleWindowCut,
    onpastecapture: handleWindowPaste,
    onpointermovecapture: (event: PointerEvent) => {
      cursorPos = { x: event.clientX, y: event.clientY };
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
      if (!connectionState.isValid && connectionState.toPosition === Position.Left) {
        addMenuInstance = {
          screenPosition: connectionState.pointer!,
          spawnPosition: screenToFlowPosition(connectionState.pointer!),
          connectionFilter: connectionState.fromNode!.type,
        };
      }
    },
    // ## On Node Drag Stop
    onnodedragstop: event => {
      // reorder siblings based on y position
      event.nodes
        .map(node => getSiblingOrderUpdates(node))
        .flat()
        .forEach(update => updateNodeData(...update));

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
      applyDocumentState("elements-deleted");
    },
  };

  // # Add Menu Events
  const addMenuEvents: Partial<AddMenuProps> = {
    // ## On Add Menu Cancel
    oncancel: () => {
      clearPendingConnection("both", true);
    },

    // ## On Template Selection (create new node)
    onselection: template => {
      const newNode: FlowNode = {
        ...createNodeFromTemplate(template, addMenuInstance!.spawnPosition),
        origin: [0.5, 0],
      };
      workspace.nodes = [...workspace.nodes, newNode];
      if (pendingSourceConnection) {
        workspace.addEdges([
          { ...pendingSourceConnection, target: newNode.id, targetHandle: INPUT_HANDLE_ID },
        ]);
      }
      clearPendingConnection("both", false);

      recalculateGroupParents();
      addMenuInstance = undefined;
      applyDocumentState("node-created");
    },
  };
</script>

<svelte:window
  // svelte won't let you ...spread window events :'(
  onkeydowncapture={windowEvents.onkeydowncapture}
  oncopycapture={windowEvents.oncopycapture}
  oncutcapture={windowEvents.oncutcapture}
  onpastecapture={windowEvents.onpastecapture}
  onpointermovecapture={windowEvents.onpointermovecapture}
/>

<div class="relative w-full h-full overflow-hidden" bind:this={flowWrapperElement}>
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    disableKeyboardA11y={!!addMenuInstance || !!searchMenuInstance || helpMenuOpen}
    deleteKey={["Delete", "Backspace"]}
    selectionMode={SelectionMode.Full}
    selectNodesOnDrag={false}
    zIndexMode={"auto"}
    panOnDrag={workspace.controlScheme === "mouse"}
    panOnScroll={workspace.controlScheme === "trackpad"}
    multiSelectionKey={"Shift"}
    selectionOnDrag={workspace.controlScheme === "trackpad"}
    panActivationKey={workspace.controlScheme === "mouse" ? "Shift" : undefined}
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
      <!-- <NodeSearchPanel
        onclose={() => (searchMenuInstance = undefined)}
        onpreview={(nodeId: string) => {
          workspace.actionRequests.push({ type: "reveal-node", nodeId });
          searchMenuInstance!.lastPreviewedNodeId = nodeId;
        }}
        onselect={(nodeId: string) => {
          if (nodeId !== searchMenuInstance!.lastPreviewedNodeId) {
            workspace.actionRequests.push({ type: "reveal-node", nodeId });
          }
        }}
      /> -->
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
