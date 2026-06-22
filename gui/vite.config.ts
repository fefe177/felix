import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base: "./"` makes the built assets load from a file:// URL inside Electron.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
