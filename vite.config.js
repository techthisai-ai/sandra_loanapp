import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /** Relative paths so bundled assets load inside the Capacitor WebView (file/https). */
  base: "./",
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL("./index.html", import.meta.url)),
    },
  },
});
