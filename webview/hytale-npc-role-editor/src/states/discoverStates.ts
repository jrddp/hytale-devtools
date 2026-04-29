import type { NpcDiscoveredStateInfo } from "@shared/npc-role-editor/stateAutocomplete";

export function discoverNpcStates(root: Record<string, unknown>): NpcDiscoveredStateInfo {
  const roleFullStates = new Set<string>();
  const explicitRoleMainStates = new Set<string>();
  const componentParentAliases = new Set<string>();
  const componentLocalStates = new Set<string>();
  const isComponentDocument = root.Type === "Component";

  scanForStates(root, {
    isComponentDocument,
    roleContextMainState: null,
    roleFullStates,
    explicitRoleMainStates,
    componentParentAliases,
    componentLocalStates,
  });

  const roleMainStates = new Set(explicitRoleMainStates);
  for (const fullState of roleFullStates) {
    const mainState = getMainState(fullState);
    if (mainState) {
      roleMainStates.add(mainState);
    }
  }

  return {
    roleMainStates: sortSet(roleMainStates),
    roleFullStates: sortSet(roleFullStates),
    componentParentAliases: sortSet(componentParentAliases),
    componentLocalStates: sortSet(componentLocalStates),
  };
}

type ScanContext = {
  isComponentDocument: boolean;
  roleContextMainState: string | null;
  roleFullStates: Set<string>;
  explicitRoleMainStates: Set<string>;
  componentParentAliases: Set<string>;
  componentLocalStates: Set<string>;
};

function scanForStates(value: unknown, context: ScanContext): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      scanForStates(item, context);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const nextRoleContextMainState =
    extractRoleSensorMainState(value.Sensor, context.roleContextMainState) ??
    context.roleContextMainState;

  addRoleMainState(context.explicitRoleMainStates, value.StartState);

  if (Array.isArray(value.BusyStates)) {
    for (const state of value.BusyStates) {
      addRoleFullState(context.roleFullStates, state, context.roleContextMainState);
    }
  }

  if (Array.isArray(value._ExportStates)) {
    for (const state of value._ExportStates) {
      addRoleFullState(context.roleFullStates, state, context.roleContextMainState);
    }
  }

  if (context.isComponentDocument && Array.isArray(value._ImportStates)) {
    for (const state of value._ImportStates) {
      addComponentParentAlias(context.componentParentAliases, state);
    }
  }

  if (context.isComponentDocument) {
    addComponentLocalState(context.componentLocalStates, value.DefaultState);
  }

  if (typeof value.State === "string") {
    if (value.Type === "State") {
      if (context.isComponentDocument) {
        addComponentLocalState(context.componentLocalStates, value.State);
      } else {
        addRoleFullState(context.roleFullStates, value.State, nextRoleContextMainState);
      }
    } else if (context.isComponentDocument && value.Type === "ParentState") {
      addComponentParentAlias(context.componentParentAliases, value.State);
    }
  }

  scanStateTransitions(value.StateTransitions, context.explicitRoleMainStates);

  for (const child of Object.values(value)) {
    scanForStates(child, {
      ...context,
      roleContextMainState: nextRoleContextMainState,
    });
  }
}

function scanStateTransitions(value: unknown, mainStates: Set<string>): void {
  if (Array.isArray(value)) {
    for (const transition of value) {
      scanStateTransitions(transition, mainStates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const entries = Array.isArray(value.States)
    ? value.States
    : Array.isArray(value.StateTransitions)
      ? value.StateTransitions
      : null;
  if (!entries) {
    return;
  }

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    if (Array.isArray(entry.From)) {
      for (const state of entry.From) {
        addRoleMainState(mainStates, state);
      }
    }

    if (Array.isArray(entry.To)) {
      for (const state of entry.To) {
        addRoleMainState(mainStates, state);
      }
    }
  }
}

function addRoleMainState(mainStates: Set<string>, value: unknown): void {
  const mainState = getMainStateValue(value);
  if (mainState) {
    mainStates.add(mainState);
  }
}

function addRoleFullState(
  fullStates: Set<string>,
  value: unknown,
  parentMainState: string | null,
): void {
  const fullState = getFullRoleStateValue(value, parentMainState);
  if (fullState) {
    fullStates.add(fullState);
  }
}

function addComponentParentAlias(aliases: Set<string>, value: unknown): void {
  const alias = getComponentParentAliasValue(value);
  if (alias) {
    aliases.add(alias);
  }
}

function addComponentLocalState(states: Set<string>, value: unknown): void {
  const state = getComponentLocalStateValue(value);
  if (state) {
    states.add(state);
  }
}

function extractRoleSensorMainState(
  value: unknown,
  parentMainState: string | null,
): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.Type === "State" && typeof value.State === "string") {
    return getMainStateValue(value.State) ?? parentMainState;
  }

  if (Array.isArray(value.Sensors)) {
    for (const sensor of value.Sensors) {
      const mainState = extractRoleSensorMainState(sensor, parentMainState);
      if (mainState) {
        return mainState;
      }
    }
  }

  return extractRoleSensorMainState(value.Sensor, parentMainState);
}

function getFullRoleStateValue(
  value: unknown,
  parentMainState: string | null,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(".")) {
    const subState = trimmed.slice(1).trim();
    if (!subState || !parentMainState) {
      return null;
    }
    return `${parentMainState}.${subState}`;
  }

  return trimmed;
}

function getComponentParentAliasValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
  const [mainState] = normalized.split(".", 1);
  return mainState || null;
}

function getComponentLocalStateValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(".")) {
    return trimmed;
  }

  if (!trimmed.includes(".")) {
    return `.${trimmed}`;
  }

  const [, subState] = trimmed.split(".", 2);
  return subState ? `.${subState}` : null;
}

function getMainStateValue(value: unknown): string | null {
  const fullState = getFullRoleStateValue(value, null);
  return getMainState(fullState);
}

function getMainState(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [mainState] = value.split(".", 1);
  return mainState || null;
}

function sortSet(values: Set<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
