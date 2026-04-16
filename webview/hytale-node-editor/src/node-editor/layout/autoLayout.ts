import ELK, {
  type ElkExtendedEdge,
  type ElkNode,
  type ElkPort,
  type LayoutOptions,
} from "elkjs/lib/elk.bundled.js";
import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import type { FlowEdge, FlowNode } from "@node-editor/common";
import type { NodeUpdates } from "@node-editor/node-editor/utils/nodeUtils.svelte";
import { getAbsolutePosition } from "@node-editor/node-editor/utils/nodeUtils.svelte";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";

const NODE_SEPARATION = 100;
const RANK_SEPARATION = 160;
const INSTRUCTION_GROUP_SEPARATION = 720;
const PORT_SEPARATION = 24;
const PORT_SIZE = 1;
const INPUT_BAND_SEPARATION = 100;
const INSTRUCTION_TEMPLATE_ID = "Structural.InstructionNode";

const elk = new ELK();

const ELK_GRAPH_LAYOUT_OPTIONS: LayoutOptions = {
  "org.eclipse.elk.algorithm": "layered",
  "org.eclipse.elk.direction": "RIGHT",
  "org.eclipse.elk.spacing.nodeNode": `${NODE_SEPARATION}`,
  "org.eclipse.elk.spacing.portPort": `${PORT_SEPARATION}`,
  "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": `${RANK_SEPARATION}`,
  "org.eclipse.elk.layered.considerModelOrder.strategy": "PREFER_EDGES",
  "org.eclipse.elk.layered.considerModelOrder.portModelOrder": "true",
  "org.eclipse.elk.layered.considerModelOrder.crossingCounterPortInfluence": "0.001",
  "org.eclipse.elk.layered.considerModelOrder.crossingCounterNodeInfluence": "0",
  "org.eclipse.elk.layered.nodePlacement.favorStraightEdges": "true",
};

const ELK_NODE_LAYOUT_OPTIONS: LayoutOptions = {
  "org.eclipse.elk.portConstraints": "FIXED_ORDER",
  "org.eclipse.elk.portAlignment.west": "BEGIN",
  "org.eclipse.elk.portAlignment.east": "BEGIN",
};

type LayoutNode = {
  id: string;
  width: number;
  height: number;
  flowNode: FlowNode;
};

type LayoutComponent = {
  nodeIds: string[];
  edges: FlowEdge[];
  anchorNodeId: string;
};

type BoxLayout = {
  positionsByNodeId: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  anchorNodeId?: string;
  anchorPosition: { x: number; y: number };
  anchorInputBandYByHandle: Map<string, number>;
};

type InstructionLayoutModel = {
  instructionIds: string[];
  topLevelInstructionIds: string[];
  childInstructionIdsByParentId: Map<string, string[]>;
  localNodeIdsByInstructionId: Map<string, string[]>;
  localEdgesByInstructionId: Map<string, FlowEdge[]>;
  rootWrapperId?: string;
};

export async function getAutoPositionNodeUpdates(
  seedNodes: FlowNode[],
  session: NodeEditorSession,
): Promise<NodeUpdates[]> {
  const layoutableSeedNodeIds = seedNodes
    .filter(isLayoutableNode)
    .map(node => node.id);
  if (layoutableSeedNodeIds.length === 0) {
    return [];
  }

  const components = getConnectedLayoutComponents(layoutableSeedNodeIds, session);
  const updates: NodeUpdates[] = [];

  for (const component of components) {
    const positionsByNodeId = await layoutConnectedComponent(component, session);
    for (const [nodeId, position] of positionsByNodeId) {
      const currentNode = session.getNodeById(nodeId);
      if (!currentNode) {
        continue;
      }

      if (
        currentNode.position.x === position.x &&
        currentNode.position.y === position.y &&
        currentNode.parentId === undefined
      ) {
        continue;
      }

      updates.push([nodeId, { position, parentId: undefined }]);
    }
  }

  return updates;
}

async function layoutConnectedComponent(
  component: LayoutComponent,
  session: NodeEditorSession,
): Promise<Map<string, { x: number; y: number }>> {
  const instructionModel = buildInstructionLayoutModel(component, session);
  if (instructionModel) {
    return layoutInstructionComponent(component, instructionModel, session);
  }

  return layoutGenericComponent(component.nodeIds, component.edges, component.anchorNodeId, session);
}

async function layoutInstructionComponent(
  component: LayoutComponent,
  model: InstructionLayoutModel,
  session: NodeEditorSession,
): Promise<Map<string, { x: number; y: number }>> {
  const subtreeLayoutsByInstructionId = new Map<string, BoxLayout>();
  const visitingInstructionIds = new Set<string>();

  const layoutInstructionSubtree = async (instructionId: string): Promise<BoxLayout> => {
    const cachedLayout = subtreeLayoutsByInstructionId.get(instructionId);
    if (cachedLayout) {
      return cachedLayout;
    }

    if (visitingInstructionIds.has(instructionId)) {
      throw new Error(`Instruction layout cycle detected at ${instructionId}.`);
    }

    visitingInstructionIds.add(instructionId);

    const localGroupLayout = await layoutInstructionLocalGroup(instructionId, model, session);
    const childInstructionIds = model.childInstructionIdsByParentId.get(instructionId) ?? [];
    const childSubtreeLayouts = [];
    for (const childInstructionId of childInstructionIds) {
      childSubtreeLayouts.push(await layoutInstructionSubtree(childInstructionId));
    }

    const subtreeLayout = composeInstructionSubtree(localGroupLayout, childSubtreeLayouts, session);
    subtreeLayoutsByInstructionId.set(instructionId, subtreeLayout);
    visitingInstructionIds.delete(instructionId);

    return subtreeLayout;
  };

  try {
    const topLevelLayouts = [];
    for (const instructionId of model.topLevelInstructionIds) {
      topLevelLayouts.push(await layoutInstructionSubtree(instructionId));
    }

    const combinedLayout = model.rootWrapperId
      ? composeRootBox(createSingleNodeBox(model.rootWrapperId, session), topLevelLayouts)
      : topLevelLayouts.length === 1
        ? topLevelLayouts[0]
        : composeForest(topLevelLayouts);

    return anchorBoxLayout(combinedLayout, component.anchorNodeId, session);
  } catch {
    return layoutGenericComponent(component.nodeIds, component.edges, component.anchorNodeId, session);
  }
}

async function layoutInstructionLocalGroup(
  instructionId: string,
  model: InstructionLayoutModel,
  session: NodeEditorSession,
): Promise<BoxLayout> {
  const nodeIds = model.localNodeIdsByInstructionId.get(instructionId) ?? [instructionId];
  const edges = model.localEdgesByInstructionId.get(instructionId) ?? [];
  const absolutePositions = await layoutGenericComponent(nodeIds, edges, instructionId, session, {
    stabilizeRoot: false,
  });

  const boxLayout = normalizeBoxLayout(nodeIds, absolutePositions, session, instructionId);
  return stabilizeAnchorInputBands(boxLayout, instructionId, edges, session);
}

async function layoutGenericComponent(
  nodeIds: string[],
  edges: FlowEdge[],
  anchorNodeId: string,
  session: NodeEditorSession,
  options: { stabilizeRoot?: boolean } = {},
): Promise<Map<string, { x: number; y: number }>> {
  const layoutNodes = nodeIds
    .map(nodeId => toLayoutNode(nodeId, session))
    .filter((node): node is LayoutNode => node !== null);

  if (layoutNodes.length === 0) {
    return new Map();
  }

  const sortedNodeIds = sortLayoutNodeIds(
    layoutNodes.map(node => node.id),
    session,
  );
  const sortedEdges = sortLayoutEdges(edges, session);

  const graph = createElkGraph(layoutNodes, sortedNodeIds, sortedEdges, session);
  const layoutedGraph = await elk.layout(graph);
  stabilizeIncomingPredecessorOrder(layoutedGraph, sortedEdges);
  if (options.stabilizeRoot !== false) {
    stabilizeRootNode(layoutedGraph, sortedEdges, session);
  }

  const anchorNode = session.getNodeById(anchorNodeId);
  const anchorLayoutNode = layoutedGraph.children?.find(node => node.id === anchorNodeId);
  if (!anchorNode || !anchorLayoutNode) {
    return new Map();
  }

  const anchorAbsolutePosition = getAbsolutePosition(anchorNode, session);
  const anchorLayoutPosition = {
    x: anchorLayoutNode.x ?? 0,
    y: anchorLayoutNode.y ?? 0,
  };
  const deltaX = anchorAbsolutePosition.x - anchorLayoutPosition.x;
  const deltaY = anchorAbsolutePosition.y - anchorLayoutPosition.y;

  const positionsByNodeId = new Map<string, { x: number; y: number }>();
  for (const layoutNode of layoutedGraph.children ?? []) {
    if (layoutNode.x === undefined || layoutNode.y === undefined) {
      continue;
    }

    positionsByNodeId.set(layoutNode.id, {
      x: layoutNode.x + deltaX,
      y: layoutNode.y + deltaY,
    });
  }

  return positionsByNodeId;
}

function buildInstructionLayoutModel(
  component: LayoutComponent,
  session: NodeEditorSession,
): InstructionLayoutModel | null {
  const instructionIds = component.nodeIds.filter(nodeId =>
    isInstructionNodeId(nodeId, session),
  );
  if (instructionIds.length === 0) {
    return null;
  }

  const instructionIdSet = new Set(instructionIds);
  const rootWrapperId =
    session.rootNodeId &&
    component.nodeIds.includes(session.rootNodeId) &&
    !instructionIdSet.has(session.rootNodeId)
      ? session.rootNodeId
      : undefined;

  const hierarchyEdges = sortLayoutEdges(
    component.edges.filter(edge => isInstructionHierarchyEdge(edge, session)),
    session,
  );

  const childInstructionIdsByParentId = new Map<string, string[]>();
  const parentInstructionIdByChildId = new Map<string, string>();

  for (const edge of hierarchyEdges) {
    if (!instructionIdSet.has(edge.target)) {
      continue;
    }

    if (!instructionIdSet.has(edge.source)) {
      continue;
    }

    if (parentInstructionIdByChildId.has(edge.target)) {
      return null;
    }

    parentInstructionIdByChildId.set(edge.target, edge.source);
    const childInstructionIds = childInstructionIdsByParentId.get(edge.source) ?? [];
    childInstructionIds.push(edge.target);
    childInstructionIdsByParentId.set(edge.source, childInstructionIds);
  }

  const rootOrderedTopLevelInstructionIds = hierarchyEdges
    .filter(edge => edge.source === rootWrapperId && instructionIdSet.has(edge.target))
    .map(edge => edge.target);
  const topLevelInstructionIds = [
    ...rootOrderedTopLevelInstructionIds,
    ...instructionIds
      .filter(
        instructionId =>
          !parentInstructionIdByChildId.has(instructionId) &&
          !rootOrderedTopLevelInstructionIds.includes(instructionId),
      )
      .sort((left, right) => getAbsoluteNodePosition(left, session).y - getAbsoluteNodePosition(right, session).y),
  ];

  if (topLevelInstructionIds.length === 0) {
    return null;
  }

  const instructionTraversalOrder = buildInstructionTraversalOrder(
    topLevelInstructionIds,
    childInstructionIdsByParentId,
  );
  const nonInstructionOwnerByNodeId = assignNonInstructionOwners(
    component,
    instructionTraversalOrder,
    instructionIdSet,
    rootWrapperId,
  );

  for (const nodeId of component.nodeIds) {
    if (
      instructionIdSet.has(nodeId) ||
      nodeId === rootWrapperId ||
      !isLayoutableNodeId(nodeId, session)
    ) {
      continue;
    }

    if (!nonInstructionOwnerByNodeId.has(nodeId)) {
      return null;
    }
  }

  const localNodeIdsByInstructionId = new Map(
    instructionIds.map(instructionId => [instructionId, [instructionId]]),
  );
  for (const [nodeId, instructionId] of nonInstructionOwnerByNodeId) {
    localNodeIdsByInstructionId.get(instructionId)!.push(nodeId);
  }

  const localEdgesByInstructionId = new Map<string, FlowEdge[]>();
  for (const instructionId of instructionIds) {
    const localNodeIdSet = new Set(localNodeIdsByInstructionId.get(instructionId) ?? []);
    localEdgesByInstructionId.set(
      instructionId,
      component.edges.filter(
        edge =>
          localNodeIdSet.has(edge.source) &&
          localNodeIdSet.has(edge.target),
      ),
    );
  }

  return {
    instructionIds,
    topLevelInstructionIds,
    childInstructionIdsByParentId,
    localNodeIdsByInstructionId,
    localEdgesByInstructionId,
    rootWrapperId,
  };
}

function assignNonInstructionOwners(
  component: LayoutComponent,
  instructionTraversalOrder: string[],
  instructionIdSet: Set<string>,
  rootWrapperId?: string,
): Map<string, string> {
  const neighboringNonInstructionIdsByNodeId = buildNeighboringNonInstructionIdsByNodeId(
    component,
    instructionIdSet,
    rootWrapperId,
  );
  const ownerByNodeId = new Map<string, string>();
  const distanceByNodeId = new Map<string, number>();
  const queue: Array<{ nodeId: string; ownerId: string; distance: number }> = [];

  for (const instructionId of instructionTraversalOrder) {
    for (const nodeId of neighboringNonInstructionIdsByNodeId.get(instructionId) ?? []) {
      if (distanceByNodeId.has(nodeId)) {
        continue;
      }

      ownerByNodeId.set(nodeId, instructionId);
      distanceByNodeId.set(nodeId, 1);
      queue.push({ nodeId, ownerId: instructionId, distance: 1 });
    }
  }

  for (let index = 0; index < queue.length; index++) {
    const { nodeId, ownerId, distance } = queue[index];
    for (const neighborNodeId of neighboringNonInstructionIdsByNodeId.get(nodeId) ?? []) {
      if (distanceByNodeId.has(neighborNodeId)) {
        continue;
      }

      ownerByNodeId.set(neighborNodeId, ownerId);
      distanceByNodeId.set(neighborNodeId, distance + 1);
      queue.push({ nodeId: neighborNodeId, ownerId, distance: distance + 1 });
    }
  }

  return ownerByNodeId;
}

function buildNeighboringNonInstructionIdsByNodeId(
  component: LayoutComponent,
  instructionIdSet: Set<string>,
  rootWrapperId?: string,
): Map<string, string[]> {
  const neighboringNonInstructionIdsByNodeId = new Map<string, string[]>();

  const addNeighbor = (nodeId: string, neighborNodeId: string) => {
    const neighbors = neighboringNonInstructionIdsByNodeId.get(nodeId) ?? [];
    if (!neighbors.includes(neighborNodeId)) {
      neighbors.push(neighborNodeId);
      neighboringNonInstructionIdsByNodeId.set(nodeId, neighbors);
    }
  };

  for (const edge of component.edges) {
    const endpointPairs: Array<[string, string]> = [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ];

    for (const [nodeId, neighborNodeId] of endpointPairs) {
      if (nodeId === rootWrapperId || neighborNodeId === rootWrapperId) {
        continue;
      }

      if (instructionIdSet.has(neighborNodeId)) {
        continue;
      }

      if (neighborNodeId === rootWrapperId) {
        continue;
      }

      addNeighbor(nodeId, neighborNodeId);
    }
  }

  return neighboringNonInstructionIdsByNodeId;
}

function buildInstructionTraversalOrder(
  topLevelInstructionIds: string[],
  childInstructionIdsByParentId: Map<string, string[]>,
): string[] {
  const traversalOrder: string[] = [];
  const visitedInstructionIds = new Set<string>();

  const visit = (instructionId: string) => {
    if (visitedInstructionIds.has(instructionId)) {
      return;
    }

    visitedInstructionIds.add(instructionId);
    traversalOrder.push(instructionId);
    for (const childInstructionId of childInstructionIdsByParentId.get(instructionId) ?? []) {
      visit(childInstructionId);
    }
  };

  for (const instructionId of topLevelInstructionIds) {
    visit(instructionId);
  }

  return traversalOrder;
}

function createElkGraph(
  layoutNodes: LayoutNode[],
  sortedNodeIds: string[],
  sortedEdges: FlowEdge[],
  session: NodeEditorSession,
): ElkNode {
  const layoutNodesById = new Map(layoutNodes.map(node => [node.id, node]));
  const referencedInputHandlesByNodeId = buildReferencedHandleIdsByNodeId(
    sortedEdges,
    edge => edge.target,
    edge => edge.targetHandle ?? INPUT_HANDLE_ID,
  );
  const referencedOutputHandlesByNodeId = buildReferencedHandleIdsByNodeId(
    sortedEdges,
    edge => edge.source,
    edge => edge.sourceHandle,
  );

  const children = sortedNodeIds
    .map(nodeId => layoutNodesById.get(nodeId))
    .filter((node): node is LayoutNode => node !== undefined)
    .map(node =>
      createElkLayoutNode(
        node,
        referencedInputHandlesByNodeId.get(node.id) ?? [],
        referencedOutputHandlesByNodeId.get(node.id) ?? [],
      ),
    );

  const layoutEdges = sortedEdges
    .map(edge => createElkLayoutEdge(edge, session))
    .filter((edge): edge is ElkExtendedEdge => edge !== null);

  return {
    id: "root",
    layoutOptions: ELK_GRAPH_LAYOUT_OPTIONS,
    children,
    edges: layoutEdges,
  };
}

function createElkLayoutNode(
  node: LayoutNode,
  referencedInputHandleIds: string[],
  referencedOutputHandleIds: string[],
): ElkNode {
  const inputPins = [
    ...node.flowNode.data.inputPins.map(pin => ({ schemaKey: pin.schemaKey })),
    ...referencedInputHandleIds
      .filter(handleId => !node.flowNode.data.inputPins.some(pin => pin.schemaKey === handleId))
      .map(handleId => ({ schemaKey: handleId })),
  ];
  const outputPins = [
    ...node.flowNode.data.outputPins.map(pin => ({ schemaKey: pin.schemaKey })),
    ...referencedOutputHandleIds
      .filter(handleId => !node.flowNode.data.outputPins.some(pin => pin.schemaKey === handleId))
      .map(handleId => ({ schemaKey: handleId })),
  ];

  return {
    id: node.id,
    width: node.width,
    height: node.height,
    layoutOptions: ELK_NODE_LAYOUT_OPTIONS,
    ports: [
      ...inputPins.map((pin, index) =>
        createElkPort(node.id, "input", pin.schemaKey, index, "WEST"),
      ),
      ...outputPins.map((pin, index) =>
        createElkPort(node.id, "output", pin.schemaKey, index, "EAST"),
      ),
    ],
  };
}

function createElkPort(
  nodeId: string,
  side: "input" | "output",
  schemaKey: string,
  index: number,
  portSide: "WEST" | "EAST",
): ElkPort {
  return {
    id: getPortId(nodeId, side, schemaKey),
    width: PORT_SIZE,
    height: PORT_SIZE,
    layoutOptions: {
      "org.eclipse.elk.port.side": portSide,
      "org.eclipse.elk.port.index": `${index}`,
    },
  };
}

function createElkLayoutEdge(
  edge: FlowEdge,
  session: NodeEditorSession,
): ElkExtendedEdge | null {
  const sourceNode = session.getNodeById(edge.source);
  const targetNode = session.getNodeById(edge.target);
  if (!sourceNode || !targetNode) {
    return null;
  }

  const sourceHandleId =
    resolveSourceHandleId(edge, sourceNode) ??
    sourceNode.data.outputPins[0]?.schemaKey;
  const targetHandleId =
    resolveTargetHandleId(edge, targetNode) ??
    targetNode.data.inputPins[0]?.schemaKey;
  if (!sourceHandleId || !targetHandleId) {
    return null;
  }

  return {
    id: edge.id,
    sources: [getPortId(edge.source, "output", sourceHandleId)],
    targets: [getPortId(edge.target, "input", targetHandleId)],
  };
}

function composeInstructionSubtree(
  localBox: BoxLayout,
  childBoxes: BoxLayout[],
  session: NodeEditorSession,
): BoxLayout {
  if (childBoxes.length === 0) {
    return localBox;
  }

  const parentInstructionNode =
    localBox.anchorNodeId
      ? session.getNodeById(localBox.anchorNodeId)
      : undefined;
  const parentInstructionWidth =
    parentInstructionNode?.measured?.width ??
    parentInstructionNode?.width ??
    0;
  const maxChildPreInstructionWidth = childBoxes.reduce((maxWidth, childBox) => {
    return Math.max(maxWidth, childBox.anchorPosition.x);
  }, 0);
  const desiredChildInstructionX =
    localBox.anchorPosition.x +
    parentInstructionWidth +
    RANK_SEPARATION +
    maxChildPreInstructionWidth;
  const childPlacements = [];
  let previousBottom: number | undefined;

  for (const childBox of childBoxes) {
    const childX = desiredChildInstructionX - childBox.anchorPosition.x;
    const instructionInputHandleId =
      childBox.anchorNodeId
        ? getInstructionInputHandleId(childBox.anchorNodeId, session)
        : undefined;
    const childInstructionBandY =
      (instructionInputHandleId
        ? childBox.anchorInputBandYByHandle.get(instructionInputHandleId)
        : undefined) ?? childBox.anchorPosition.y;
    const y =
      previousBottom === undefined
        ? localBox.anchorPosition.y - childInstructionBandY
        : Math.max(
            localBox.anchorPosition.y - childInstructionBandY,
            previousBottom + INSTRUCTION_GROUP_SEPARATION,
          );
    childPlacements.push({ box: childBox, x: childX, y });
    previousBottom = y + childBox.height;
  }

  return composePlacedBoxes(localBox, childPlacements);
}

function composeRootBox(
  rootBox: BoxLayout,
  childBoxes: BoxLayout[],
): BoxLayout {
  if (childBoxes.length === 0) {
    return rootBox;
  }

  const maxChildPreInstructionWidth = childBoxes.reduce((maxWidth, childBox) => {
    return Math.max(maxWidth, childBox.anchorPosition.x);
  }, 0);
  const desiredChildInstructionX =
    rootBox.anchorPosition.x +
    rootBox.width +
    RANK_SEPARATION +
    maxChildPreInstructionWidth;
  const childPlacements = [];
  let nextY = rootBox.height + INSTRUCTION_GROUP_SEPARATION;
  for (const childBox of childBoxes) {
    childPlacements.push({
      box: childBox,
      x: desiredChildInstructionX - childBox.anchorPosition.x,
      y: nextY,
    });
    nextY += childBox.height + INSTRUCTION_GROUP_SEPARATION;
  }

  return composePlacedBoxes(rootBox, childPlacements);
}

function composeForest(
  topLevelBoxes: BoxLayout[],
): BoxLayout {
  if (topLevelBoxes.length === 0) {
    return createEmptyBox();
  }

  const baseBox = createEmptyBox();
  const childPlacements = [];
  let nextY = 0;
  for (const childBox of topLevelBoxes) {
    childPlacements.push({ box: childBox, x: 0, y: nextY });
    nextY += childBox.height + INSTRUCTION_GROUP_SEPARATION;
  }

  return composePlacedBoxes(baseBox, childPlacements);
}

function composePlacedBoxes(
  localBox: BoxLayout,
  childPlacements: Array<{ box: BoxLayout; x: number; y: number }>,
): BoxLayout {
  const positionsByNodeId = new Map(localBox.positionsByNodeId);
  let minX = 0;
  let minY = 0;
  let maxX = localBox.width;
  let maxY = localBox.height;

  for (const childPlacement of childPlacements) {
    const { box: childBox, x, y } = childPlacement;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + childBox.width);
    maxY = Math.max(maxY, y + childBox.height);

    for (const [nodeId, position] of childBox.positionsByNodeId) {
      positionsByNodeId.set(nodeId, {
        x: position.x + x,
        y: position.y + y,
      });
    }
  }

  if (minX !== 0 || minY !== 0) {
    for (const [nodeId, position] of positionsByNodeId) {
      positionsByNodeId.set(nodeId, {
        x: position.x - minX,
        y: position.y - minY,
      });
    }
  }

  return {
    positionsByNodeId,
    width: maxX - minX,
    height: maxY - minY,
    anchorNodeId: localBox.anchorNodeId,
    anchorPosition: {
      x: localBox.anchorPosition.x - minX,
      y: localBox.anchorPosition.y - minY,
    },
    anchorInputBandYByHandle: new Map(
      [...localBox.anchorInputBandYByHandle.entries()].map(([handleId, y]) => [
        handleId,
        y - minY,
      ]),
    ),
  };
}

function createSingleNodeBox(
  nodeId: string,
  session: NodeEditorSession,
): BoxLayout {
  const node = session.getNodeById(nodeId);
  const width = node?.measured?.width ?? node?.width ?? 0;
  const height = node?.measured?.height ?? node?.height ?? 0;

  return {
    positionsByNodeId: new Map([[nodeId, { x: 0, y: 0 }]]),
    width,
    height,
    anchorNodeId: nodeId,
    anchorPosition: { x: 0, y: 0 },
    anchorInputBandYByHandle: new Map(),
  };
}

function createEmptyBox(): BoxLayout {
  return {
    positionsByNodeId: new Map(),
    width: 0,
    height: 0,
    anchorNodeId: undefined,
    anchorPosition: { x: 0, y: 0 },
    anchorInputBandYByHandle: new Map(),
  };
}

function normalizeBoxLayout(
  nodeIds: string[],
  absolutePositionsByNodeId: Map<string, { x: number; y: number }>,
  session: NodeEditorSession,
  anchorNodeId: string,
  anchorInputBandYByHandle: Map<string, number> = new Map(),
): BoxLayout {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const node = session.getNodeById(nodeId);
    const position = absolutePositionsByNodeId.get(nodeId);
    if (!node || !position) {
      continue;
    }

    const width = node.measured?.width ?? node.width ?? 0;
    const height = node.measured?.height ?? node.height ?? 0;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return createEmptyBox();
  }

  const positionsByNodeId = new Map<string, { x: number; y: number }>();
  for (const [nodeId, position] of absolutePositionsByNodeId) {
    positionsByNodeId.set(nodeId, {
      x: position.x - minX,
      y: position.y - minY,
    });
  }

  const anchorPosition = positionsByNodeId.get(anchorNodeId) ?? { x: 0, y: 0 };
  return {
    positionsByNodeId,
    width: maxX - minX,
    height: maxY - minY,
    anchorNodeId,
    anchorPosition,
    anchorInputBandYByHandle: new Map(
      [...anchorInputBandYByHandle.entries()].map(([handleId, y]) => [
        handleId,
        y - minY,
      ]),
    ),
  };
}

function stabilizeAnchorInputBands(
  boxLayout: BoxLayout,
  anchorNodeId: string,
  edges: FlowEdge[],
  session: NodeEditorSession,
): BoxLayout {
  const anchorNode = session.getNodeById(anchorNodeId);
  if (!anchorNode) {
    return boxLayout;
  }

  const positionsByNodeId = new Map(boxLayout.positionsByNodeId);
  const sortedIncomingEdges = sortLayoutEdges(
    edges.filter(edge => edge.target === anchorNodeId),
    session,
  );
  const incomingEdgesByHandle = new Map<string, FlowEdge[]>();
  for (const edge of sortedIncomingEdges) {
    const handleId = edge.targetHandle ?? INPUT_HANDLE_ID;
    const handleEdges = incomingEdgesByHandle.get(handleId) ?? [];
    handleEdges.push(edge);
    incomingEdgesByHandle.set(handleId, handleEdges);
  }

  const anchorInputBandYByHandle = new Map<string, number>();
  for (const [index, inputPin] of anchorNode.data.inputPins.entries()) {
    const bandY = boxLayout.anchorPosition.y + index * INPUT_BAND_SEPARATION;
    anchorInputBandYByHandle.set(inputPin.schemaKey, bandY);

    let nextY = bandY;
    const handleEdges = incomingEdgesByHandle.get(inputPin.schemaKey) ?? [];
    for (const edge of handleEdges) {
      const sourcePosition = positionsByNodeId.get(edge.source);
      const sourceNode = session.getNodeById(edge.source);
      if (!sourcePosition || !sourceNode) {
        continue;
      }

      positionsByNodeId.set(edge.source, {
        x: sourcePosition.x,
        y: nextY,
      });

      const sourceHeight = sourceNode.measured?.height ?? sourceNode.height ?? 0;
      nextY += sourceHeight + NODE_SEPARATION;
    }
  }

  return normalizeBoxLayout(
    [...positionsByNodeId.keys()],
    positionsByNodeId,
    session,
    anchorNodeId,
    anchorInputBandYByHandle,
  );
}

function anchorBoxLayout(
  boxLayout: BoxLayout,
  anchorNodeId: string,
  session: NodeEditorSession,
): Map<string, { x: number; y: number }> {
  const anchorNode = session.getNodeById(anchorNodeId);
  const anchorBoxPosition = boxLayout.positionsByNodeId.get(anchorNodeId);
  if (!anchorNode || !anchorBoxPosition) {
    return boxLayout.positionsByNodeId;
  }

  const anchorAbsolutePosition = getAbsolutePosition(anchorNode, session);
  const deltaX = anchorAbsolutePosition.x - anchorBoxPosition.x;
  const deltaY = anchorAbsolutePosition.y - anchorBoxPosition.y;

  return new Map(
    [...boxLayout.positionsByNodeId.entries()].map(([nodeId, position]) => [
      nodeId,
      {
        x: position.x + deltaX,
        y: position.y + deltaY,
      },
    ]),
  );
}

function stabilizeIncomingPredecessorOrder(
  graph: ElkNode,
  sortedEdges: FlowEdge[],
): void {
  if (!graph.children) {
    return;
  }

  const layoutNodesById = new Map(
    graph.children
      .filter((node): node is ElkNode & { y: number } => node.y !== undefined)
      .map(node => [node.id, node]),
  );
  const edgesByTargetId = new Map<string, FlowEdge[]>();

  for (const edge of sortedEdges) {
    const targetEdges = edgesByTargetId.get(edge.target) ?? [];
    targetEdges.push(edge);
    edgesByTargetId.set(edge.target, targetEdges);
  }

  for (const edges of edgesByTargetId.values()) {
    if (edges.length < 2) {
      continue;
    }

    const desiredSourceOrder = edges
      .map(edge => edge.source)
      .filter((nodeId, index, sourceIds) => sourceIds.indexOf(nodeId) === index);
    const actualSourceOrder = [...desiredSourceOrder].sort((left, right) => {
      return (layoutNodesById.get(left)?.y ?? Number.MAX_SAFE_INTEGER) -
        (layoutNodesById.get(right)?.y ?? Number.MAX_SAFE_INTEGER);
    });

    if (!desiredSourceOrder.some((nodeId, index) => nodeId !== actualSourceOrder[index])) {
      continue;
    }

    const sortedYPositions = actualSourceOrder
      .map(nodeId => layoutNodesById.get(nodeId)?.y)
      .filter((y): y is number => y !== undefined)
      .sort((left, right) => left - right);

    desiredSourceOrder.forEach((nodeId, index) => {
      const layoutNode = layoutNodesById.get(nodeId);
      const nextY = sortedYPositions[index];
      if (!layoutNode || nextY === undefined) {
        return;
      }

      layoutNode.y = nextY;
    });
  }
}

function stabilizeRootNode(
  graph: ElkNode,
  sortedEdges: FlowEdge[],
  session: NodeEditorSession,
): void {
  const rootNodeId = session.rootNodeId;
  if (!rootNodeId || !graph.children) {
    return;
  }

  const rootLayoutNode = graph.children.find(node => node.id === rootNodeId);
  if (!rootLayoutNode || rootLayoutNode.y === undefined || rootLayoutNode.height === undefined) {
    return;
  }

  const rootOutgoingEdges = sortedEdges.filter(edge => edge.source === rootNodeId);
  if (rootOutgoingEdges.length !== 1) {
    return;
  }

  const childLayoutNode = graph.children.find(node => node.id === rootOutgoingEdges[0].target);
  if (!childLayoutNode || childLayoutNode.y === undefined || childLayoutNode.height === undefined) {
    return;
  }

  const competingPredecessors = sortedEdges
    .filter(edge => edge.target === rootOutgoingEdges[0].target && edge.source !== rootNodeId)
    .map(edge => graph.children!.find(node => node.id === edge.source))
    .flatMap(node =>
      node && node.y !== undefined && node.height !== undefined ? [node] : [],
    );

  if (competingPredecessors.length === 0) {
    rootLayoutNode.y = childLayoutNode.y;
    return;
  }

  const stabilizedY = Math.min(
    ...competingPredecessors.map(node => node.y! - (rootLayoutNode.height! + NODE_SEPARATION)),
  );

  rootLayoutNode.y = Math.min(rootLayoutNode.y, stabilizedY);
}

function sortLayoutNodeIds(
  nodeIds: string[],
  session: NodeEditorSession,
): string[] {
  return [...nodeIds].sort((left, right) => {
    const leftPriority = getLayoutNodePriority(left, session);
    const rightPriority = getLayoutNodePriority(right, session);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftPosition = getAbsoluteNodePosition(left, session);
    const rightPosition = getAbsoluteNodePosition(right, session);
    if (leftPosition.y !== rightPosition.y) {
      return leftPosition.y - rightPosition.y;
    }
    if (leftPosition.x !== rightPosition.x) {
      return leftPosition.x - rightPosition.x;
    }

    return left.localeCompare(right);
  });
}

function sortLayoutEdges(edges: FlowEdge[], session: NodeEditorSession): FlowEdge[] {
  const originalIndexByEdgeId = new Map(edges.map((edge, index) => [edge.id, index]));

  return [...edges].sort((left, right) => {
    const targetComparison =
      compareTargetInputOrder(left, right, session) ||
      compareSharedTargetSiblingOrder(left, right, session);
    if (targetComparison !== 0) {
      return targetComparison;
    }

    const sourceComparison =
      compareSourceOutputOrder(left, right, session) ||
      compareSharedSourceSiblingOrder(left, right, session);
    if (sourceComparison !== 0) {
      return sourceComparison;
    }

    return (
      (originalIndexByEdgeId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (originalIndexByEdgeId.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function compareTargetInputOrder(
  left: FlowEdge,
  right: FlowEdge,
  session: NodeEditorSession,
): number {
  if (left.target !== right.target) {
    return 0;
  }

  return (
    getInputHandleOrder(session, left.target, left.targetHandle) -
    getInputHandleOrder(session, right.target, right.targetHandle)
  );
}

function compareSharedTargetSiblingOrder(
  left: FlowEdge,
  right: FlowEdge,
  session: NodeEditorSession,
): number {
  if (left.target !== right.target || left.targetHandle !== right.targetHandle) {
    return 0;
  }

  return getAbsoluteNodePosition(left.source, session).y - getAbsoluteNodePosition(right.source, session).y;
}

function compareSourceOutputOrder(
  left: FlowEdge,
  right: FlowEdge,
  session: NodeEditorSession,
): number {
  if (left.source !== right.source) {
    return 0;
  }

  return (
    getOutputHandleOrder(session, left.source, left.sourceHandle) -
    getOutputHandleOrder(session, right.source, right.sourceHandle)
  );
}

function compareSharedSourceSiblingOrder(
  left: FlowEdge,
  right: FlowEdge,
  session: NodeEditorSession,
): number {
  if (left.source !== right.source || left.sourceHandle !== right.sourceHandle) {
    return 0;
  }

  return getAbsoluteNodePosition(left.target, session).y - getAbsoluteNodePosition(right.target, session).y;
}

function getConnectedLayoutComponents(
  seedNodeIds: string[],
  session: NodeEditorSession,
): LayoutComponent[] {
  const neighborIdsByNodeId = buildNeighborIdsByNodeId(session);
  const edgesByNodeId = buildEdgesByNodeId(session);
  const visitedNodeIds = new Set<string>();
  const components: LayoutComponent[] = [];

  for (const seedNodeId of seedNodeIds) {
    if (visitedNodeIds.has(seedNodeId)) {
      continue;
    }

    const queue = [seedNodeId];
    const componentNodeIds: string[] = [];
    const componentNodeIdSet = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visitedNodeIds.has(nodeId)) {
        continue;
      }

      visitedNodeIds.add(nodeId);
      componentNodeIds.push(nodeId);
      componentNodeIdSet.add(nodeId);

      for (const neighborId of neighborIdsByNodeId.get(nodeId) ?? []) {
        if (!visitedNodeIds.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    const componentEdges: FlowEdge[] = [];
    const seenEdgeIds = new Set<string>();
    for (const nodeId of componentNodeIds) {
      for (const edge of edgesByNodeId.get(nodeId) ?? []) {
        if (
          componentNodeIdSet.has(edge.source) &&
          componentNodeIdSet.has(edge.target) &&
          !seenEdgeIds.has(edge.id)
        ) {
          seenEdgeIds.add(edge.id);
          componentEdges.push(edge);
        }
      }
    }

    components.push({
      nodeIds: componentNodeIds,
      edges: componentEdges,
      anchorNodeId: seedNodeId,
    });
  }

  return components;
}

function buildNeighborIdsByNodeId(session: NodeEditorSession): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();

  for (const edge of session.edges) {
    if (!isLayoutableNodeId(edge.source, session) || !isLayoutableNodeId(edge.target, session)) {
      continue;
    }

    if (!neighbors.has(edge.source)) {
      neighbors.set(edge.source, new Set());
    }
    if (!neighbors.has(edge.target)) {
      neighbors.set(edge.target, new Set());
    }

    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }

  for (const node of session.nodes) {
    if (!isLayoutableNode(node)) {
      continue;
    }
    if (!neighbors.has(node.id)) {
      neighbors.set(node.id, new Set());
    }
  }

  return neighbors;
}

function buildEdgesByNodeId(session: NodeEditorSession): Map<string, FlowEdge[]> {
  const edgesByNodeId = new Map<string, FlowEdge[]>();

  for (const edge of session.edges) {
    if (!isLayoutableNodeId(edge.source, session) || !isLayoutableNodeId(edge.target, session)) {
      continue;
    }

    if (!edgesByNodeId.has(edge.source)) {
      edgesByNodeId.set(edge.source, []);
    }
    if (!edgesByNodeId.has(edge.target)) {
      edgesByNodeId.set(edge.target, []);
    }

    edgesByNodeId.get(edge.source)!.push(edge);
    edgesByNodeId.get(edge.target)!.push(edge);
  }

  return edgesByNodeId;
}

function buildReferencedHandleIdsByNodeId(
  edges: FlowEdge[],
  getNodeId: (edge: FlowEdge) => string,
  getHandleId: (edge: FlowEdge) => string | undefined,
): Map<string, string[]> {
  const handleIdsByNodeId = new Map<string, string[]>();

  for (const edge of edges) {
    const nodeId = getNodeId(edge);
    const handleId = getHandleId(edge);
    if (!handleId) {
      continue;
    }

    const handleIds = handleIdsByNodeId.get(nodeId) ?? [];
    if (!handleIds.includes(handleId)) {
      handleIds.push(handleId);
      handleIdsByNodeId.set(nodeId, handleIds);
    }
  }

  return handleIdsByNodeId;
}

function toLayoutNode(nodeId: string, session: NodeEditorSession): LayoutNode | null {
  const node = session.getNodeById(nodeId);
  if (!node || !isLayoutableNode(node)) {
    return null;
  }

  const width = node.measured.width ?? node.width;
  const height = node.measured.height ?? node.height;
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }

  return {
    id: nodeId,
    width,
    height,
    flowNode: node,
  };
}

function getPortId(nodeId: string, side: "input" | "output", schemaKey: string): string {
  return `${nodeId}:${side}:${schemaKey}`;
}

function resolveSourceHandleId(edge: FlowEdge, sourceNode: FlowNode): string | undefined {
  if (edge.sourceHandle) {
    return edge.sourceHandle;
  }

  return sourceNode.data.outputPins[0]?.schemaKey;
}

function resolveTargetHandleId(edge: FlowEdge, targetNode: FlowNode): string | undefined {
  const targetHandleId = edge.targetHandle ?? INPUT_HANDLE_ID;
  return targetHandleId || targetNode.data.inputPins[0]?.schemaKey;
}

function getLayoutNodePriority(nodeId: string, session: NodeEditorSession): number {
  return nodeId === session.rootNodeId ? 0 : 1;
}

function getInputHandleOrder(
  session: NodeEditorSession,
  nodeId: string,
  handleId?: string | null,
): number {
  const node = session.getNodeById(nodeId);
  const resolvedHandleId = handleId ?? INPUT_HANDLE_ID;
  const handleOrder = node?.data?.inputPins?.findIndex(pin => pin.schemaKey === resolvedHandleId);
  return handleOrder === undefined || handleOrder < 0
    ? (node?.data?.inputPins?.length ?? 0)
    : handleOrder;
}

function getOutputHandleOrder(
  session: NodeEditorSession,
  nodeId: string,
  handleId?: string | null,
): number {
  const node = session.getNodeById(nodeId);
  const handleOrder = node?.data?.outputPins?.findIndex(pin => pin.schemaKey === handleId);
  return handleOrder === undefined || handleOrder < 0
    ? (node?.data?.outputPins?.length ?? 0)
    : handleOrder;
}

function getInstructionInputHandleId(
  nodeId: string,
  session: NodeEditorSession,
): string | undefined {
  return session
    .getNodeById(nodeId)
    ?.data?.inputPins.find(pin => pin.connectionType === "Instruction")?.schemaKey;
}

function getAbsoluteNodePosition(
  nodeId: string,
  session: NodeEditorSession,
): { x: number; y: number } {
  const node = session.getNodeById(nodeId);
  return node
    ? getAbsolutePosition(node, session)
    : { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
}

function isInstructionHierarchyEdge(edge: FlowEdge, session: NodeEditorSession): boolean {
  const targetNode = session.getNodeById(edge.target);
  if (!targetNode || targetNode.data?.templateId !== INSTRUCTION_TEMPLATE_ID) {
    return false;
  }

  const targetHandleId = edge.targetHandle ?? INPUT_HANDLE_ID;
  const targetInputPin = targetNode.data.inputPins.find(pin => pin.schemaKey === targetHandleId);
  return targetInputPin?.connectionType === "Instruction";
}

function isInstructionNodeId(nodeId: string, session: NodeEditorSession): boolean {
  return session.getNodeById(nodeId)?.data?.templateId === INSTRUCTION_TEMPLATE_ID;
}

function isLayoutableNode(node: FlowNode): boolean {
  return node.type !== "groupnode" && node.type !== "comment";
}

function isLayoutableNodeId(nodeId: string, session: NodeEditorSession): boolean {
  const node = session.getNodeById(nodeId);
  return !!node && isLayoutableNode(node);
}
