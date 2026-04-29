export type NodeEditorDiagnosticSeverity = "error" | "warning";

export type NodeEditorDiagnosticTarget =
  | { type: "graph" }
  | { type: "node"; nodeId: string }
  | { type: "field"; nodeId: string; schemaKey: string; parentSchemaKey?: string }
  | { type: "listItem"; nodeId: string; schemaKey: string; itemIndex: number; parentSchemaKey?: string }
  | { type: "mapEntry"; nodeId: string; schemaKey: string; key: string; parentSchemaKey?: string }
  | { type: "pin"; nodeId: string; pinId: string; direction?: "input" | "output" }
  | { type: "connection"; edgeId: string };

export type NodeEditorDiagnostic = {
  severity: NodeEditorDiagnosticSeverity;
  code: string;
  message: string;
  source: string;
  target: NodeEditorDiagnosticTarget;
  graphFieldPath?: string;
};

export function getNodeEditorDiagnosticTargetKey(target: NodeEditorDiagnosticTarget): string {
  switch (target.type) {
    case "graph":
      return "graph";
    case "node":
      return `node:${target.nodeId}`;
    case "field":
      return `field:${target.nodeId}:${target.parentSchemaKey ?? ""}:${target.schemaKey}`;
    case "listItem":
      return `listItem:${target.nodeId}:${target.parentSchemaKey ?? ""}:${target.schemaKey}:${target.itemIndex}`;
    case "mapEntry":
      return `mapEntry:${target.nodeId}:${target.parentSchemaKey ?? ""}:${target.schemaKey}:${target.key}`;
    case "pin":
      return `pin:${target.nodeId}:${target.direction ?? ""}:${target.pinId}`;
    case "connection":
      return `connection:${target.edgeId}`;
  }
}

export function getHighestNodeEditorDiagnosticSeverity(
  diagnostics: readonly NodeEditorDiagnostic[],
): NodeEditorDiagnosticSeverity | undefined {
  return diagnostics.some(diagnostic => diagnostic.severity === "error")
    ? "error"
    : diagnostics.some(diagnostic => diagnostic.severity === "warning")
      ? "warning"
      : undefined;
}

export function formatNodeEditorDiagnosticsTooltip(
  diagnostics: readonly NodeEditorDiagnostic[],
): string | undefined {
  if (diagnostics.length === 0) {
    return undefined;
  }

  return diagnostics
    .map(diagnostic => `${diagnostic.severity === "error" ? "Error" : "Warning"}: ${diagnostic.message}`)
    .join("\n");
}

export function isLowSignalNodeBorderDiagnostic(diagnostic: NodeEditorDiagnostic): boolean {
  return diagnostic.code === "unused-parameter";
}

export function nodeEditorDiagnosticTargetBelongsToNode(
  target: NodeEditorDiagnosticTarget,
  nodeId: string,
  connectionNodeIds?: (edgeId: string) => { source: string; target: string } | undefined,
): boolean {
  switch (target.type) {
    case "graph":
      return false;
    case "node":
    case "field":
    case "listItem":
    case "mapEntry":
    case "pin":
      return target.nodeId === nodeId;
    case "connection": {
      const edgeNodeIds = connectionNodeIds?.(target.edgeId);
      return edgeNodeIds?.source === nodeId || edgeNodeIds?.target === nodeId;
    }
  }
}

export function getNodeEditorDiagnosticBorderSeverity(
  diagnostics: readonly NodeEditorDiagnostic[],
): NodeEditorDiagnosticSeverity | undefined {
  if (diagnostics.some(diagnostic => diagnostic.severity === "error")) {
    return "error";
  }

  return diagnostics.some(
    diagnostic => diagnostic.severity === "warning" && !isLowSignalNodeBorderDiagnostic(diagnostic),
  )
    ? "warning"
    : undefined;
}
