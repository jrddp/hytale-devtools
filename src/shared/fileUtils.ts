import { readFileSync } from "fs";

export function safeParseJSONFile(filePath: string) {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(stripBom(content));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
