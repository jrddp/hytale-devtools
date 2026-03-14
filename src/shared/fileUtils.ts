import { readFileSync } from "fs";
import path from "path";

export function safeParseJSONFile(filePath: string) {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(stripBom(content));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function firstGlobMatch(checkedPath: string, patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    if (path.matchesGlob(checkedPath, pattern)) {
      return pattern;
    }
  }
  return undefined;
}
