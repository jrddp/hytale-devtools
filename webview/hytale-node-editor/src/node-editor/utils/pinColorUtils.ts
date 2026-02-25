const DEFAULT_PIN_COLOR = '#808080';

export function getDefaultPinColor() {
  return DEFAULT_PIN_COLOR;
}

export function readPinColor(candidate: unknown) {
  if (typeof candidate === 'string') {
    return candidate;
  }

  if (Number.isFinite(candidate)) {
    const packed = Math.floor(candidate as number);
    return `#${packed.toString(16).padStart(6, '0')}`;
  }

  if (Array.isArray(candidate) && candidate.length >= 3) {
    const [r, g, b, a] = candidate;
    if (typeof a === 'number') {
      return `rgb(${Number(r)} ${Number(g)} ${Number(b)} / ${a})`;
    }

    return `rgb(${Number(r)} ${Number(g)} ${Number(b)})`;
  }

  if (candidate && typeof candidate === 'object') {
    const color = candidate as Record<string, unknown>;
    if (
      typeof color.r === 'number' &&
      typeof color.g === 'number' &&
      typeof color.b === 'number'
    ) {
      if (typeof color.a === 'number') {
        return `rgb(${color.r} ${color.g} ${color.b} / ${color.a})`;
      }

      return `rgb(${color.r} ${color.g} ${color.b})`;
    }
  }

  return undefined;
}
