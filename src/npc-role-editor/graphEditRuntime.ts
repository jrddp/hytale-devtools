import type { HytaleNpcRoleDocument } from "./hytaleNpcRoleDocument";
import {
  parseAssetDocumentToGraphDocument,
  serializeGraphDocument,
} from "../shared/node-editor/graphDocument";
import { applyNodeEditorGraphEdit } from "../shared/node-editor/graphEditUtils";
import type { NodeEditorGraphEdit } from "../shared/node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "../shared/node-editor/workspaceTypes";
import { serializeNpcDocumentText } from "../shared/npc-role-editor/documentParsing";
import { patchNpcGraphTarget, resolveNpcGraphTarget, type NpcGraphTargetWorkspaceRoot } from "../shared/npc-role-editor/graphTargets";
import { parseNpcRoleDocumentOrThrow } from "../shared/npc-role-editor/graphDocumentRuntime";
import {
  adaptGraphDocumentRootToHostValue,
  adaptGraphHostValueToDocumentRoot,
} from "../shared/npc-role-editor/graphRootAdapter";

export function applyNpcGraphEditToDocument(
  document: HytaleNpcRoleDocument,
  {
    fieldPath,
    edit,
    resolveWorkspaceContext,
  }: {
    fieldPath: string;
    edit: NodeEditorGraphEdit;
    resolveWorkspaceContext: (
      workspaceRoot: NpcGraphTargetWorkspaceRoot,
    ) => NodeEditorWorkspaceContext | null;
  },
): {
  workspaceRoot: NpcGraphTargetWorkspaceRoot;
} {
  const parsed = document.getParsedDocument(text => parseNpcRoleDocumentOrThrow(text));
  const target = resolveNpcGraphTarget(parsed.document, fieldPath);
  if (!target) {
    throw new Error(`Graph target "${fieldPath}" could not be resolved from the NPC role.`);
  }

  const workspaceContext = resolveWorkspaceContext(target.workspaceRoot);
  if (!workspaceContext) {
    throw new Error(
      `NPC Behavior workspace root "${target.workspaceRoot}" could not be resolved.`,
    );
  }

  const cachedGraphDocument = document.getCachedGraphDocument(fieldPath);
  const graphDocument =
    cachedGraphDocument?.workspaceRoot === target.workspaceRoot
      ? cachedGraphDocument.graphDocument
      : parseAssetDocumentToGraphDocument(
          adaptGraphHostValueToDocumentRoot(target.value, workspaceContext, target.preservedData),
          workspaceContext,
        );

  applyNodeEditorGraphEdit(graphDocument, edit);
  document.setCachedGraphDocument(fieldPath, {
    workspaceRoot: target.workspaceRoot,
    graphDocument,
  });

  const patchedWorkspaceRoot = patchNpcGraphTarget(
    parsed.document,
    fieldPath,
    adaptGraphDocumentRootToHostValue(
      serializeGraphDocument(graphDocument),
      workspaceContext,
    ),
  );
  if (!patchedWorkspaceRoot) {
    throw new Error(`Graph target "${fieldPath}" could not be patched back into the NPC role.`);
  }

  document.commitParsedDocument({
    text: normalizeDocumentTextEol(
      serializeNpcDocumentText(parsed.document, parsed.topLevelKeyOrder),
      document.eol,
    ),
    parsedDocument: parsed.document,
    topLevelKeyOrder: parsed.topLevelKeyOrder,
  });

  return {
    workspaceRoot: target.workspaceRoot,
  };
}

function normalizeDocumentTextEol(text: string, eol: number): string {
  const targetEol = eol === 2 ? "\r\n" : "\n";
  return text.replace(/\r\n|\r|\n/g, targetEol);
}
