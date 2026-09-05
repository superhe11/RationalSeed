import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { copyFile } from "node:fs/promises";

export default defineConfig({
  root: "mobile",
  base: "./",
  // Release archives must never be recursively bundled into the next update.
  publicDir: false,
  plugins: [react(), {
    name: "novel-offline-assets",
    async closeBundle() {
      await copyFile(path.resolve(__dirname, "public/corridor.png"), path.resolve(__dirname, "dist-mobile/corridor.png"));
    },
  }],
  build: {
    outDir: path.resolve(__dirname, "dist-mobile"),
    emptyOutDir: true,
  },
});
