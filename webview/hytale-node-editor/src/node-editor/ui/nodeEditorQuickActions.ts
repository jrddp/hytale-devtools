export type NodeEditorQuickActionId =
	| 'go-to-root'
	| 'fit-full-view'
	| 'search-nodes'
	| 'auto-position-nodes'
	| 'view-raw-json'
	| 'help-and-hotkeys';

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
		id: 'go-to-root',
		eventName: 'gotoroot',
		commandId: 'hytale-devtools.nodeEditor.quickAction.goToRoot',
		name: 'Go to root'
	},
	{
		id: 'fit-full-view',
		eventName: 'fitfullview',
		commandId: 'hytale-devtools.nodeEditor.quickAction.fitFullView',
		name: 'Fit full view',
		defaultKeybinding: {
			win: 'V',
			linux: 'V',
			mac: 'V'
		}
	},
	{
		id: 'search-nodes',
		eventName: 'searchnodes',
		commandId: 'hytale-devtools.nodeEditor.quickAction.searchNodes',
		name: 'Search nodes',
		keybindingSourceCommandId: 'editor.action.webvieweditor.showFind',
		defaultKeybinding: {
			win: 'F',
			linux: 'F',
			mac: 'F'
		}
	},
	{
		id: 'auto-position-nodes',
		eventName: 'autopositionnodes',
		commandId: 'hytale-devtools.nodeEditor.quickAction.autoPositionNodes',
		name: 'Auto position nodes',
		defaultKeybinding: {
			win: 'L',
			linux: 'L',
			mac: 'L'
		}
	},
	{
		id: 'view-raw-json',
		eventName: 'viewrawjson',
		commandId: 'hytale-devtools.nodeEditor.quickAction.viewRawJson',
		name: 'View raw json'
	},
	{
		id: 'help-and-hotkeys',
		eventName: 'helphotkeys',
		commandId: 'hytale-devtools.nodeEditor.quickAction.helpAndHotkeys',
		name: 'Show help',
		defaultKeybinding: {
			win: '?',
			linux: '?',
			mac: '?'
		}
	}
]);

const QUICK_ACTION_BY_ID = new Map<NodeEditorQuickActionId, NodeEditorQuickActionDefinition>(
	NODE_EDITOR_QUICK_ACTIONS.map((quickAction) => [quickAction.id, quickAction])
);
const QUICK_ACTION_BY_EVENT_NAME = new Map<string, NodeEditorQuickActionDefinition>(
	NODE_EDITOR_QUICK_ACTIONS.map((quickAction) => [quickAction.eventName, quickAction])
);
const QUICK_ACTION_BY_COMMAND_ID = new Map<string, NodeEditorQuickActionDefinition>();
for (const quickAction of NODE_EDITOR_QUICK_ACTIONS) {
	QUICK_ACTION_BY_COMMAND_ID.set(quickAction.commandId, quickAction);
	const aliasCommandId = quickAction.keybindingSourceCommandId;
	if (aliasCommandId) {
		QUICK_ACTION_BY_COMMAND_ID.set(aliasCommandId, quickAction);
	}
}

export function getNodeEditorQuickActionById(
	actionId: NodeEditorQuickActionId | undefined
): NodeEditorQuickActionDefinition | undefined {
	return actionId ? QUICK_ACTION_BY_ID.get(actionId) : undefined;
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
