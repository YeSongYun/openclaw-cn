import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

function localesPlugin(): Plugin {
  const localesDir = path.resolve(here, "..", "locales");
  return {
    name: "copy-locales",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/locales/")) {
          return next();
        }
        const rel = req.url.slice("/locales/".length);
        if (rel.includes("..") || !rel.endsWith(".json")) {
          return next();
        }
        const filePath = path.join(localesDir, rel);
        if (!filePath.startsWith(localesDir)) {
          return next();
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      for (const entry of fs.readdirSync(localesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const src = path.join(localesDir, entry.name, "ui.json");
        if (!fs.existsSync(src)) {
          continue;
        }
        const destDir = path.resolve(here, "../dist/control-ui/locales", entry.name);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, "ui.json"));
      }
    },
  };
}

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    base,
    plugins: [localesPlugin()],
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  };
});
