import fs from "node:fs";
import { describe, expect, it } from "./_harness.js";
import {
  findTenantScratchProject,
  provisionProjectM365Unlocked,
} from "../server/routes/projects.js";
import { clientTeams, projectChannels } from "../shared/schema.js";
import { getM365RetryAccessDenial } from "../server/routes/project-access.js";

const projectsPage = fs.readFileSync(new URL("../client/src/pages/projects.tsx", import.meta.url), "utf8");
const projectsRoutes = fs.readFileSync(new URL("../server/routes/projects.ts", import.meta.url), "utf8");
const plannerRoutes = fs.readFileSync(new URL("../server/routes/planner.ts", import.meta.url), "utf8");
const projectDetail = fs.readFileSync(new URL("../client/src/pages/project-detail.tsx", import.meta.url), "utf8");

describe("project-from-scratch creation contract", () => {
  function integrationHarness(failCheckpointAt: number) {
    const teams: any[] = [];
    const channels: any[] = [];
    const plans: any[] = [];
    const clientLinks = new Map<string, any>();
    const channelLinks = new Map<string, any>();
    const plannerLinks = new Map<string, any>();
    let checkpointWrites = 0;
    let injected = false;
    const creates = { team: 0, channel: 0, plan: 0 };

    const rowsFor = (table: any) => table === clientTeams
      ? [...clientLinks.values()]
      : table === projectChannels
        ? [...channelLinks.values()]
        : [];
    const mockDb = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({ limit: async () => rowsFor(table).slice(0, 1) }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => {
            checkpointWrites++;
            if (!injected && checkpointWrites === failCheckpointAt) {
              injected = true;
              throw new Error("injected database failure");
            }
          },
        }),
      }),
      insert: (table: any) => ({
        values: (row: any) => {
          const save = async () => {
            if (table === clientTeams) clientLinks.set(row.clientId, row);
            if (table === projectChannels) channelLinks.set(`${row.tenantId}:${row.projectId}`, row);
          };
          return {
            onConflictDoUpdate: save,
            onConflictDoNothing: save,
          };
        },
      }),
    };
    const plannerService = {
      searchGroups: async () => teams,
      lookupUserByEmail: async () => ({ id: "owner-1" }),
      createTeam: async (input: any) => {
        creates.team++;
        const team = { id: "team-1", displayName: input.displayName, description: input.description };
        teams.push(team);
        return team;
      },
      listChannels: async () => channels,
      createChannel: async (_teamId: string, input: any) => {
        creates.channel++;
        const channel = { id: "channel-1", displayName: input.displayName, description: input.description };
        channels.push(channel);
        return channel;
      },
      createConstellationTab: async () => ({}),
      listPlansForGroup: async () => plans,
      createPlan: async (_teamId: string, title: string) => {
        creates.plan++;
        const plan = { id: "plan-1", title };
        plans.push(plan);
        return plan;
      },
    };
    const mockStorage = {
      updateClient: async () => ({}),
      getProjectPlannerConnection: async (projectId: string) => plannerLinks.get(projectId),
      createProjectPlannerConnection: async (row: any) => {
        plannerLinks.set(row.projectId, row);
        return row;
      },
    };
    return { mockDb, plannerService, mockStorage, creates, clientLinks, channelLinks, plannerLinks };
  }

  const req = { user: { id: "user-1", email: "owner@example.com" } } as any;
  const baseOptions = {
    projectId: "project-1",
    projectName: "Project One",
    clientId: "client-1",
    tenantId: "tenant-a",
    teamsTeamId: null,
    teamsTeamName: "Client Team",
    teamsChannelName: "Project One",
    teamsExistingChannelId: null,
    teamsExistingChannelName: null,
    teamsExistingChannelWebUrl: null,
    createPlannerPlan: false,
    autoAddMembers: false,
    inviteGuests: false,
  } as const;

  it("repairs the client mapping without creating a second Team", async () => {
    const h = integrationHarness(2);
    const first = await provisionProjectM365Unlocked(req, {
      ...baseOptions,
      teamsMode: "new-team",
      provisioningRequest: { scratchCreationKey: "key-1" },
    }, { plannerService: h.plannerService, db: h.mockDb, storage: h.mockStorage });
    expect(first.status).toBe("failed");

    const retry = await provisionProjectM365Unlocked(req, {
      ...baseOptions,
      teamsMode: "new-team",
      provisioningRequest: { scratchCreationKey: "key-1" },
    }, { plannerService: h.plannerService, db: h.mockDb, storage: h.mockStorage });
    expect(retry.status).toBe("succeeded");
    expect(h.creates.team).toBe(1);
    expect(h.clientLinks.get("client-1").teamId).toBe("team-1");
  });

  it("repairs the project link without creating a second channel", async () => {
    const h = integrationHarness(2);
    const options = {
      ...baseOptions,
      teamsMode: "new-channel" as const,
      teamsTeamId: "team-existing",
      createPlannerPlan: true,
      provisioningRequest: { scratchCreationKey: "key-3" },
    };
    expect((await provisionProjectM365Unlocked(req, options, {
      plannerService: h.plannerService, db: h.mockDb, storage: h.mockStorage,
    })).status).toBe("partial");
    expect((await provisionProjectM365Unlocked(req, {
      ...options, provisioningRequest: { scratchCreationKey: "key-2" },
    }, {
      plannerService: h.plannerService, db: h.mockDb, storage: h.mockStorage,
    })).status).toBe("succeeded");
    expect(h.creates.channel).toBe(1);
    expect(h.channelLinks.get("tenant-a:project-1").channelId).toBe("channel-1");
  });

  it("repairs the Planner connection without creating a second plan", async () => {
    const h = integrationHarness(2);
    h.plannerService.listChannels = async () => [{
      id: "existing-channel", displayName: "Existing", webUrl: null,
    }];
    const options = {
      ...baseOptions,
      teamsMode: "existing-channel" as const,
      teamsTeamId: "team-existing",
      teamsExistingChannelId: "existing-channel",
      createPlannerPlan: true,
      provisioningRequest: { scratchCreationKey: "key-3" },
    };
    expect((await provisionProjectM365Unlocked(req, options, {
      plannerService: h.plannerService, db: h.mockDb, storage: h.mockStorage,
    })).status).toBe("partial");
    expect((await provisionProjectM365Unlocked(req, {
      ...options, provisioningRequest: { scratchCreationKey: "key-3" },
    }, {
      plannerService: h.plannerService, db: h.mockDb, storage: h.mockStorage,
    })).status).toBe("succeeded");
    expect(h.creates.plan).toBe(1);
    expect(h.plannerLinks.get("project-1").planId).toBe("plan-1");
    expect(h.channelLinks.get("tenant-a:project-1").plannerPlanId).toBe("plan-1");
  });

  it("replays creation keys only inside the matching tenant", async () => {
    const storedProjects = new Map<string, any>();
    const channelLinks = new Map<string, string>();
    const database = {
      findProjectByTenantScratchKey: async (tenantId: string, key: string) =>
        storedProjects.get(`${tenantId}:${key}`),
    };
    let nextId = 0;
    const createProject = async (tenantId: string, key: string, channelId: string) => {
      const replay = await findTenantScratchProject(tenantId, key, database);
      if (replay) return replay;
      const project = { id: `project-${++nextId}`, tenantId, scratchCreationKey: key };
      storedProjects.set(`${tenantId}:${key}`, project);
      channelLinks.set(`${tenantId}:${project.id}`, channelId);
      return project;
    };

    const tenantAOriginal = await createProject("tenant-a", "same-key", "channel-a");
    const tenantAReplay = await createProject("tenant-a", "same-key", "ignored-channel");
    const tenantBOther = await createProject("tenant-b", "same-key", "channel-b");

    expect(tenantAReplay).toEqual(tenantAOriginal);
    expect(tenantBOther.id === tenantAOriginal.id).toBeFalsy();
    expect(channelLinks.get(`tenant-a:${tenantAOriginal.id}`)).toBe("channel-a");
    expect(channelLinks.get(`tenant-b:${tenantBOther.id}`)).toBe("channel-b");
  });

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
    const provisionPosition = projectsRoutes.indexOf("const result = await provisionProjectM365(req");
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
    expect(projectsRoutes).toContain("resolveCheckpointedRemote");
    expect(projectsRoutes).toContain("searchGroups");
    expect(projectsRoutes).toContain("listChannels");
    expect(projectsRoutes).toContain("listPlansForGroup");
    expect(projectsRoutes).toContain("lookupUserByEmail");
    expect(projectsRoutes).toContain("ownerIds: [owner.id]");
    expect(projectDetail).toContain("Retry Microsoft Setup");
    expect(projectDetail).toContain(`/m365-retry`);
    expect(plannerRoutes).toContain("graphChannel");
  });

  it("forbids Microsoft setup retry by an unassigned project manager", () => {
    const denial = getM365RetryAccessDenial(
      { id: "pm-other", role: "pm" },
      { pm: "pm-owner" },
    );

    expect(denial?.status).toBe(403);
    expect(denial?.body.message).toContain("projects you manage");
  });

  it("allows Microsoft setup retry by the assigned project manager and tenant-wide roles", () => {
    expect(getM365RetryAccessDenial(
      { id: "pm-owner", role: "pm" },
      { pm: "pm-owner" },
    )).toBe(null);
    expect(getM365RetryAccessDenial(
      { id: "admin-user", role: "admin" },
      { pm: "pm-owner" },
    )).toBe(null);
  });

  it("checks Microsoft retry access before changing state or provisioning", () => {
    const accessPosition = projectsRoutes.indexOf("getM365RetryAccessDenial(req.user, project)");
    const stateUpdatePosition = projectsRoutes.indexOf('message: "Microsoft setup retry is in progress."');
    const provisionPosition = projectsRoutes.indexOf("const result = await provisionProjectM365(req");

    expect(accessPosition).toBeGreaterThanOrEqual(0);
    expect(stateUpdatePosition).toBeGreaterThan(accessPosition);
    expect(provisionPosition).toBeGreaterThan(accessPosition);
  });
});
