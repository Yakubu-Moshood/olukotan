import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Rust build output changes constantly and Windows locks it while compiling; Vite must not watch it.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2021", minify: process.env.TAURI_DEBUG ? false : "esbuild", sourcemap: Boolean(process.env.TAURI_DEBUG) },
});
