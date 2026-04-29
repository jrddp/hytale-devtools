import type {
  NodeConnectionType,
  NodeConnectionTypeDefinition,
} from "./workspaceTypes";

export function resolveConnectionTypes(
  definitions: Record<string, NodeConnectionTypeDefinition> | undefined,
  onCycle?: (connectionPath: string[]) => void,
): Record<string, NodeConnectionType> {
  const resolvedConnectionTypes: Record<string, NodeConnectionType> = {};

  const collectAncestors = (
    connectionTypeId: string,
    stack: string[] = [],
  ): string[] => {
    if (stack.includes(connectionTypeId)) {
      onCycle?.([...stack, connectionTypeId]);
      return [];
    }

    const definition = definitions?.[connectionTypeId];
    const directParents = Array.isArray(definition?.Extends)
      ? definition.Extends.filter((parent): parent is string => typeof parent === "string")
      : [];
    const ancestors = new Set<string>();

    for (const parent of directParents) {
      ancestors.add(parent);
      for (const ancestor of collectAncestors(parent, [...stack, connectionTypeId])) {
        ancestors.add(ancestor);
      }
    }

    return [...ancestors];
  };

  for (const [connectionTypeId, definition] of Object.entries(definitions ?? {})) {
    const directParents = Array.isArray(definition?.Extends)
      ? definition.Extends.filter((parent): parent is string => typeof parent === "string")
      : [];
    resolvedConnectionTypes[connectionTypeId] = {
      extends: directParents,
      ancestors: collectAncestors(connectionTypeId),
    };
  }

  return resolvedConnectionTypes;
}

