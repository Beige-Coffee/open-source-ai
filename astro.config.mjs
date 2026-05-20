// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

// https://astro.build/config
//
// Hybrid SSR mode: most of the site is prerendered (static); only
// /learn/* routes and /api/* routes run server-side at request time.
// Per-route control via `export const prerender = false` in the
// .astro file. Everything else stays prerendered.
//
// Why hybrid: the course at /learn requires per-user state (Supabase
// auth + progress + notes) and cannot be prerendered. The reference
// site (stack, grants, news, glossary, projects, predictions, about)
// stays static and ships at zero per-request cost.
export default defineConfig({
  site: "https://open-source-ai.tech",
  output: "static",
  adapter: vercel(),
  integrations: [mdx(), sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    // react-dom 19.x ships as CommonJS. Vite's dev server needs an
    // explicit hint to pre-bundle react-dom/client as ESM; without
    // this, the browser sees the CJS module directly and the
    // createRoot named export is missing.
    optimizeDeps: {
      include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"],
    },
    // Force a single React instance across the bundle. Without this,
    // vite's prebundle put react inside react-dom's chunk and re-bundled
    // a second copy for components, which left the hooks dispatcher
    // unset and every component threw "Invalid hook call" on first
    // render — the React-island chat box stayed visually empty.
    resolve: {
      dedupe: ["react", "react-dom"],
    },
  },
});
