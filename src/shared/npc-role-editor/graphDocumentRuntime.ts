import {
  parseAssetDocumentToGraphDocument,
} from "../node-editor/graphDocument";
import type { NodeEditorGraphDocument } from "../node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "../node-editor/workspaceTypes";
import { parseNpcDocumentText, type ParsedNpcRoleDocument } from "./documentParsing";
import { resolveNpcGraphTarget } from "./graphTargets";
import { adaptGraphHostValueToDocumentRoot } from "./graphRootAdapter";

export function parseNpcRoleDocumentOrThrow(text: string): ParsedNpcRoleDocument {
  const result = parseNpcDocumentText(text);
  if (result.status === "error") {
    throw new Error(result.error);
  }

  return {
    document: result.document,
    topLevelKeyOrder: result.topLevelKeyOrder,
  };
}

export function resolveNpcGraphDocumentFromText({
  text,
  fieldPath,
  workspaceContext,
}: {
  text: string | null;
  fieldPath: string;
  workspaceContext: NodeEditorWorkspaceContext;
}): NodeEditorGraphDocument {
  if (typeof text !== "string") {
    throw new Error("The NPC role document text was not available.");
  }

  const parsed = parseNpcRoleDocumentOrThrow(text);
  const target = resolveNpcGraphTarget(parsed.document, fieldPath);
  if (!target) {
    throw new Error(`Graph target "${fieldPath}" could not be resolved.`);
  }

  return parseAssetDocumentToGraphDocument(
    adaptGraphHostValueToDocumentRoot(
      target.value,
      workspaceContext,
      target.preservedData,
    ),
    workspaceContext,
  );
}
