export type AssetEditorWebviewState = {
  documentPath?: string;
  mainScrollTop?: number;
  fieldCollapseByPath?: Record<string, boolean>;
};

export function ensureWebviewStateForDocument(
  state: AssetEditorWebviewState,
  documentPath: string,
): AssetEditorWebviewState {
  if (!documentPath) {
    return state;
  }

  if (state.documentPath && state.documentPath !== documentPath) {
    return { documentPath };
  }

  return state.documentPath === documentPath ? state : { ...state, documentPath };
}

export function updateFieldCollapseByPath(
  fieldCollapseByPath: Readonly<Record<string, boolean>> | undefined,
  fieldPath: string,
  collapsed: boolean,
  defaultCollapsed: boolean,
): Record<string, boolean> | undefined {
  const nextState = { ...(fieldCollapseByPath ?? {}) };
  if (collapsed === defaultCollapsed) {
    delete nextState[fieldPath];
  } else {
    nextState[fieldPath] = collapsed;
  }

  const sortedEntries = Object.entries(nextState).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return sortedEntries.length > 0 ? Object.fromEntries(sortedEntries) : undefined;
}
