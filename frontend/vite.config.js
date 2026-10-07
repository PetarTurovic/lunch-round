import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true
  }
});
