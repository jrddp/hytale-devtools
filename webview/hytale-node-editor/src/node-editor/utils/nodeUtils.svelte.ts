import { type XYPosition } from "@xyflow/svelte";
import { type BBox } from "rbush";
import { type FlowNode, GROUP_NODE_TYPE, type GroupNodeType } from "src/common";
import { workspace } from "src/workspace.svelte";

export function recalculateGroupParents() {
  if (!workspace.getRootNode()?.measured) {
    console.error("recalculateGroupParents called before measurements loaded.");
    return;
  }
  let groupNodes: GroupNodeType[] = [];
  // kept separately so that groups are guaranteed to be first in order (parents must be before children in workspace.nodes array)
  let nonGroupNodes: FlowNode[] = [];
  workspace.nodes.forEach(node => {
    if (node.type === GROUP_NODE_TYPE) {
      groupNodes.push(node);
    } else {
      nonGroupNodes.push(node);
    }
  });

  // sort by size ascending (process smaller groups first for accurate parent tree)
  groupNodes.sort((a, b) => {
    return a.width * a.height - b.width * b.height;
  });

  const parentRemappings = new Map<string, string>();
  const processedGroupIds = new Set<string>();

  for (const parentGroup of groupNodes) {
    for (const child of workspace.searchNodesCollidingWith(getAbsoluteBoundingBox(parentGroup))) {
      if (child.id === parentGroup.id) continue; // ignore collision with self
      if (parentRemappings.has(child.id)) continue; // already processed
      // we can't guarentee sizing order when searching the spatial index, so we'll only parent groups that are smaller than their parent
      if (child.type === GROUP_NODE_TYPE && !processedGroupIds.has(child.id)) continue;
      parentRemappings.set(child.id, parentGroup.id);
    }
    processedGroupIds.add(parentGroup.id);
  }

  groupNodes = groupNodes.map(group => {
    const parentId = parentRemappings.get(group.id);
    return {
      ...group,
      parentId,
      position: getPositionRelativeTo(
        group,
        parentId ? workspace.getNodeById(parentId) : undefined,
      ),
    };
  });
  // note: it's important that we retain the original order of nonGroupNodes, otherwise it will cause Z-flickering
  nonGroupNodes = nonGroupNodes.map(node => {
    const parentId = parentRemappings.get(node.id);
    return {
      ...node,
      parentId,
      position: getPositionRelativeTo(node, parentId ? workspace.getNodeById(parentId) : undefined),
    };
  });

  // should now save with largest groups first, since they can parent smaller groups
  groupNodes = groupNodes.reverse();
  workspace.nodes = [...groupNodes, ...nonGroupNodes];
}

export function getAbsolutePosition(node: FlowNode): XYPosition {
  if (!node.parentId) return node.position;
  const { x: parentX, y: parentY } = getAbsolutePosition(workspace.getNodeById(node.parentId));
  return { x: parentX + node.position.x, y: parentY + node.position.y };
}

export function getPositionRelativeTo(nodeA: FlowNode, nodeB?: FlowNode): XYPosition {
  if (!nodeB) return getAbsolutePosition(nodeA);
  const { x: xA, y: yA } = getAbsolutePosition(nodeA);
  const { x: xB, y: yB } = getAbsolutePosition(nodeB);
  return { x: xA - xB, y: yA - yB };
}

export function getAbsoluteBoundingBox(node: FlowNode): BBox {
  const { x, y } = getAbsolutePosition(node);
  const { width, height } = node.measured;
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}
