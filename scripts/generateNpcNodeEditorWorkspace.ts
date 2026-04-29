import path from "node:path";
import { pathToFileURL } from "node:url";
import { emitNpcWorkspaceFiles } from "./lib/npc-node-workspace/emitNpcWorkspaceFiles";
import { parseNpcDescriptors } from "./lib/npc-node-workspace/loadNpcDescriptors";
import { getNpcNodeWorkspacePaths, type NpcWorkspaceBuildArtifacts } from "./lib/npc-node-workspace/npcNodeWorkspaceModel";
import { buildNpcWorkspaceArtifacts } from "./lib/npc-node-workspace/buildNpcWorkspaceManifest";

export function generateNpcNodeEditorWorkspace(rootDir = process.cwd()): {
  outputRootPath: string;
  artifacts: NpcWorkspaceBuildArtifacts;
} {
  const descriptors = parseNpcDescriptors(rootDir);
  const artifacts = buildNpcWorkspaceArtifacts(descriptors);
  const { outputRootPath } = getNpcNodeWorkspacePaths(rootDir);

  return {
    outputRootPath,
    artifacts,
  };
}

export function main(): void {
  const { outputRootPath, artifacts } = generateNpcNodeEditorWorkspace();
  emitNpcWorkspaceFiles(artifacts, outputRootPath);
  console.log(
    `Generated ${artifacts.templateOutputs.length} NPC node templates in ${path.relative(
      process.cwd(),
      outputRootPath,
    )}.`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main();
}
