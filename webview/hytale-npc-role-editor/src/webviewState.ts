import type { NpcPropertyField, NpcPropertySection, NpcSectionId } from "./propertyModel";

export type GraphViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type NpcRoleEditorActivePage =
  | { kind: "main" }
  | { kind: "graph"; sectionId: NpcSectionId };

export type NpcRoleEditorWebviewState = {
  documentPath?: string;
  graphViewports?: Partial<Record<NpcSectionId, GraphViewport>>;
  activePage?: NpcRoleEditorActivePage;
  mainScrollTop?: number;
  collapsedFieldPaths?: string[];
};

export function ensureWebviewStateForDocument(
  state: NpcRoleEditorWebviewState,
  documentPath: string,
): NpcRoleEditorWebviewState {
  if (!documentPath) {
    return state;
  }

  if (state.documentPath && state.documentPath !== documentPath) {
    return { documentPath };
  }

  return state.documentPath === documentPath ? state : { ...state, documentPath };
}

export function resolveRestoredActivePage(
  state: NpcRoleEditorWebviewState,
  graphSectionIds: Iterable<string>,
): NpcRoleEditorActivePage {
  const graphSections = new Set(graphSectionIds);
  const activePage = state.activePage;
  if (activePage?.kind === "graph" && graphSections.has(activePage.sectionId)) {
    return activePage;
  }

  return { kind: "main" };
}

export function updateCollapsedFieldPaths(
  collapsedFieldPaths: readonly string[] | undefined,
  fieldPath: string,
  collapsed: boolean,
): string[] | undefined {
  const nextPaths = new Set(collapsedFieldPaths ?? []);
  if (collapsed) {
    nextPaths.add(fieldPath);
  } else {
    nextPaths.delete(fieldPath);
  }

  const sortedPaths = [...nextPaths].sort((left, right) => left.localeCompare(right));
  return sortedPaths.length > 0 ? sortedPaths : undefined;
}

export function applyCollapsedFieldPathsToSections(
  sections: NpcPropertySection[],
  collapsedFieldPaths: readonly string[] | undefined,
): void {
  const collapsedPathSet = new Set(collapsedFieldPaths ?? []);
  for (const section of sections) {
    for (const field of section.fields) {
      applyCollapsedFieldPathsToField(field, collapsedPathSet);
    }
  }
}

function applyCollapsedFieldPathsToField(
  field: NpcPropertyField,
  collapsedPathSet: Set<string>,
): void {
  const collapsed = collapsedPathSet.has(field.fieldPath);
  if (field.ui?.collapsed !== collapsed) {
    field.ui = {
      ...(field.ui ?? {}),
      collapsed,
    };
  }

  for (const childField of field.childFields ?? []) {
    applyCollapsedFieldPathsToField(childField, collapsedPathSet);
  }
}
