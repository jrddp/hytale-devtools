import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { build as buildWithEsbuild } from "esbuild";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(currentDir, "../../default-data/export-data/schemas");
const runtimeBundlePath = path.join("/tmp", `hytale-asset-editor-schema-runtime-${process.pid}.mjs`);
const devDocumentPath = "/tmp/Server/Item/Items/Armor/Bronze/Armor_Bronze_Hands.json";
const devBootstrapRoute = "/__asset-editor/dev-bootstrap";
const devResolveRefRoute = "/__asset-editor/resolve-ref";

let schemaRuntimePromise;

async function getSchemaRuntime() {
  if (!schemaRuntimePromise) {
    schemaRuntimePromise = (async () => {
      await buildWithEsbuild({
        entryPoints: [path.resolve(currentDir, "../../src/schema/schemaLoader.ts")],
        outfile: runtimeBundlePath,
        bundle: true,
        format: "esm",
        platform: "node",
        sourcemap: false,
        logLevel: "silent",
      });
      const runtimeModule = await import(pathToFileURL(runtimeBundlePath).href);
      return new runtimeModule.SchemaRuntime(schemaDir, console);
    })();
  }

  return schemaRuntimePromise;
}

async function getDevBootstrapPayload() {
  const runtime = await getSchemaRuntime();
  const assetDefinition = runtime.getAssetDefinitionForPath(devDocumentPath);
  if (!assetDefinition) {
    throw new Error(`No asset definition matched ${devDocumentPath}`);
  }
  return {
    assetDefinition,
    documentPath: devDocumentPath,
    text: "{}",
    version: 1,
  };
}

function jsonResponse(body) {
  return JSON.stringify(body);
}

function assetEditorDevPlugin() {
  return {
    name: "asset-editor-dev-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const requestUrl = new URL(req.url ?? "/", "http://localhost");
          if (requestUrl.pathname === devBootstrapRoute) {
            res.setHeader("Content-Type", "application/json");
            res.end(jsonResponse(await getDevBootstrapPayload()));
            return;
          }

          if (requestUrl.pathname === devResolveRefRoute) {
            const $ref = requestUrl.searchParams.get("ref");
            const runtime = await getSchemaRuntime();
            res.setHeader("Content-Type", "application/json");
            res.end(
              jsonResponse({
                $ref,
                field: $ref ? runtime.assetsByRef.get($ref)?.rootField ?? null : null,
              }),
            );
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            jsonResponse({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: currentDir,
  base: "./",
  resolve: {
    alias: {
      "@shared": path.resolve(currentDir, "../../src/shared"),
      "@webview-shared": path.resolve(currentDir, "../shared"),
      src: path.resolve(currentDir, "src"),
    },
  },
  plugins: [svelte(), tailwindcss(), assetEditorDevPlugin()],
  build: {
    outDir: path.resolve(currentDir, "../../media/hytaleAssetEditor"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: "inline",
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
