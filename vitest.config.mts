import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(currentDir, "src/shared"),
      src: path.resolve(currentDir, "webview/hytale-node-editor/src"),
    },
  },
  plugins: [svelte(), tailwindcss()],
  test: {
    environment: "node",
    include: ["test/node-editor-parser/**/*.test.ts", "test/asset-editor-parser/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    server: {
      deps: {
        inline: ["@xyflow/svelte", "svelte"],
      },
    },
  },
});
