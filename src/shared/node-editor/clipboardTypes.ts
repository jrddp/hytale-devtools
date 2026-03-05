export interface NodeEditorClipboardNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  selected?: boolean;
  width?: number;
  height?: number;
  measured?: {
    width?: number;
    height?: number;
  };
}

export interface NodeEditorClipboardEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  selected?: boolean;
}

export interface NodeEditorClipboardSelection {
  nodes: NodeEditorClipboardNode[];
  edges: NodeEditorClipboardEdge[];
}

export function createEmptyNodeEditorClipboardSelection(): NodeEditorClipboardSelection {
  return {
    nodes: [],
    edges: [],
  };
}
