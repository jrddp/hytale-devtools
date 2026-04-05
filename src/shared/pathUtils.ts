import path from "path";

export function toPosixPath(inputPath: string): string {
  return inputPath.replaceAll("\\", "/");
}

export function normalizePosixPath(inputPath: string): string {
  return path.posix.normalize(toPosixPath(inputPath));
}
