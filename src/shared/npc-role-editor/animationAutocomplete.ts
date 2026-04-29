export type NpcAnimationAutocompleteKind = "appearance-model";

export function getNpcAnimationAutocompleteValues(
  appearanceAnimationIds: string[],
  kind: NpcAnimationAutocompleteKind | undefined,
): string[] {
  if (kind !== "appearance-model") {
    return [];
  }

  return appearanceAnimationIds;
}
