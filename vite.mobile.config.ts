import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { copyFile } from "node:fs/promises";
import release from "./app/release.json";

export default defineConfig({
  root: "mobile",
  base: "./",
  // Release archives must never be recursively bundled into the next update.
  publicDir: false,
  plugins: [react(), {
    name: "novel-offline-assets",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify(release) });
    },
    async closeBundle() {
      await copyFile(path.resolve(__dirname, "public/corridor.jpg"), path.resolve(__dirname, "dist-mobile/corridor.jpg"));
    },
  }],
  build: {
    outDir: path.resolve(__dirname, "dist-mobile"),
    emptyOutDir: true,
  },
});
