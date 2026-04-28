export function formatNodeFieldPlaceholder(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "number") {
    return formatPlaceholderNumber(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(formatNodeFieldPlaceholder).join(", ")}]`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function formatPlaceholderNumber(value: number): string {
  if (value === Number.MAX_VALUE) {
    return "∞";
  }

  if (value === -Number.MAX_VALUE) {
    return "-∞";
  }

  return String(value);
}
