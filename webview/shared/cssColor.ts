type ParsedRgbaColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

const RGB_FUNCTION_PATTERN =
  /^rgba?\(\s*(?<red>\d{1,3})\s*,\s*(?<green>\d{1,3})\s*,\s*(?<blue>\d{1,3})(?:\s*,\s*(?<alpha>\d*\.?\d+))?\s*\)$/i;
const SHORT_HEX_PATTERN = /^#(?<value>[\da-f]{3}|[\da-f]{4})$/i;
const LONG_HEX_PATTERN = /^#(?<value>[\da-f]{6}|[\da-f]{8})$/i;

export type NormalizedCssColor = {
  hex: string;
  hexWithAlpha: string;
  isOpaque: boolean;
};

export function normalizeCssColor(value: string): NormalizedCssColor | null {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue === "transparent") {
    return {
      hex: "#000000",
      hexWithAlpha: "#00000000",
      isOpaque: false,
    };
  }

  const shortHexMatch = normalizedValue.match(SHORT_HEX_PATTERN)?.groups?.value;
  if (shortHexMatch) {
    const expandedHex = expandShortHex(shortHexMatch);
    const parsedHex = parseHexColor(expandedHex);
    return parsedHex ? toNormalizedCssColor(parsedHex) : null;
  }

  const longHexMatch = normalizedValue.match(LONG_HEX_PATTERN)?.groups?.value;
  if (longHexMatch) {
    const parsedHex = parseHexColor(longHexMatch);
    return parsedHex ? toNormalizedCssColor(parsedHex) : null;
  }

  const parsedRgb = parseRgbColor(normalizedValue);
  return parsedRgb ? toNormalizedCssColor(parsedRgb) : null;
}

function parseHexColor(value: string): ParsedRgbaColor | null {
  if (value.length !== 6 && value.length !== 8) {
    return null;
  }

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const alpha =
    value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1;

  return {
    red,
    green,
    blue,
    alpha,
  };
}

function parseRgbColor(value: string): ParsedRgbaColor | null {
  const match = value.match(RGB_FUNCTION_PATTERN)?.groups;
  if (!match) {
    return null;
  }

  const red = clampChannel(Number.parseInt(match.red, 10));
  const green = clampChannel(Number.parseInt(match.green, 10));
  const blue = clampChannel(Number.parseInt(match.blue, 10));
  const alpha = clampAlpha(match.alpha === undefined ? 1 : Number.parseFloat(match.alpha));

  return {
    red,
    green,
    blue,
    alpha,
  };
}

function toNormalizedCssColor(color: ParsedRgbaColor): NormalizedCssColor {
  return {
    hex: `#${toHexChannel(color.red)}${toHexChannel(color.green)}${toHexChannel(color.blue)}`,
    hexWithAlpha: `#${toHexChannel(color.red)}${toHexChannel(color.green)}${toHexChannel(color.blue)}${toHexChannel(Math.round(color.alpha * 255))}`,
    isOpaque: color.alpha >= 1,
  };
}

function expandShortHex(value: string): string {
  return value
    .split("")
    .map(channel => `${channel}${channel}`)
    .join("");
}

function toHexChannel(value: number): string {
  return clampChannel(value).toString(16).padStart(2, "0");
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Number.isFinite(value) ? Math.round(value) : 0));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}
