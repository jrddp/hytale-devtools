import { Position, getBezierPath } from "@xyflow/system";
import type { BBox } from "rbush";

const DEFAULT_BEZIER_CURVATURE = 0.25;
const DEFAULT_EDGE_SAMPLE_SEGMENTS = 16;

type EdgeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EdgePoint = {
  x: number;
  y: number;
};

type EdgeSegment = BBox & {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type LayoutedBezierEdge = {
  id: string;
  hidden?: boolean;
  selectable?: boolean;
  selected?: boolean;
  animated?: boolean;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition?: Position;
  targetPosition?: Position;
};

export type IndexedBezierEdgeGeometry = BBox & {
  id: string;
  hidden?: boolean;
  selectable?: boolean;
  selected: boolean;
  animated: boolean;
  path: string;
  segments: EdgeSegment[];
};

function calculateControlOffset(distance: number, curvature: number) {
  if (distance >= 0) {
    return 0.5 * distance;
  }

  return curvature * 25 * Math.sqrt(-distance);
}

function getBezierControlPoint({
  pos,
  x1,
  y1,
  x2,
  y2,
  curvature,
}: {
  pos: Position;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  curvature: number;
}): EdgePoint {
  switch (pos) {
    case Position.Left:
      return { x: x1 - calculateControlOffset(x1 - x2, curvature), y: y1 };
    case Position.Right:
      return { x: x1 + calculateControlOffset(x2 - x1, curvature), y: y1 };
    case Position.Top:
      return { x: x1, y: y1 - calculateControlOffset(y1 - y2, curvature) };
    case Position.Bottom:
      return { x: x1, y: y1 + calculateControlOffset(y2 - y1, curvature) };
  }
}

function sampleBezierPoint(
  point0: EdgePoint,
  point1: EdgePoint,
  point2: EdgePoint,
  point3: EdgePoint,
  t: number,
): EdgePoint {
  const inverseT = 1 - t;
  const inverseTSquared = inverseT * inverseT;
  const inverseTCubed = inverseTSquared * inverseT;
  const tSquared = t * t;
  const tCubed = tSquared * t;

  return {
    x:
      inverseTCubed * point0.x +
      3 * inverseTSquared * t * point1.x +
      3 * inverseT * tSquared * point2.x +
      tCubed * point3.x,
    y:
      inverseTCubed * point0.y +
      3 * inverseTSquared * t * point1.y +
      3 * inverseT * tSquared * point2.y +
      tCubed * point3.y,
  };
}

function segmentIntersectsRect(segment: EdgeSegment, rect: BBox) {
  if (
    segment.maxX < rect.minX ||
    segment.minX > rect.maxX ||
    segment.maxY < rect.minY ||
    segment.minY > rect.maxY
  ) {
    return false;
  }

  let entryTime = 0;
  let exitTime = 1;
  const deltaX = segment.x2 - segment.x1;
  const deltaY = segment.y2 - segment.y1;
  const clips: Array<[number, number]> = [
    [-deltaX, segment.x1 - rect.minX],
    [deltaX, rect.maxX - segment.x1],
    [-deltaY, segment.y1 - rect.minY],
    [deltaY, rect.maxY - segment.y1],
  ];

  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) {
        return false;
      }
      continue;
    }

    const ratio = q / p;
    if (p < 0) {
      if (ratio > exitTime) {
        return false;
      }
      if (ratio > entryTime) {
        entryTime = ratio;
      }
    } else {
      if (ratio < entryTime) {
        return false;
      }
      if (ratio < exitTime) {
        exitTime = ratio;
      }
    }
  }

  return entryTime <= exitTime;
}

export function createEdgeSelectionBounds(rect: EdgeRect): BBox {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };
}

export function buildIndexedBezierEdgeGeometry(
  edge: LayoutedBezierEdge,
): IndexedBezierEdgeGeometry {
  const sourcePosition = edge.sourcePosition ?? Position.Bottom;
  const targetPosition = edge.targetPosition ?? Position.Top;
  const sourcePoint = { x: edge.sourceX, y: edge.sourceY };
  const targetPoint = { x: edge.targetX, y: edge.targetY };
  const sourceControlPoint = getBezierControlPoint({
    pos: sourcePosition,
    x1: edge.sourceX,
    y1: edge.sourceY,
    x2: edge.targetX,
    y2: edge.targetY,
    curvature: DEFAULT_BEZIER_CURVATURE,
  });
  const targetControlPoint = getBezierControlPoint({
    pos: targetPosition,
    x1: edge.targetX,
    y1: edge.targetY,
    x2: edge.sourceX,
    y2: edge.sourceY,
    curvature: DEFAULT_BEZIER_CURVATURE,
  });

  const points = [sourcePoint];
  for (let index = 1; index < DEFAULT_EDGE_SAMPLE_SEGMENTS; index++) {
    points.push(
      sampleBezierPoint(
        sourcePoint,
        sourceControlPoint,
        targetControlPoint,
        targetPoint,
        index / DEFAULT_EDGE_SAMPLE_SEGMENTS,
      ),
    );
  }
  points.push(targetPoint);

  const segments: EdgeSegment[] = [];
  for (let index = 1; index < points.length; index++) {
    const previousPoint = points[index - 1];
    const nextPoint = points[index];
    segments.push({
      x1: previousPoint.x,
      y1: previousPoint.y,
      x2: nextPoint.x,
      y2: nextPoint.y,
      minX: Math.min(previousPoint.x, nextPoint.x),
      minY: Math.min(previousPoint.y, nextPoint.y),
      maxX: Math.max(previousPoint.x, nextPoint.x),
      maxY: Math.max(previousPoint.y, nextPoint.y),
    });
  }

  return {
    id: edge.id,
    hidden: edge.hidden,
    selectable: edge.selectable,
    selected: !!edge.selected,
    animated: !!edge.animated,
    path: getBezierPath(edge)[0],
    minX: Math.min(sourcePoint.x, targetPoint.x, sourceControlPoint.x, targetControlPoint.x),
    minY: Math.min(sourcePoint.y, targetPoint.y, sourceControlPoint.y, targetControlPoint.y),
    maxX: Math.max(sourcePoint.x, targetPoint.x, sourceControlPoint.x, targetControlPoint.x),
    maxY: Math.max(sourcePoint.y, targetPoint.y, sourceControlPoint.y, targetControlPoint.y),
    segments,
  };
}

export function edgeGeometryIntersectsRect(edge: IndexedBezierEdgeGeometry, rect: BBox) {
  if (
    edge.maxX < rect.minX ||
    edge.minX > rect.maxX ||
    edge.maxY < rect.minY ||
    edge.minY > rect.maxY
  ) {
    return false;
  }

  return edge.segments.some(segment => segmentIntersectsRect(segment, rect));
}
