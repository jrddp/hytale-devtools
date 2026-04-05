import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { type Readable } from "node:stream";
import type { Entry as YauzlEntry, ZipFile as YauzlZipFile } from "yauzl";

const ASSETS_ZIP_PATH_ENV = "ASSETS_ZIP_PATH";
const BASE_GAME_ASSETS_DIR_ENV = "BASE_GAME_ASSETS_DIR";

loadDotEnv(path.resolve(process.cwd(), ".env"));

type CliOptions = {
  clean: boolean;
  help: boolean;
  positionals: string[];
};

type ExtractionSummary = {
  extractedFileCount: number;
  extractedByteCount: number;
  skippedSymlinkCount: number;
};

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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    clean: false,
    help: false,
    positionals: [],
  };

  for (const arg of argv) {
    if (arg === "--clean") {
      options.clean = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    options.positionals.push(arg);
  }

  return options;
}

function printHelp(): void {
  console.log(
    [
      "Extract Hytale Assets.zip into the directory used by the base-game round-trip tests.",
      "",
      "Usage:",
      "  bun run scripts/extract-base-game-assets.ts [assets-zip-path] [output-dir] [--clean]",
      "",
      "Resolution order:",
      `  assets-zip-path: first CLI arg, then ${ASSETS_ZIP_PATH_ENV}, then default Hytale install search`,
      `  output-dir:      second CLI arg, then ${BASE_GAME_ASSETS_DIR_ENV}`,
      "",
      "Options:",
      "  --clean   Remove the output directory before extracting.",
    ].join("\n"),
  );
}

function getDefaultHytaleHomeSearchPaths(
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir(),
): string[] {
  if (platform === "win32") {
    return [path.join(homeDir, "AppData", "Roaming", "Hytale")];
  }

  if (platform === "darwin") {
    return [path.join(homeDir, "Library", "Application Support", "Hytale")];
  }

  return [
    path.join(homeDir, ".local", "share", "Hytale"),
    path.join(homeDir, ".var", "app", "com.hypixel.HytaleLauncher", "data", "Hytale"),
  ];
}

function getDefaultAssetsZipSearchPaths(): string[] {
  return getDefaultHytaleHomeSearchPaths().flatMap(hytaleHome => [
    path.join(hytaleHome, "install", "release", "package", "game", "latest", "Assets.zip"),
    path.join(hytaleHome, "install", "pre-release", "package", "game", "latest", "Assets.zip"),
  ]);
}

function resolveAssetsZipPath(cliValue: string | undefined): string | undefined {
  if (cliValue) {
    return path.resolve(cliValue);
  }

  const envValue = process.env[ASSETS_ZIP_PATH_ENV]?.trim();
  if (envValue) {
    return path.resolve(envValue);
  }

  return getDefaultAssetsZipSearchPaths().find(candidate => existsSync(candidate));
}

function resolveOutputDir(cliValue: string | undefined): string | undefined {
  if (cliValue) {
    return path.resolve(cliValue);
  }

  const envValue = process.env[BASE_GAME_ASSETS_DIR_ENV]?.trim();
  return envValue ? path.resolve(envValue) : undefined;
}

function assertSafeDirectoryToDelete(targetDir: string): void {
  const parsed = path.parse(targetDir);
  if (targetDir === parsed.root) {
    throw new Error(`Refusing to clean filesystem root: ${targetDir}`);
  }
}

function resolveOutputPath(targetDir: string, entryName: string): string {
  const normalizedEntryPath = entryName.replace(/\\/g, "/");
  if (
    normalizedEntryPath.startsWith("/") ||
    normalizedEntryPath.startsWith("../") ||
    /^[A-Za-z]:/.test(normalizedEntryPath)
  ) {
    throw new Error(`Refusing unsafe zip entry path: ${entryName}`);
  }

  const segments = normalizedEntryPath.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some(segment => segment === "." || segment === "..")) {
    throw new Error(`Refusing unsafe zip entry path: ${entryName}`);
  }

  const outputPath = path.resolve(targetDir, ...segments);
  const relativePath = path.relative(targetDir, outputPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing zip entry outside target directory: ${entryName}`);
  }

  return outputPath;
}

function isDirectoryEntry(entry: YauzlEntry): boolean {
  return entry.fileName.endsWith("/");
}

function isSymlinkEntry(entry: YauzlEntry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return unixMode === 0o120000;
}

function pipeToFile(readStream: Readable, filePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(filePath);
    let settled = false;

    const settle = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    readStream.on("error", error => settle(error instanceof Error ? error : new Error(String(error))));
    writeStream.on("error", error => settle(error instanceof Error ? error : new Error(String(error))));
    writeStream.on("finish", () => settle());
    readStream.pipe(writeStream);
  });
}

function openReadStream(zipFile: YauzlZipFile, entry: YauzlEntry): Promise<Readable> {
  return new Promise<Readable>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, readStream) => {
      if (error) {
        reject(error);
        return;
      }
      if (!readStream) {
        reject(new Error(`Missing read stream for ${entry.fileName}`));
        return;
      }
      resolve(readStream);
    });
  });
}

async function extractZip(assetsZipPath: string, targetDir: string): Promise<ExtractionSummary> {
  const yauzl = await import("yauzl");

  return await new Promise<ExtractionSummary>((resolve, reject) => {
    yauzl.open(assetsZipPath, { lazyEntries: true, autoClose: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipFile) {
        reject(new Error("Failed to open Assets.zip."));
        return;
      }

      const summary: ExtractionSummary = {
        extractedFileCount: 0,
        extractedByteCount: 0,
        skippedSymlinkCount: 0,
      };
      let settled = false;

      const resolveOnce = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(summary);
      };

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        zipFile.close();
        reject(error);
      };

      const readNextEntry = () => {
        if (!settled) {
          zipFile.readEntry();
        }
      };

      zipFile.on("error", error =>
        rejectOnce(error instanceof Error ? error : new Error(String(error))),
      );
      zipFile.on("end", resolveOnce);

      zipFile.on("entry", entry => {
        void (async () => {
          try {
            if (isSymlinkEntry(entry)) {
              summary.skippedSymlinkCount += 1;
              readNextEntry();
              return;
            }

            const outputPath = resolveOutputPath(targetDir, entry.fileName);

            if (isDirectoryEntry(entry)) {
              mkdirSync(outputPath, { recursive: true });
              readNextEntry();
              return;
            }

            mkdirSync(path.dirname(outputPath), { recursive: true });
            const readStream = await openReadStream(zipFile, entry);
            await pipeToFile(readStream, outputPath);

            summary.extractedFileCount += 1;
            summary.extractedByteCount += entry.uncompressedSize;
            if (summary.extractedFileCount % 5000 === 0) {
              console.log(
                `Extracted ${summary.extractedFileCount} files... (${entry.fileName})`,
              );
            }

            readNextEntry();
          } catch (error) {
            rejectOnce(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      });

      readNextEntry();
    });
  });
}

function formatMegabytes(byteSize: number): string {
  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const assetsZipPath = resolveAssetsZipPath(options.positionals[0]);
  if (!assetsZipPath) {
    throw new Error(
      [
        `Missing Assets.zip path. Pass it as the first argument, set ${ASSETS_ZIP_PATH_ENV},`,
        "or place it in the default Hytale install location.",
      ].join(" "),
    );
  }

  const outputDir = resolveOutputDir(options.positionals[1]);
  if (!outputDir) {
    throw new Error(
      `Missing output directory. Pass it as the second argument or set ${BASE_GAME_ASSETS_DIR_ENV}.`,
    );
  }

  if (!existsSync(assetsZipPath)) {
    throw new Error(`Assets.zip not found: ${assetsZipPath}`);
  }

  if (options.clean && existsSync(outputDir)) {
    assertSafeDirectoryToDelete(outputDir);
    rmSync(outputDir, { recursive: true, force: true });
  }

  mkdirSync(outputDir, { recursive: true });

  console.log(`Assets zip: ${assetsZipPath}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Mode: ${options.clean ? "clean extract" : "incremental overwrite"}`);

  const start = performance.now();
  const summary = await extractZip(assetsZipPath, outputDir);
  const elapsedMs = performance.now() - start;

  console.log(`Extracted files: ${summary.extractedFileCount}`);
  console.log(
    `Extracted size: ${formatMegabytes(summary.extractedByteCount)} (${summary.extractedByteCount} bytes)`,
  );
  if (summary.skippedSymlinkCount > 0) {
    console.log(`Skipped symlinks: ${summary.skippedSymlinkCount}`);
  }
  console.log(`Elapsed: ${elapsedMs.toFixed(0)} ms (${(elapsedMs / 1000).toFixed(2)} s)`);
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
