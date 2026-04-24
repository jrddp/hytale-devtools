import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const NPC_BASE_GAME_ASSETS_DIR_ENV = "NPC_BASE_GAME_ASSETS_DIR";
const BASE_GAME_ASSETS_DIR_ENV = "BASE_GAME_ASSETS_DIR";
const DEFAULT_BASE_GAME_ASSETS_DIR =
  "/Users/jard/Code/vscode-extensions/hytale-devtools/Reference/BaseGameAssets";

loadDotEnv(path.resolve(process.cwd(), ".env"));

export function resolveNpcFixturePath(relativePath: string): string {
  const baseGameAssetsDir =
    process.env[NPC_BASE_GAME_ASSETS_DIR_ENV] ??
    process.env[BASE_GAME_ASSETS_DIR_ENV] ??
    DEFAULT_BASE_GAME_ASSETS_DIR;

  return path.join(baseGameAssetsDir, relativePath);
}

export function readFixtureText(relativePath: string): string {
  return readFileSync(resolveNpcFixturePath(relativePath), "utf8");
}

export function resolveTestDataPath(relativePath: string): string {
  return path.resolve(process.cwd(), "test/test-data", relativePath);
}

export function readTestDataText(relativePath: string): string {
  return readFileSync(resolveTestDataPath(relativePath), "utf8");
}

export function parseJsonText(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeJson(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, childValue]) => [key, canonicalizeJson(childValue)]),
    );
  }

  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

function loadDotEnv(envPath: string): void {
  if (!existsSync(envPath)) {
    return;
  }

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (process.env[key]) {
      continue;
    }

    const value = line.slice(equalsIndex + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}
