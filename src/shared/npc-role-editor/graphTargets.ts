import type { GraphRootAdaptationResult } from "../node-editor/workspaceTypes";
import type { NpcComponentClass, NpcRoleJson } from "./documentTypes";

export type NpcGraphTargetWorkspaceRoot =
  | "Action"
  | "ActionList"
  | "BodyMotion"
  | "HeadMotion"
  | "Instruction"
  | "Instructions"
  | "Path"
  | "Sensor"
  | "StateTransitions";

export const NPC_BEHAVIOR_GRAPH_WORKSPACE_ROOTS = [
  "Action",
  "ActionList",
  "BodyMotion",
  "HeadMotion",
  "Instruction",
  "Instructions",
  "Path",
  "Sensor",
  "StateTransitions",
] as const satisfies readonly NpcGraphTargetWorkspaceRoot[];

const NPC_COMPONENT_CONTENT_GRAPH_ROOTS: Partial<
  Record<NpcComponentClass, NpcGraphTargetWorkspaceRoot>
> = {
  Action: "Action",
  ActionList: "ActionList",
  BodyMotion: "BodyMotion",
  HeadMotion: "HeadMotion",
  Instruction: "Instruction",
  Path: "Path",
  Sensor: "Sensor",
};

export type ResolvedNpcGraphTarget = {
  fieldPath: string;
  workspaceRoot: NpcGraphTargetWorkspaceRoot;
  value: unknown;
  preservedData?: Record<string, unknown>;
};

function cloneRootMetadata(document: NpcRoleJson): Record<string, unknown> | undefined {
  const preservedEntries = Object.entries(document)
    .filter(([key]) => key.startsWith("$"))
    .map(([key, value]) => [key, structuredClone(value)]);
  return preservedEntries.length > 0 ? Object.fromEntries(preservedEntries) : undefined;
}

function patchRootMetadata(
  document: NpcRoleJson,
  preservedData?: Record<string, unknown>,
): void {
  for (const key of Object.keys(document)) {
    if (key.startsWith("$")) {
      delete document[key];
    }
  }

  if (!preservedData) {
    return;
  }

  for (const [key, value] of Object.entries(preservedData)) {
    if (key.startsWith("$")) {
      document[key] = structuredClone(value);
    }
  }
}

export function resolveNpcComponentContentGraphRoot(
  componentClass: string | undefined,
): NpcGraphTargetWorkspaceRoot | null {
  if (!componentClass) {
    return null;
  }

  return NPC_COMPONENT_CONTENT_GRAPH_ROOTS[componentClass as NpcComponentClass] ?? null;
}

export function getNpcGraphRootDefaultValue(
  workspaceRoot: NpcGraphTargetWorkspaceRoot,
): unknown {
  return workspaceRoot === "ActionList" ||
    workspaceRoot === "Instructions" ||
    workspaceRoot === "StateTransitions"
    ? []
    : {};
}

export function resolveNpcGraphTarget(
  document: NpcRoleJson,
  fieldPath: string,
): ResolvedNpcGraphTarget | null {
  switch (fieldPath) {
    case "Instructions":
      return {
        fieldPath,
        workspaceRoot: "Instructions",
        value: structuredClone(document.Instructions ?? []),
        preservedData: cloneRootMetadata(document),
      };
    case "InteractionInstruction":
      return {
        fieldPath,
        workspaceRoot: "Instruction",
        value: structuredClone(document.InteractionInstruction ?? {}),
      };
    case "DeathInstruction":
      return {
        fieldPath,
        workspaceRoot: "Instruction",
        value: structuredClone(document.DeathInstruction ?? {}),
      };
    case "StateTransitions":
      return {
        fieldPath,
        workspaceRoot: "StateTransitions",
        value: structuredClone(document.StateTransitions ?? []),
      };
    case "Content": {
      if (document.Type !== "Component") {
        return null;
      }

      const workspaceRoot = resolveNpcComponentContentGraphRoot(document.Class);
      if (!workspaceRoot) {
        return null;
      }

      return {
        fieldPath,
        workspaceRoot,
        value: structuredClone(
          document.Content ?? getNpcGraphRootDefaultValue(workspaceRoot),
        ),
      };
    }
    default:
      return null;
  }
}

export function patchNpcGraphTarget(
  document: NpcRoleJson,
  fieldPath: string,
  next: GraphRootAdaptationResult,
): NpcGraphTargetWorkspaceRoot | null {
  switch (fieldPath) {
    case "Instructions":
      patchRootMetadata(document, next.preservedData);
      document.Instructions = structuredClone(next.value ?? []);
      return "Instructions";
    case "InteractionInstruction":
      document.InteractionInstruction = structuredClone(next.value ?? {});
      return "Instruction";
    case "DeathInstruction":
      document.DeathInstruction = structuredClone(next.value ?? {});
      return "Instruction";
    case "StateTransitions":
      document.StateTransitions = structuredClone(next.value ?? []);
      return "StateTransitions";
    case "Content":
      if (document.Type !== "Component") {
        return null;
      }
      const workspaceRoot = resolveNpcComponentContentGraphRoot(document.Class);
      if (!workspaceRoot) {
        return null;
      }
      document.Content = structuredClone(
        next.value ?? getNpcGraphRootDefaultValue(workspaceRoot),
      );
      return workspaceRoot;
    default:
      return null;
  }
}
