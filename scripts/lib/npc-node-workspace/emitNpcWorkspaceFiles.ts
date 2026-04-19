import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NpcWorkspaceBuildArtifacts } from "./npcNodeWorkspaceModel";

export function emitNpcWorkspaceFiles(
  artifacts: NpcWorkspaceBuildArtifacts,
  outputRootPath: string,
): void {
  rmSync(outputRootPath, { recursive: true, force: true });
  mkdirSync(outputRootPath, { recursive: true });
  writeJsonFile(path.join(outputRootPath, "_Workspace.json"), artifacts.workspaceDefinition);

  for (const output of artifacts.templateOutputs) {
    const directoryPath = path.join(outputRootPath, output.directoryName);
    mkdirSync(directoryPath, { recursive: true });
    writeJsonFile(path.join(directoryPath, output.fileName), output.template);
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
