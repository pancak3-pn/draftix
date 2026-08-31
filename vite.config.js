import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  plugins: [react()],
  publicDir: "public",
  server: { proxy: { "/socket.io": { target: "http://127.0.0.1:3000", ws: true }, "/healthz": "http://127.0.0.1:3000" } },
  build: { outDir: "dist-react", emptyOutDir: true },
});
