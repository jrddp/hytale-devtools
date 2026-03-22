const DEFAULT_COLOR = "#808080";
// cached to avoid recalculating every frame for the low detail canvas
const resolvedCssColorCache = new Map<string, string>();

const COLOR_NAME_MAP = {
  aqua: "#0f8b8d",
  black: "#000000",
  blue: "#2f4f9d",
  darkpink: "#8f3f69",
  gray: "#6f7c87",
  green: "#4f8a5f",
  grey: "#6f7c87",
  lightblue: "#5e7ea6",
  lightpurple: "#8774aa",
  magenta: "#8d5f9f",
  olive: "#808000",
  orange: "#b5773b",
  pink: "#ad6f91",
  purple: "#6f5aa5",
  red: "#b35353",
  white: "#ffffff",
  yellow: "#b79a3b",
};

/**
 * Converts an workspace definition colors (including named colors) to CSS color strings
 */
export function asCssColor(nodeDefinedColor?: string) {
  if (!nodeDefinedColor) return DEFAULT_COLOR;
  if (nodeDefinedColor.startsWith("#") || nodeDefinedColor.startsWith("var")) {
    return nodeDefinedColor;
  }
  nodeDefinedColor = nodeDefinedColor.toLowerCase();
  if (COLOR_NAME_MAP[nodeDefinedColor]) return COLOR_NAME_MAP[nodeDefinedColor];
  const [r, g, b] = nodeDefinedColor.split(",");
  if (r && g && b) return `rgb(${r}, ${g}, ${b})`;

  console.error(`Could not read node color: ${nodeDefinedColor}`);
  return DEFAULT_COLOR;
}

function readThemeVariable(variableName: string) {
  const bodyResolved = getComputedStyle(document.body).getPropertyValue(variableName);
  const rootResolved = getComputedStyle(document.documentElement).getPropertyValue(variableName);
  return bodyResolved || rootResolved;
}

/**
 * Resolves and caches CSS color with support for var(...)
 */
export function resolveComputedColor(color: string) {
  const cached = resolvedCssColorCache.get(color);
  if (cached) {
    return cached;
  }

  let resolved = color;
  if (color.startsWith("var(")) {
    const variableName = color.slice(4, -1);
    const themeValue = readThemeVariable(variableName);
    resolved = themeValue.startsWith("var(")
      ? resolveComputedColor(themeValue)
      : themeValue || color;
  }

  resolvedCssColorCache.set(color, resolved);
  return resolved;
}
