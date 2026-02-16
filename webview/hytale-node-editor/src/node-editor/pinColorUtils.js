const DEFAULT_PIN_COLOR = '#808080';

const PIN_COLOR_NAME_MAP = Object.freeze({
  aqua: '#0f8b8d',
  black: '#000000',
  blue: '#2f4f9d',
  darkpink: '#8f3f69',
  gray: '#6f7c87',
  green: '#4f8a5f',
  grey: '#6f7c87',
  lightblue: '#5e7ea6',
  lightpurple: '#8774aa',
  magenta: '#8d5f9f',
  olive: '#808000',
  orange: '#b5773b',
  pink: '#ad6f91',
  purple: '#6f5aa5',
  red: '#b35353',
  white: '#ffffff',
  yellow: '#b79a3b',
});

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_FUNCTION_PATTERN = /^rgba?\(\s*[\d.%\s,/-]+\)$/i;
const HSLA_FUNCTION_PATTERN = /^hsla?\(\s*[\d.%\s,/-]+\)$/i;
const CSS_VAR_PATTERN = /^var\(\s*--[a-zA-Z0-9-_]+\s*(?:,\s*[a-zA-Z0-9#(),.%\s-]+)?\)$/;

export function getDefaultPinColor() {
  return DEFAULT_PIN_COLOR;
}

export function normalizePinColor(candidate) {
  if (Array.isArray(candidate)) {
    return normalizeArrayColor(candidate);
  }

  if (isObject(candidate)) {
    return normalizeObjectColor(candidate);
  }

  if (Number.isFinite(candidate)) {
    return normalizePackedColorNumber(candidate);
  }

  if (typeof candidate !== 'string') {
    return undefined;
  }

  const trimmedColor = candidate.trim();
  if (!trimmedColor) {
    return undefined;
  }

  const normalizedNameKey = normalizeColorNameKey(trimmedColor);
  if (PIN_COLOR_NAME_MAP[normalizedNameKey]) {
    return PIN_COLOR_NAME_MAP[normalizedNameKey];
  }

  if (HEX_COLOR_PATTERN.test(trimmedColor)) {
    return trimmedColor;
  }

  if (RGBA_FUNCTION_PATTERN.test(trimmedColor) || HSLA_FUNCTION_PATTERN.test(trimmedColor)) {
    return trimmedColor;
  }

  if (CSS_VAR_PATTERN.test(trimmedColor)) {
    return trimmedColor;
  }

  const commaSeparatedColor = normalizeCommaSeparatedColor(trimmedColor);
  if (commaSeparatedColor) {
    return commaSeparatedColor;
  }

  const parsedNumericColor = Number(trimmedColor);
  if (Number.isFinite(parsedNumericColor)) {
    return normalizePackedColorNumber(parsedNumericColor);
  }

  return undefined;
}

function normalizeArrayColor(candidate) {
  if (candidate.length < 3) {
    return undefined;
  }

  const [red, green, blue, alpha] = candidate;
  return normalizeRgbValues(red, green, blue, alpha);
}

function normalizeObjectColor(candidate) {
  const red = readNumericComponent(candidate, ['r', 'R', 'red', 'Red']);
  const green = readNumericComponent(candidate, ['g', 'G', 'green', 'Green']);
  const blue = readNumericComponent(candidate, ['b', 'B', 'blue', 'Blue']);
  const alpha = readNumericComponent(candidate, ['a', 'A', 'alpha', 'Alpha']);

  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) {
    return undefined;
  }

  return normalizeRgbValues(red, green, blue, alpha);
}

function readNumericComponent(candidate, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
      continue;
    }

    const numericValue = Number(candidate[key]);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return undefined;
}

function normalizeCommaSeparatedColor(candidate) {
  if (!candidate.includes(',')) {
    return undefined;
  }

  const parts = candidate.split(',').map((entry) => entry.trim());
  if (parts.length !== 3 && parts.length !== 4) {
    return undefined;
  }

  const numericParts = parts.map((entry) => Number(entry));
  if (numericParts.some((entry) => !Number.isFinite(entry))) {
    return undefined;
  }

  const [red, green, blue, alpha] = numericParts;
  return normalizeRgbValues(red, green, blue, alpha);
}

function normalizeRgbValues(red, green, blue, alpha) {
  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) {
    return undefined;
  }

  const shouldScaleUnitRgb =
    Math.max(red, green, blue) <= 1 && Math.min(red, green, blue) >= 0;

  const scaledRed = shouldScaleUnitRgb ? red * 255 : red;
  const scaledGreen = shouldScaleUnitRgb ? green * 255 : green;
  const scaledBlue = shouldScaleUnitRgb ? blue * 255 : blue;

  const clampedRed = clampColorByte(scaledRed);
  const clampedGreen = clampColorByte(scaledGreen);
  const clampedBlue = clampColorByte(scaledBlue);

  if (!Number.isFinite(alpha)) {
    return `rgb(${clampedRed} ${clampedGreen} ${clampedBlue})`;
  }

  const normalizedAlpha = normalizeAlpha(alpha);
  return `rgb(${clampedRed} ${clampedGreen} ${clampedBlue} / ${normalizedAlpha})`;
}

function clampColorByte(value) {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(255, Math.round(normalizedValue)));
}

function normalizeAlpha(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  const alphaInUnitRange = value > 1 ? value / 255 : value;
  const clampedAlpha = Math.max(0, Math.min(1, alphaInUnitRange));
  return Number(clampedAlpha.toFixed(3));
}

function normalizePackedColorNumber(candidate) {
  if (!Number.isFinite(candidate)) {
    return undefined;
  }

  const integerCandidate = Math.floor(candidate);
  if (integerCandidate < 0 || integerCandidate > 0xffffff) {
    return undefined;
  }

  return `#${integerCandidate.toString(16).padStart(6, '0')}`;
}

function normalizeColorNameKey(candidate) {
  return candidate.toLowerCase().replace(/[\s_-]+/g, '');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
