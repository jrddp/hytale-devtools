const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_JSON_PATH = path.join(process.cwd(), "package.json");
const SCHEMA_DIR = path.join(process.cwd(), "default-data", "export-data", "schemas");
const ASSET_EDITOR_VIEW_TYPE = "hytale-devtools.hytaleAssetEditor";

const skippedSchemaFiles = new Set(["InstanceConfig.json", "NPCRole.json", "other.json"]);
const nodeEditorPaths = new Set([
  "ScriptedBrushes",
  "HytaleGenerator/Assignments",
  "HytaleGenerator/Biomes",
  "HytaleGenerator/Density",
  "HytaleGenerator/MaterialMasks",
]);

function buildAssetEditorSelectors() {
  return fs
    .readdirSync(SCHEMA_DIR)
    .filter(fileName => fileName.endsWith(".json") && !skippedSchemaFiles.has(fileName))
    .sort((left, right) => left.localeCompare(right))
    .flatMap(fileName => {
      const schemaPath = path.join(SCHEMA_DIR, fileName);
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
      const assetPath = schema?.hytale?.path;
      const extension = schema?.hytale?.extension;
      if (!assetPath || !extension || nodeEditorPaths.has(assetPath)) {
        return [];
      }

      return [
        {
          filenamePattern: `**/Server/${assetPath}/**/*${extension}`,
        },
      ];
    });
}

function selectorsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  const customEditors = packageJson?.contributes?.customEditors;
  if (!Array.isArray(customEditors)) {
    throw new Error("package.json is missing contributes.customEditors");
  }

  const assetEditorContribution = customEditors.find(
    entry => entry?.viewType === ASSET_EDITOR_VIEW_TYPE,
  );
  if (!assetEditorContribution) {
    throw new Error(`Could not find custom editor contribution for ${ASSET_EDITOR_VIEW_TYPE}`);
  }

  const nextSelectors = buildAssetEditorSelectors();
  if (selectorsEqual(assetEditorContribution.selector, nextSelectors)) {
    console.log("Asset editor selectors already up to date.");
    return;
  }

  assetEditorContribution.selector = nextSelectors;
  fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Updated asset editor selectors in package.json (${nextSelectors.length} entries).`);
}

main();
