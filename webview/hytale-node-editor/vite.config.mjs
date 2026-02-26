import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: currentDir,
  base: "./",
  resolve: {
    alias: {
      "@shared": path.resolve(currentDir, "../../src/shared"),
      src: path.resolve(currentDir, "src"),
    },
  },
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: path.resolve(currentDir, "../../media/hytaleNodeEditor"),
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
