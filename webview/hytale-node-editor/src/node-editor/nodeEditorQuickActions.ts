export const NODE_EDITOR_QUICK_ACTION_IDS = Object.freeze({
	GO_TO_ROOT: 'go-to-root',
	FIT_FULL_VIEW: 'fit-full-view',
	SEARCH_NODES: 'search-nodes',
	AUTO_POSITION_NODES: 'auto-position-nodes',
	VIEW_RAW_JSON: 'view-raw-json',
	HELP_AND_HOTKEYS: 'help-and-hotkeys'
});

export type NodeEditorQuickActionId =
	(typeof NODE_EDITOR_QUICK_ACTION_IDS)[keyof typeof NODE_EDITOR_QUICK_ACTION_IDS];

export type NodeEditorQuickActionDefinition = Readonly<{
	id: NodeEditorQuickActionId;
	eventName: string;
	commandId: string;
	name: string;
	keybindingSourceCommandId?: string;
	defaultKeybinding?: Readonly<{
		win: string;
		linux: string;
		mac: string;
	}>;
}>;

export const NODE_EDITOR_QUICK_ACTIONS: readonly NodeEditorQuickActionDefinition[] = Object.freeze([
	{
		id: NODE_EDITOR_QUICK_ACTION_IDS.GO_TO_ROOT,
		eventName: 'gotoroot',
		commandId: 'hytale-devtools.nodeEditor.quickAction.goToRoot',
		name: 'Go to root'
	},
	{
		id: NODE_EDITOR_QUICK_ACTION_IDS.FIT_FULL_VIEW,
		eventName: 'fitfullview',
		commandId: 'hytale-devtools.nodeEditor.quickAction.fitFullView',
		name: 'Fit full view'
	},
	{
		id: NODE_EDITOR_QUICK_ACTION_IDS.SEARCH_NODES,
		eventName: 'searchnodes',
		commandId: 'editor.action.webvieweditor.showFind',
		name: 'Search nodes',
		keybindingSourceCommandId: 'editor.action.webvieweditor.showFind'
	},
	{
		id: NODE_EDITOR_QUICK_ACTION_IDS.AUTO_POSITION_NODES,
		eventName: 'autopositionnodes',
		commandId: 'hytale-devtools.nodeEditor.quickAction.autoPositionNodes',
		name: 'Auto position nodes'
	},
	{
		id: NODE_EDITOR_QUICK_ACTION_IDS.VIEW_RAW_JSON,
		eventName: 'viewrawjson',
		commandId: 'hytale-devtools.nodeEditor.quickAction.viewRawJson',
		name: 'View raw json'
	},
	{
		id: NODE_EDITOR_QUICK_ACTION_IDS.HELP_AND_HOTKEYS,
		eventName: 'helphotkeys',
		commandId: 'hytale-devtools.nodeEditor.quickAction.helpAndHotkeys',
		name: 'Help and hotkeys'
	}
]);

const QUICK_ACTION_BY_ID = new Map(
	NODE_EDITOR_QUICK_ACTIONS.map((quickAction) => [quickAction.id, quickAction])
);
const QUICK_ACTION_BY_EVENT_NAME = new Map(
	NODE_EDITOR_QUICK_ACTIONS.map((quickAction) => [quickAction.eventName, quickAction])
);
const QUICK_ACTION_BY_COMMAND_ID = new Map(
	NODE_EDITOR_QUICK_ACTIONS.map((quickAction) => [quickAction.commandId, quickAction])
);

export function getNodeEditorQuickActionById(
	actionId: string | undefined
): NodeEditorQuickActionDefinition | undefined {
	return actionId ? QUICK_ACTION_BY_ID.get(actionId as NodeEditorQuickActionId) : undefined;
}

export function getNodeEditorQuickActionByEventName(
	eventName: string | undefined
): NodeEditorQuickActionDefinition | undefined {
	return eventName ? QUICK_ACTION_BY_EVENT_NAME.get(eventName) : undefined;
}

export function getNodeEditorQuickActionByCommandId(
	commandId: string | undefined
): NodeEditorQuickActionDefinition | undefined {
	return commandId ? QUICK_ACTION_BY_COMMAND_ID.get(commandId) : undefined;
}
