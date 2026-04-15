import type { GraphRootAdaptationResult } from "../node-editor/workspaceTypes";
import type { NpcRoleJson } from "./documentTypes";

export type NpcGraphTargetWorkspaceRoot = "Instructions" | "Instruction" | "Sensor";

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
    case "Content": {
      if (document.Type !== "Component") {
        return null;
      }

      if (document.Class !== "Instruction" && document.Class !== "Sensor") {
        return null;
      }

      return {
        fieldPath,
        workspaceRoot: document.Class,
        value: structuredClone(document.Content ?? {}),
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
    case "Content":
      if (document.Type !== "Component") {
        return null;
      }
      if (document.Class !== "Instruction" && document.Class !== "Sensor") {
        return null;
      }
      document.Content = structuredClone(next.value ?? {});
      return document.Class;
    default:
      return null;
  }
}
