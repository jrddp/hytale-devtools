import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const descriptorPath = path.resolve(currentDir, "../../default-data/export-data/npc_descriptors.json");
const devBootstrapRoute = "/__npc-role-editor/dev-bootstrap";
const devDocumentPath = "/tmp/Server/NPC/Roles/_Core/Tests/Test_Wolf_Pack.json";
const devDocumentData = {
  Type: "Generic",
  StartState: "Idle",
  BusyStates: ["Move", "Attack"],
  Appearance: "Sheep",
  MaxHealth: 100,
  NameTranslationKey: {
    Compute: "NameTranslationKey",
  },
  Debug: "DisplayState",
  Parameters: {
    NameTranslationKey: {
      Value: "server.npcRoles.dev_test.name",
      Description: "Translation key for NPC name display",
      TypeHint: "String",
    },
    ViewRange: {
      Value: 18,
      Description: "Maximum target search distance",
      TypeHint: "Double",
    },
    WanderEnabled: {
      Value: true,
      Description: "Whether idle wandering is allowed",
      TypeHint: "Boolean",
    },
    LeashRadius: {
      Value: {
        Compute: "max(ViewRange, 12)",
      },
      Description: "Computed leash radius based on view range",
      TypeHint: "Double",
    },
    Tags: {
      Value: ["Creature", "Test"],
      Description: "Debug tags applied to the NPC",
      TypeHint: "String",
    },
  },
};

function jsonResponse(body) {
  return JSON.stringify(body);
}

function getDevBootstrapPayload() {
  const descriptors = JSON.parse(readFileSync(descriptorPath, "utf8"));
  return {
    descriptors,
    descriptorPath,
    descriptorSource: "default-data",
    documentPath: devDocumentPath,
    text: JSON.stringify(devDocumentData, null, 2),
    version: 1,
  };
}

function npcRoleEditorDevPlugin() {
  return {
    name: "npc-role-editor-dev-plugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          const requestUrl = new URL(req.url ?? "/", "http://localhost");
          if (requestUrl.pathname === devBootstrapRoute) {
            res.setHeader("Content-Type", "application/json");
            res.end(jsonResponse(getDevBootstrapPayload()));
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
  plugins: [svelte(), tailwindcss(), npcRoleEditorDevPlugin()],
  build: {
    outDir: path.resolve(currentDir, "../../media/hytaleNpcRoleEditor"),
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
