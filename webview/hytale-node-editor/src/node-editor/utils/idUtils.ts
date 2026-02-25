export function createNodeId(templateId: string): string {
  return `${templateId}-${createUuidV4()}`;
}

export function createUuidV4(): string {
  return crypto.randomUUID();
}
