import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// Keep one source for the detailed guides while shipping both the canonical
// URLs and the older URLs already shared with users.
export function documentationAssets(projectRoot: string): Plugin {
  const guides = ["SCDP-User-Guide.md", "SCDP-Administrator-Guide.md"];
  const assets = new Map<string, string>();
  assets.set("/docs/RELEASE_2_8.md", path.join(projectRoot, "docs", "RELEASE_2_8.md"));
  for (const guide of guides) {
    const source = path.join(projectRoot, "docs", "user-guide", guide);
    assets.set(`/docs/user-guide/${guide}`, source);
    assets.set(`/user-guide/${guide}`, source);
  }
  return {
    name: "documentation-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const source = assets.get((req.url || "").split("?")[0]);
        if (!source || !["GET", "HEAD"].includes(req.method || "")) return next();
        try {
          const content = fs.readFileSync(source);
          res.setHeader("Content-Type", "text/markdown; charset=utf-8");
          res.setHeader("Content-Length", content.length);
          res.end(req.method === "HEAD" ? undefined : content);
        } catch (error) {
          next(error);
        }
      });
    },
    generateBundle() {
      for (const [url, source] of assets) {
        this.emitFile({
          type: "asset",
          fileName: url.slice(1),
          source: fs.readFileSync(source),
        });
      }
    },
  };
}
