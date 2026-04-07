export function discoverNpcMainStates(root: Record<string, unknown>): string[] {
  const states = new Set<string>();
  scanForMainStates(root, states, null);
  return [...states].sort((left, right) => left.localeCompare(right));
}

function scanForMainStates(
  value: unknown,
  states: Set<string>,
  parentMainState: string | null,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      scanForMainStates(item, states, parentMainState);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  addMainState(states, value.StartState, parentMainState);

  if (Array.isArray(value.BusyStates)) {
    for (const state of value.BusyStates) {
      addMainState(states, state, parentMainState);
    }
  }

  if (Array.isArray(value._ImportStates)) {
    for (const state of value._ImportStates) {
      addMainState(states, state, parentMainState);
    }
  }

  if (Array.isArray(value._ExportStates)) {
    for (const state of value._ExportStates) {
      addMainState(states, state, parentMainState);
    }
  }

  if (
    (value.Type === "State" || value.Type === "ParentState") &&
    typeof value.State === "string"
  ) {
    addMainState(states, value.State, parentMainState);
  }

  if (isRecord(value.StateTransitions) && Array.isArray(value.StateTransitions.States)) {
    for (const entry of value.StateTransitions.States) {
      if (!isRecord(entry)) {
        continue;
      }

      if (Array.isArray(entry.From)) {
        for (const state of entry.From) {
          addMainState(states, state, parentMainState);
        }
      }

      if (Array.isArray(entry.To)) {
        for (const state of entry.To) {
          addMainState(states, state, parentMainState);
        }
      }
    }
  }

  const nextInstructionParentState = extractSensorMainState(value.Sensor) ?? parentMainState;

  for (const [key, child] of Object.entries(value)) {
    if (key === "Instructions") {
      scanForMainStates(child, states, nextInstructionParentState);
      continue;
    }

    scanForMainStates(child, states, parentMainState);
  }
}

function addMainState(
  states: Set<string>,
  value: unknown,
  parentMainState: string | null,
) {
  if (typeof value !== "string") {
    return;
  }

  const mainState = toMainState(value, parentMainState);
  if (mainState) {
    states.add(mainState);
  }
}

function extractSensorMainState(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.Type === "State" && typeof value.State === "string" && !value.State.startsWith(".")) {
    return toMainState(value.State, null);
  }

  if (Array.isArray(value.Sensors)) {
    for (const sensor of value.Sensors) {
      const mainState = extractSensorMainState(sensor);
      if (mainState) {
        return mainState;
      }
    }
  }

  return extractSensorMainState(value.Sensor);
}

function toMainState(value: string, parentMainState: string | null): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(".")) {
    return parentMainState;
  }

  const [mainState] = trimmed.split(".", 1);
  return mainState || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
