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

const FIELD_GRAPH_METADATA_KEY = "$NodeEditorGraphMetadata";

export type ResolvedNpcGraphTarget = {
  fieldPath: string;
  workspaceRoot: NpcGraphTargetWorkspaceRoot;
  value: unknown;
  preservedData?: Record<string, unknown>;
};

function cloneRootMetadata(document: NpcRoleJson): Record<string, unknown> | undefined {
  const preservedEntries = Object.entries(document)
    .filter(([key]) => key.startsWith("$"))
    .filter(([key]) => key !== FIELD_GRAPH_METADATA_KEY)
    .map(([key, value]) => [key, structuredClone(value)]);
  return preservedEntries.length > 0 ? Object.fromEntries(preservedEntries) : undefined;
}

function patchRootMetadata(
  document: NpcRoleJson,
  preservedData?: Record<string, unknown>,
): void {
  for (const key of Object.keys(document)) {
    if (key.startsWith("$") && key !== FIELD_GRAPH_METADATA_KEY) {
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

function cloneFieldGraphMetadata(
  document: NpcRoleJson,
  fieldPath: string,
): Record<string, unknown> | undefined {
  const metadataByFieldPath = document[FIELD_GRAPH_METADATA_KEY];
  if (
    typeof metadataByFieldPath !== "object" ||
    metadataByFieldPath === null ||
    Array.isArray(metadataByFieldPath)
  ) {
    return undefined;
  }

  const metadata = (metadataByFieldPath as Record<string, unknown>)[fieldPath];
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }

  return structuredClone(metadata) as Record<string, unknown>;
}

function shouldStoreGraphMetadataAsFieldSidecar(
  fieldPath: string,
  workspaceRoot: NpcGraphTargetWorkspaceRoot,
): boolean {
  return fieldPath === "StateTransitions" || (fieldPath === "Content" && workspaceRoot === "ActionList");
}

function patchFieldGraphMetadata(
  document: NpcRoleJson,
  fieldPath: string,
  preservedData?: Record<string, unknown>,
): void {
  const currentMetadata =
    typeof document[FIELD_GRAPH_METADATA_KEY] === "object" &&
    document[FIELD_GRAPH_METADATA_KEY] !== null &&
    !Array.isArray(document[FIELD_GRAPH_METADATA_KEY])
      ? structuredClone(document[FIELD_GRAPH_METADATA_KEY] as Record<string, unknown>)
      : {};

  if (preservedData) {
    currentMetadata[fieldPath] = structuredClone(preservedData);
  } else {
    delete currentMetadata[fieldPath];
  }

  if (Object.keys(currentMetadata).length === 0) {
    delete document[FIELD_GRAPH_METADATA_KEY];
    return;
  }

  document[FIELD_GRAPH_METADATA_KEY] = currentMetadata;
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
        preservedData: cloneFieldGraphMetadata(document, fieldPath),
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
        preservedData: shouldStoreGraphMetadataAsFieldSidecar(fieldPath, workspaceRoot)
          ? cloneFieldGraphMetadata(document, fieldPath)
          : undefined,
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
      patchFieldGraphMetadata(document, fieldPath, next.preservedData);
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
      patchFieldGraphMetadata(
        document,
        fieldPath,
        shouldStoreGraphMetadataAsFieldSidecar(fieldPath, workspaceRoot)
          ? next.preservedData
          : undefined,
      );
      document.Content = structuredClone(
        next.value ?? getNpcGraphRootDefaultValue(workspaceRoot),
      );
      return workspaceRoot;
    default:
      return null;
  }
}
