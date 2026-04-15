export function cloneJsonLike<T>(value: T): T {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneJsonLike(item)) as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, cloneJsonLike(childValue)]),
    ) as T;
  }

  return value;
}
