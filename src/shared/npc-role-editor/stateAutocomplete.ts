export type NpcStateAutocompleteKind =
  | "role-main"
  | "role-full"
  | "component-parent-alias"
  | "component-local";

export type NpcDiscoveredStateInfo = {
  roleMainStates: string[];
  roleFullStates: string[];
  componentParentAliases: string[];
  componentLocalStates: string[];
};

export function createEmptyNpcDiscoveredStateInfo(): NpcDiscoveredStateInfo {
  return {
    roleMainStates: [],
    roleFullStates: [],
    componentParentAliases: [],
    componentLocalStates: [],
  };
}

export function getNpcStateAutocompleteValues(
  discoveredStateInfo: NpcDiscoveredStateInfo,
  kind: NpcStateAutocompleteKind | undefined,
): string[] {
  switch (kind) {
    case "role-main":
      return discoveredStateInfo.roleMainStates;
    case "role-full":
      return discoveredStateInfo.roleFullStates;
    case "component-parent-alias":
      return discoveredStateInfo.componentParentAliases;
    case "component-local":
      return discoveredStateInfo.componentLocalStates;
    default:
      return [];
  }
}
