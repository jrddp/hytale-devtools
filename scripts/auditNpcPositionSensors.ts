import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { NpcDescriptorDocument } from "../src/shared/npc-role-editor/descriptorTypes";
import { NPC_BEHAVIOR_POSITION_SENSOR_DESCRIPTOR_NAMES } from "../src/shared/node-editor/npcBehaviorWorkspaceSemantics";

const rootDir = process.cwd();
const descriptorsPath = path.join(rootDir, "default-data", "export-data", "npc_descriptors.json");
const serverNpcRootPath =
  "/Users/jard/Reference/HytaleServerCode/com/hypixel/hytale/server/npc/corecomponents";

const DIRECT_POSITION_PROVIDER_TOKENS = [
  "PositionProvider",
  "EntityPositionProvider",
  "CachedPositionProvider",
];
const WRAPPED_SENSOR_TOKENS = ["WrappedInfoProvider", "ValueWrappedInfoProvider"];

type SensorAuditResult = {
  directProviderSensors: Set<string>;
  wrappedProviderSensors: Set<string>;
  missingServerSourceSensors: Set<string>;
};

function main(): void {
  if (!existsSync(descriptorsPath)) {
    throw new Error(`Descriptor export not found at ${descriptorsPath}.`);
  }
  if (!existsSync(serverNpcRootPath)) {
    throw new Error(`Server NPC source root not found at ${serverNpcRootPath}.`);
  }

  const descriptorSensorNames = getDescriptorSensorNames();
  const auditResult = auditServerSensorSources(descriptorSensorNames);
  const curatedNames = new Set(NPC_BEHAVIOR_POSITION_SENSOR_DESCRIPTOR_NAMES);

  const candidateNames = new Set<string>([
    ...auditResult.directProviderSensors,
    ...auditResult.wrappedProviderSensors,
  ]);
  const candidateNotCurated = difference(candidateNames, curatedNames);
  const curatedWithoutCandidates = difference(curatedNames, candidateNames);
  const staleCuratedNames = difference(curatedNames, descriptorSensorNames);

  console.log("# NPC Position Sensor Audit");
  console.log("");
  console.log(`Descriptor sensors: ${descriptorSensorNames.size}`);
  console.log(`Curated PositionSensor set: ${curatedNames.size}`);
  console.log("");
  logList(
    "Direct provider candidates",
    sortStrings(auditResult.directProviderSensors),
  );
  logList(
    "Wrapped/preserved provider candidates",
    sortStrings(auditResult.wrappedProviderSensors),
  );
  logList(
    "Candidate sensors missing from curated PositionSensor set",
    sortStrings(candidateNotCurated),
  );
  logList(
    "Curated PositionSensor names without direct/wrapped provider markers",
    sortStrings(curatedWithoutCandidates),
  );
  logList(
    "Curated PositionSensor names missing from descriptor export",
    sortStrings(staleCuratedNames),
  );
  logList(
    "Descriptor sensors with no matching server source file under corecomponents",
    sortStrings(auditResult.missingServerSourceSensors),
  );
}

function getDescriptorSensorNames(): Set<string> {
  const descriptors = JSON.parse(readFileSync(descriptorsPath, "utf8")) as NpcDescriptorDocument;
  return new Set(
    descriptors
      .filter(descriptor => descriptor.Category === "Sensor")
      .map(descriptor => descriptor.Name),
  );
}

function auditServerSensorSources(descriptorSensorNames: Set<string>): SensorAuditResult {
  const directProviderSensors = new Set<string>();
  const wrappedProviderSensors = new Set<string>();
  const foundServerSourceSensors = new Set<string>();

  for (const filePath of walkFiles(serverNpcRootPath)) {
    const fileName = path.basename(filePath);
    const sensorName = parseSensorNameFromFile(fileName);
    if (!sensorName || !descriptorSensorNames.has(sensorName)) {
      continue;
    }

    foundServerSourceSensors.add(sensorName);
    const contents = readFileSync(filePath, "utf8");

    if (DIRECT_POSITION_PROVIDER_TOKENS.some(token => contents.includes(token))) {
      directProviderSensors.add(sensorName);
    }
    if (WRAPPED_SENSOR_TOKENS.some(token => contents.includes(token))) {
      wrappedProviderSensors.add(sensorName);
    }
  }

  return {
    directProviderSensors,
    wrappedProviderSensors,
    missingServerSourceSensors: difference(descriptorSensorNames, foundServerSourceSensors),
  };
}

function walkFiles(directoryPath: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directoryPath)) {
    const entryPath = path.join(directoryPath, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }

    if (stats.isFile() && entryPath.endsWith(".java")) {
      files.push(entryPath);
    }
  }

  return files;
}

function parseSensorNameFromFile(fileName: string): string | null {
  const match = /^Sensor(.+)\.java$/.exec(fileName);
  return match?.[1] ?? null;
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  return new Set([...left].filter(value => !right.has(value)));
}

function sortStrings(values: ReadonlySet<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function logList(title: string, values: readonly string[]): void {
  console.log(`## ${title}`);
  if (values.length === 0) {
    console.log("- none");
    console.log("");
    return;
  }

  for (const value of values) {
    console.log(`- ${value}`);
  }
  console.log("");
}

main();
