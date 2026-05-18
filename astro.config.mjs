// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://open-source-ai.tech",
  integrations: [mdx(), sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    // react-dom 19.x ships as CommonJS. Vite's dev server needs an
    // explicit hint to pre-bundle react-dom/client as ESM; without
    // this, the browser sees the CJS module directly and the
    // createRoot named export is missing.
    optimizeDeps: {
      include: ["react-dom/client"],
    },
  },
});
