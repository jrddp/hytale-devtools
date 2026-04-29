const ROOT_TITLE_PREFIX = "[ROOT]";

export function hasRootTitlePrefix(title: string): boolean {
  return title.trimStart().startsWith(ROOT_TITLE_PREFIX);
}

export function shouldShowRootTitlePrefix(title: string, isRootNode: boolean): boolean {
  return isRootNode && !hasRootTitlePrefix(title);
}

export function formatRootNodeTitleText(title: string, isRootNode: boolean): string {
  return shouldShowRootTitlePrefix(title, isRootNode) ? `${ROOT_TITLE_PREFIX} ${title}` : title;
}
