import fs from "node:fs";
import { describe, expect, it } from "./_harness.js";

const projectsPage = fs.readFileSync(new URL("../client/src/pages/projects.tsx", import.meta.url), "utf8");
const projectsRoutes = fs.readFileSync(new URL("../server/routes/projects.ts", import.meta.url), "utf8");
const plannerRoutes = fs.readFileSync(new URL("../server/routes/planner.ts", import.meta.url), "utf8");
const projectDetail = fs.readFileSync(new URL("../client/src/pages/project-detail.tsx", import.meta.url), "utf8");

describe("project-from-scratch creation contract", () => {
  it("submits independent commercial and SOW terms", () => {
    expect(projectsPage).toContain("commercialBasis: formData.get('commercialBasis')");
    expect(projectsPage).toContain("hasSow: formData.get('hasSow') === 'true'");
    expect(projectsPage).toContain("sowDate: formData.get('sowDate') || null");
    expect(projectsPage).toContain("sowValue: formData.get('sowValue') || null");
    expect(projectsPage).toContain('name="hasSow"');
    expect(projectsPage).toContain('name="sowDate"');
    expect(projectsPage).toContain('name="sowValue"');
    expect(projectsPage).toMatch(/Nothing is copied or linked from an estimate/);
  });

  it("offers exactly the four requested Microsoft setup outcomes", () => {
    expect(projectsPage).toContain("'new-team' | 'new-channel' | 'existing-channel' | 'skip'");
    expect(projectsPage).toContain("New Team + Channel");
    expect(projectsPage).toContain("Existing Team + New Channel");
    expect(projectsPage).toContain("Link Existing Channel");
    expect(projectsPage).toContain("Skip");
  });

  it("creates the local project before provisioning and reports partial failure", () => {
    const createPosition = projectsRoutes.indexOf("project = await storage.createProject");
    const provisionPosition = projectsRoutes.indexOf("m365Provisioning = await provisionProjectM365");
    expect(createPosition).toBeGreaterThanOrEqual(0);
    expect(provisionPosition).toBeGreaterThan(createPosition);
    expect(projectsRoutes).toContain('status: "failed"');
    expect(projectsRoutes).toContain('status: "partial"');
    expect(projectsRoutes).toContain('status: "running"');
    expect(projectsRoutes).toContain("Retry setup from the project page");
    expect(projectsPage).toContain("Project created; Microsoft setup needs attention");
  });

  it("tenant-validates clients and uses idempotent client and project mappings", () => {
    expect(projectsRoutes).toContain("targetClient.tenantId !== tenantId");
    expect(projectsRoutes).toContain("eq(clientTeams.tenantId, tenantId)");
    expect(projectsRoutes).toContain("onConflictDoNothing({ target: clientTeams.clientId })");
    expect(projectsRoutes).toContain("onConflictDoUpdate({");
    expect(projectsRoutes).toContain("target: projectChannels.projectId");
    expect(plannerRoutes).toContain("targetClient.tenantId !== callerTenantId");
    expect(plannerRoutes).toContain("alreadyLinked: true");
  });

  it("validates existing channels and safely reuses prior Microsoft resources", () => {
    expect(projectsRoutes).toContain("The selected channel does not belong to the selected Microsoft Team");
    expect(projectsRoutes).toContain("existingProjectChannel");
    expect(projectsRoutes).toContain("scratchCreationKey");
    expect(projectsRoutes).toContain("effectiveTeamsMode");
    expect(projectsRoutes).toContain("warnings.length > 0");
    expect(projectsRoutes).toContain("/api/projects/:id/m365-retry");
    expect(projectsRoutes).toContain("persistRemoteCheckpoint");
    expect(projectsRoutes).toContain("createdTeamId");
    expect(projectsRoutes).toContain("createdChannelId");
    expect(projectsRoutes).toContain("createdPlanId");
    expect(projectsRoutes).toContain("pg_advisory_xact_lock");
    expect(projectsRoutes).toContain('createError?.code === "23505"');
    expect(projectsRoutes).toContain("leaseIsActive");
    expect(projectsRoutes).toContain("creationMarker");
    expect(projectsRoutes).toContain("recoveredTeam");
    expect(projectsRoutes).toContain("recoveredChannel");
    expect(projectsRoutes).toContain("recoveredPlan");
    expect(projectsRoutes).toContain("lookupUserByEmail");
    expect(projectsRoutes).toContain("ownerIds: [owner.id]");
    expect(projectDetail).toContain("Retry Microsoft Setup");
    expect(projectDetail).toContain(`/m365-retry`);
    expect(plannerRoutes).toContain("graphChannel");
  });
});