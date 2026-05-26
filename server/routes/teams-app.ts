import type { Express, Request, Response } from "express";
import archiver from "archiver";
import * as fs from "fs";
import * as path from "path";

interface TeamsAppDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerTeamsAppRoutes(app: Express, deps: TeamsAppDeps) {
  const { requireAuth, requireRole } = deps;

  function resolveTeamsDir(): string {
    const candidates = [
      path.join(process.cwd(), "teams"),
      path.join(process.cwd(), "dist", "teams"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(path.join(p, "manifest.json"))) return p;
    }
    return candidates[0];
  }

  function validateOverrides(overrides: { appName?: string; domain?: string; entraAppId?: string; accentColor?: string }): string | null {
    if (overrides.appName && overrides.appName.length > 30) {
      return "App name must be 30 characters or fewer (Teams requirement)";
    }
    if (overrides.domain) {
      const domain = overrides.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
        return "Invalid domain format";
      }
    }
    if (overrides.entraAppId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(overrides.entraAppId)) {
      return "Entra App ID must be a valid UUID (e.g. 198aa0a6-d2ed-4f35-b41b-b6f6778a30d6)";
    }
    if (overrides.accentColor && !/^#[0-9a-fA-F]{6}$/.test(overrides.accentColor)) {
      return "Accent color must be a valid hex color (e.g. #1E3A5F)";
    }
    return null;
  }

  function bumpVersion(version: string): string {
    const parts = (version || "1.0.0").split(".").map(Number);
    while (parts.length < 3) parts.push(0);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join(".");
  }

  function buildManifest(overrides: {
    appName?: string;
    domain?: string;
    entraAppId?: string;
    accentColor?: string;
    version?: string;
  }): object {
    const teamsDir = resolveTeamsDir();
    const templatePath = path.join(teamsDir, "manifest.json");
    const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

    if (overrides.appName) {
      template.name.short = overrides.appName;
      template.name.full = `${overrides.appName} - Synozur Consulting Delivery Platform`;
    }

    if (overrides.domain) {
      const domain = overrides.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      template.configurableTabs[0].configurationUrl = `https://${domain}/embed/configure`;
      template.staticTabs[0].contentUrl = `https://${domain}/embed/dashboard`;
      template.validDomains = [domain];
      if (overrides.entraAppId) {
        template.webApplicationInfo.resource = `api://${domain}/${overrides.entraAppId}`;
      }
    }

    if (overrides.entraAppId) {
      template.id = overrides.entraAppId;
      template.webApplicationInfo.id = overrides.entraAppId;
    }

    if (overrides.accentColor) {
      template.accentColor = overrides.accentColor;
    }

    if (overrides.version) {
      template.version = overrides.version;
    }

    return template;
  }

  async function buildZipBuffer(manifest: object, teamsDir: string): Promise<Buffer> {
    const colorIconPath = path.join(teamsDir, "color.png");
    const outlineIconPath = path.join(teamsDir, "outline.png");
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("data", (chunk) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      archive.file(colorIconPath, { name: "color.png" });
      archive.file(outlineIconPath, { name: "outline.png" });
      archive.finalize();
    });
  }

  app.get("/api/teams/app-package", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const teamsDir = resolveTeamsDir();
      const manifestPath = path.join(teamsDir, "manifest.json");

      if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ message: "Teams manifest template not found" });
      }

      const appName = (req.query.appName as string) || undefined;
      const domain = (req.query.domain as string) || undefined;
      const entraAppId = (req.query.entraAppId as string) || undefined;
      const accentColor = (req.query.accentColor as string) || undefined;

      const validationError = validateOverrides({ appName, domain, entraAppId, accentColor });
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const manifest = buildManifest({ appName, domain, entraAppId, accentColor });

      const colorIconPath = path.join(teamsDir, "color.png");
      const outlineIconPath = path.join(teamsDir, "outline.png");

      if (!fs.existsSync(colorIconPath) || !fs.existsSync(outlineIconPath)) {
        return res.status(404).json({ message: "Teams app icons not found (color.png, outline.png)" });
      }

      const filename = `constellation-teams-app${appName ? `-${appName.toLowerCase().replace(/\s+/g, "-")}` : ""}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err) => {
        console.error("[TEAMS-APP] Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to create app package" });
        }
      });

      archive.pipe(res);
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      archive.file(colorIconPath, { name: "color.png" });
      archive.file(outlineIconPath, { name: "outline.png" });
      await archive.finalize();
    } catch (error: any) {
      console.error("[TEAMS-APP] Failed to generate app package:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate Teams app package" });
      }
    }
  });

  app.get("/api/teams/app-package/preview", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const teamsDir = resolveTeamsDir();
      const manifestPath = path.join(teamsDir, "manifest.json");

      if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ message: "Teams manifest template not found" });
      }

      const appName = (req.query.appName as string) || undefined;
      const domain = (req.query.domain as string) || undefined;
      const entraAppId = (req.query.entraAppId as string) || undefined;
      const accentColor = (req.query.accentColor as string) || undefined;

      const validationError = validateOverrides({ appName, domain, entraAppId, accentColor });
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const manifest = buildManifest({ appName, domain, entraAppId, accentColor });
      res.json(manifest);
    } catch (error: any) {
      console.error("[TEAMS-APP] Failed to preview manifest:", error);
      res.status(500).json({ message: "Failed to preview manifest" });
    }
  });

  app.post("/api/teams/publish", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const teamsDir = resolveTeamsDir();
      const manifestPath = path.join(teamsDir, "manifest.json");

      if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ message: "Teams manifest template not found" });
      }

      const { appName, domain, entraAppId, accentColor } = req.body || {};

      const validationError = validateOverrides({ appName, domain, entraAppId, accentColor });
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }

      const manifest = buildManifest({ appName, domain, entraAppId, accentColor });

      const colorIconPath = path.join(teamsDir, "color.png");
      const outlineIconPath = path.join(teamsDir, "outline.png");

      if (!fs.existsSync(colorIconPath) || !fs.existsSync(outlineIconPath)) {
        return res.status(404).json({ message: "Teams app icons not found" });
      }

      const { graphClient } = await import("../services/graph-client.js");

      const zipBuffer = await buildZipBuffer(manifest, teamsDir);

      let token: string;
      let tokenSource: string;

      // Strategy 1: Use the session's SSO refresh token to get a delegated AppCatalog token.
      // This works even after a server restart (no in-memory MSAL cache needed) because
      // the refresh token is persisted in the DB session.
      const sessionUser = req.user as any;
      const ssoRefreshToken = sessionUser?.ssoRefreshToken;

      if (ssoRefreshToken) {
        try {
          const { msalInstance: delegatedMsal } = await import("../auth/entra-config.js");
          if (!delegatedMsal) throw new Error("MSAL not configured");

          console.log(`[TEAMS-APP] Attempting delegated token via session refresh token for ${sessionUser?.email}`);
          const refreshResult = await delegatedMsal.acquireTokenByRefreshToken({
            refreshToken: ssoRefreshToken,
            scopes: ["AppCatalog.ReadWrite.All"],
          });

          if (!refreshResult?.accessToken) throw new Error("acquireTokenByRefreshToken returned no token");

          token = refreshResult.accessToken;
          tokenSource = "delegated (session refresh token → AppCatalog scope)";
          console.log("[TEAMS-APP] Acquired delegated token via session refresh token");
        } catch (refreshErr: any) {
          console.log(`[TEAMS-APP] Session refresh token failed: ${refreshErr?.message}, falling back to MSAL cache`);
          // Fall through to Strategy 2
          token = "";
          tokenSource = "";
        }
      } else {
        console.log("[TEAMS-APP] No SSO refresh token in session, trying MSAL cache");
        token = "";
        tokenSource = "";
      }

      // Strategy 2: Try MSAL in-memory cache (works when the server hasn't restarted)
      if (!token) {
        try {
          const { msalInstance: delegatedMsal } = await import("../auth/entra-config.js");
          if (!delegatedMsal) throw new Error("MSAL not configured");

          const tokenCache = delegatedMsal.getTokenCache();
          const accounts = await tokenCache.getAllAccounts();
          const userEmail = sessionUser?.email?.toLowerCase();
          console.log(`[TEAMS-APP] MSAL cache has ${accounts.length} account(s), looking for ${userEmail}`);
          const account = userEmail
            ? accounts.find((a: any) => a.username?.toLowerCase() === userEmail) || accounts[0]
            : accounts[0];

          if (!account) throw new Error("No cached MSAL account found");

          const silentResult = await delegatedMsal.acquireTokenSilent({
            account,
            scopes: ["AppCatalog.ReadWrite.All"],
          });
          if (!silentResult?.accessToken) throw new Error("acquireTokenSilent returned no token");

          token = silentResult.accessToken;
          tokenSource = "delegated (MSAL in-memory cache)";
          console.log("[TEAMS-APP] Acquired delegated token via MSAL in-memory cache");
        } catch (silentErr: any) {
          console.log(`[TEAMS-APP] MSAL cache failed: ${silentErr?.message}, falling back to app-only token`);
          token = await graphClient.authenticate();
          tokenSource = "application (service principal)";
        }
      }

      console.log(`[TEAMS-APP] Publishing with ${tokenSource} token`);

      let publishResponse = await fetch(
        "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?requiresReview=false",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/zip",
          },
          body: zipBuffer,
        }
      );

      if (publishResponse.status === 403) {
        const errorBody = await publishResponse.text();
        console.log(`[TEAMS-APP] Publish (requiresReview=false) returned 403 with ${tokenSource}:`, errorBody);

        publishResponse = await fetch(
          "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/zip",
            },
            body: zipBuffer,
          }
        );
      }

      if (publishResponse.status === 403 && tokenSource.includes("delegated")) {
        const errorBody2 = await publishResponse.text();
        console.log("[TEAMS-APP] Delegated token failed, falling back to app-only token:", errorBody2);
        const appToken = await graphClient.authenticate();
        tokenSource = "application (fallback)";

        publishResponse = await fetch(
          "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${appToken}`,
              "Content-Type": "application/zip",
            },
            body: zipBuffer,
          }
        );
      }

      if (publishResponse.status === 409) {
        const updateAppId = (manifest as any).id || (manifest as any).webApplicationInfo?.id;
        const listResponse = await fetch(
          `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=externalId eq '${updateAppId}'&$expand=appDefinitions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (listResponse.ok) {
          const listData = await listResponse.json();
          const existingApp = listData?.value?.[0];
          if (existingApp) {
            // Determine the current published version and bump it so Graph doesn't reject with VersionAlreadyExists
            const existingVersion: string =
              existingApp.appDefinitions?.[0]?.teamsAppDefinition?.version ||
              existingApp.appDefinitions?.[0]?.version ||
              (manifest as any).version ||
              "1.0.0";
            const newVersion = bumpVersion(existingVersion);
            console.log(`[TEAMS-APP] Bumping version for update: ${existingVersion} → ${newVersion}`);

            // Rebuild manifest and zip with the bumped version
            const updatedManifest = buildManifest({ appName, domain, entraAppId, accentColor, version: newVersion });
            const updatedZipBuffer = await buildZipBuffer(updatedManifest, teamsDir);

            const tryUpdateWithToken = async (updateToken: string) => {
              let r = await fetch(
                `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${existingApp.id}/appDefinitions?requiresReview=false`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${updateToken}`, "Content-Type": "application/zip" },
                  body: updatedZipBuffer,
                }
              );
              // If requiresReview=false fails, retry without it (some tenants don't allow skipping review)
              if (r.status === 403 || r.status === 400) {
                r = await fetch(
                  `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${existingApp.id}/appDefinitions`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${updateToken}`, "Content-Type": "application/zip" },
                    body: updatedZipBuffer,
                  }
                );
              }
              return r;
            };

            let updateResponse = await tryUpdateWithToken(token);

            // If the delegated token failed, try with app-only token as fallback
            if ((updateResponse.status === 401 || updateResponse.status === 403) && !tokenSource.includes("application")) {
              console.log(`[TEAMS-APP] Delegated update failed (${updateResponse.status}), retrying with app-only token`);
              const appOnlyToken = await graphClient.authenticate();
              updateResponse = await tryUpdateWithToken(appOnlyToken);
            }

            // 200, 201, 202 (pending review) are all acceptable success codes
            if (updateResponse.ok || updateResponse.status === 201 || updateResponse.status === 202) {
              const pendingReview = updateResponse.status === 202;
              return res.json({
                success: true,
                action: "updated",
                message: pendingReview
                  ? "Teams app update submitted for review in your organization's app catalog"
                  : "Teams app updated in your organization's app catalog",
                teamsAppId: existingApp.id,
                version: newVersion,
                pendingReview,
              });
            }

            const updateError = await updateResponse.text();
            console.error(`[TEAMS-APP] Update failed (${updateResponse.status}):`, updateError);
            return res.status(updateResponse.status).json({
              success: false,
              message: `Teams app update failed (${updateResponse.status}): ${updateError}`,
            });
          }
        }

        return res.status(409).json({
          success: false,
          message: "A Teams app with this ID already exists in the catalog. Update failed.",
          hint: "Try downloading the package and uploading it manually through the Teams Admin Center.",
        });
      }

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        const statusCode = publishResponse.status;
        console.error("[TEAMS-APP] Publish failed:", statusCode, errorText);

        let graphError = "";
        try {
          const parsed = JSON.parse(errorText);
          graphError = parsed?.error?.message || parsed?.message || "";
        } catch {}

        if (statusCode === 401 || statusCode === 403) {
          return res.status(statusCode).json({
            success: false,
            message: "Insufficient permissions to publish to the Teams app catalog.",
            detail: graphError || errorText,
            hint: "To fix: In Entra ID, add AppCatalog.ReadWrite.All as a DELEGATED permission (in addition to Application), grant admin consent, then log out and log back in via SSO. Alternatively, assign the 'Teams Administrator' Azure AD role to the app's service principal under Enterprise Applications. You can also download the package and upload it manually via Teams Admin Center.",
          });
        }

        return res.status(statusCode).json({
          success: false,
          message: `Failed to publish: ${graphError || errorText}`,
        });
      }

      const location = publishResponse.headers.get("Location") || "";
      const teamsAppId = location.split("'")[1] || "unknown";

      res.json({
        success: true,
        action: "published",
        message: "Teams app published to your organization's app catalog",
        teamsAppId,
      });
    } catch (error: any) {
      console.error("[TEAMS-APP] Failed to publish to catalog:", error);
      res.status(500).json({
        success: false,
        message: `Failed to publish: ${error.message}`,
        hint: "Try downloading the package and uploading it manually through the Teams Admin Center.",
      });
    }
  });
}
