import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" keeps built assets relative so the same bundle works from a
// static file server and from a Tauri (file://-ish) webview shell.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5177,
    strictPort: true,
  },
  build: {
    target: "es2023",
  },
});
