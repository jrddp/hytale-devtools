import { getContext, setContext } from "svelte";

type FieldPanelStateContext = {
  onCollapseChange?: (fieldPath: string, collapsed: boolean) => void;
};

const FIELD_PANEL_STATE_CONTEXT = Symbol("npc-field-panel-state");

export function setFieldPanelStateContext(context: FieldPanelStateContext): void {
  setContext(FIELD_PANEL_STATE_CONTEXT, context);
}

export function getFieldPanelStateContext(): FieldPanelStateContext {
  return getContext<FieldPanelStateContext>(FIELD_PANEL_STATE_CONTEXT) ?? {};
}
