import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getEventsForUser } from "../services/outlook-client";
import {
  mapEventToProject,
  buildEventKey,
  computeEventHours,
  formatEventTime,
} from "../services/calendar-project-mapper";

interface CalendarSuggestionsRouteDeps {
  requireAuth: (req: any, res: any, next: any) => void;
}

export function registerCalendarSuggestionsRoutes(
  app: Express,
  deps: CalendarSuggestionsRouteDeps
) {
  /**
   * GET /api/me/calendar-suggestions?date=YYYY-MM-DD
   *
   * Returns the authenticated user's Outlook calendar events for the given
   * date, enriched with project mapping suggestions.
   *
   * Each user's calendar is fetched using their own delegated Azure AD token
   * (from req.user.ssoRefreshToken) and cached per userId+date — event data is
   * never shared across users.
   *
   * Respects the calendarSuggestionsDaysBack preference: if the requested date
   * is older than the allowed look-back window, empty suggestions are returned.
   */
  app.get("/api/me/calendar-suggestions", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const tenantId: string | null = req.user?.tenantId ?? null;
    const ssoRefreshToken: string | null | undefined = req.user?.ssoRefreshToken;
    const serverToday = new Date().toISOString().split("T")[0];
    // The client passes its local-time "today" so the look-back window is
    // evaluated against the same notion of "today" the user sees in the panel.
    // Around UTC midnight the server's UTC date can be ahead of the user's local
    // date by one day, which previously caused legitimate same-day requests to
    // be rejected as out-of-window when daysBack=0.
    const clientTodayRaw = typeof req.query.clientToday === "string" ? req.query.clientToday : null;
    const today =
      clientTodayRaw && /^\d{4}-\d{2}-\d{2}$/.test(clientTodayRaw) ? clientTodayRaw : serverToday;
    const date = typeof req.query.date === "string" ? req.query.date : today;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
    }

    // Load user preferences
    const currentUser = await storage.getUser(userId);
    if (!currentUser?.calendarSuggestionsEnabled) {
      return res.json({ suggestions: [], disabled: true });
    }

    // Gate by look-back window: if the requested date is older than daysBack, skip.
    // Parse both dates explicitly as UTC midnight so the arithmetic is timezone-agnostic.
    const daysBack = currentUser.calendarSuggestionsDaysBack ?? 0;
    const requestedDate = new Date(`${date}T00:00:00Z`);
    const todayDate = new Date(`${today}T00:00:00Z`);
    const diffDays = Math.round(
      (todayDate.getTime() - requestedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays > daysBack) {
      return res.json({ suggestions: [], disabled: false });
    }

    try {
      const events = await getEventsForUser(userId, date, ssoRefreshToken);

      const [projects, userMappings, acceptedEventIds] = await Promise.all([
        storage.getProjects(tenantId),
        storage.getUserCalendarMappings(userId),
        storage.getAcceptedCalendarEventIds(userId, date),
      ]);

      const defaultProjectId = currentUser?.calendarDefaultProjectId ?? null;

      const suggestions = events.map(event => {
        const mapping = mapEventToProject(event, projects, userMappings, defaultProjectId);
        const hours = computeEventHours(event);
        const eventKey = buildEventKey(event);
        // Pass raw ISO strings to the client so the browser can format in the
        // user's local timezone.  Graph returns datetimes in UTC without a Z
        // suffix when no Prefer: outlook.timezone header is sent — append Z so
        // JavaScript Date parses them correctly as UTC.
        const toUtcIso = (dt: string) => dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z';
        const startIso = toUtcIso(event.start.dateTime);
        const endIso   = toUtcIso(event.end.dateTime);

        const attendees = (event.attendees ?? [])
          .map(a => ({
            name: a.emailAddress?.name ?? null,
            email: a.emailAddress?.address ?? null,
          }))
          .filter(a => a.email !== null)
          .map(a => ({ name: a.name, email: a.email as string }))
          .slice(0, 10);

        return {
          eventId: event.id,
          eventKey,
          subject: event.subject,
          startIso,
          endIso,
          hours,
          date,
          organizer: event.organizer?.emailAddress
            ? {
                name: event.organizer.emailAddress.name,
                email: event.organizer.emailAddress.address,
              }
            : null,
          attendees,
          attendeeCount: (event.attendees ?? []).length,
          bodyPreview: (event.bodyPreview ?? "").trim().slice(0, 500),
          seriesMasterId: event.seriesMasterId ?? null,
          type: event.type ?? "singleInstance",
          projectId: mapping.projectId,
          confidence: mapping.confidence,
          mappingReason: mapping.reason,
          alreadyAccepted: acceptedEventIds.has(event.id),
        };
      });

      const matchedCount = suggestions.filter(s => s.projectId !== null).length;
      console.log(
        `[CALENDAR_SUGGESTIONS] user=${userId} date=${date} total=${suggestions.length} matched=${matchedCount}`
      );

      return res.json({ suggestions, disabled: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Outlook not connected") ||
        message.includes("X_REPLIT_TOKEN") ||
        message.includes("no delegated token") ||
        message.includes("MSAL instance")
      ) {
        return res.json({ suggestions: [], disabled: false, outlookNotConnected: true });
      }
      console.error("[CALENDAR_SUGGESTIONS] Error fetching suggestions:", message);
      return res.status(500).json({ message: "Failed to fetch calendar suggestions" });
    }
  });

  /**
   * POST /api/me/calendar-suggestions/accept
   *
   * Accepts one or more calendar suggestion items, creates draft time entries,
   * and persists the event→project mapping for recurring event memory.
   *
   * Authorization: all accepted projectIds must belong to the authenticated
   * user's tenant before any entry is created.
   */
  app.post("/api/me/calendar-suggestions/accept", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const tenantId: string | null = req.user?.tenantId ?? null;

    const acceptSchema = z.object({
      items: z
        .array(
          z.object({
            eventId: z.string(),
            eventKey: z.string(),
            projectId: z.string(),
            hours: z.number().min(0.01).max(8),
            description: z.string().default(""),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            seriesMasterId: z.string().nullable().optional(),
            subject: z.string().nullable().optional(),
          })
        )
        .min(1),
    });

    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { items } = parsed.data;

    // Resolve all unique project IDs upfront and authorise them against the
    // user's tenant — reject any project that doesn't belong to this tenant.
    const uniqueProjectIds = [...new Set(items.map(i => i.projectId))];
    const projectMap = new Map<string, Awaited<ReturnType<typeof storage.getProject>>>();

    for (const projectId of uniqueProjectIds) {
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(422).json({ message: `Project not found: ${projectId}` });
      }
      if (tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({
          message: `Project ${projectId} does not belong to your organization`,
        });
      }
      projectMap.set(projectId, project);
    }

    // Collect unique dates across the batch so we can bulk-check for duplicates.
    const uniqueDates = [...new Set(items.map(i => i.date))];
    const acceptedByDate = new Map<string, Set<string>>();
    await Promise.all(
      uniqueDates.map(async d => {
        acceptedByDate.set(d, await storage.getAcceptedCalendarEventIds(userId, d));
      })
    );

    const created = [];
    const alreadyExists: string[] = [];
    const errors: string[] = [];

    for (const item of items) {
      // Guard against duplicate imports — if a time entry already exists for this
      // calendar event on this date, skip creation silently.
      const acceptedForDate = acceptedByDate.get(item.date);
      if (acceptedForDate?.has(item.eventId)) {
        alreadyExists.push(item.eventId);
        console.log(
          `[CALENDAR_SUGGESTIONS] user=${userId} skipped duplicate eventId=${item.eventId} date=${item.date}`
        );
        continue;
      }

      try {
        const timeEntry = await storage.createTimeEntry({
          personId: userId,
          projectId: item.projectId,
          date: item.date,
          hours: String(item.hours),
          description: item.description || "",
          billable: true,
          tenantId,
          fromCalendarSuggestion: true,
          calendarEventId: item.eventId,
        });

        created.push(timeEntry);

        // Persist recurring event memory so future suggestions auto-match
        await storage.upsertCalendarMapping(
          userId,
          tenantId,
          item.eventKey,
          item.projectId,
          item.subject ?? null,
        );

        console.log(
          `[CALENDAR_SUGGESTIONS] user=${userId} accepted eventId=${item.eventId} project=${item.projectId} entry=${timeEntry.id}`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CALENDAR_SUGGESTIONS] Error creating entry:", message);
        errors.push(`Failed to create entry for event "${item.eventId}": ${message}`);
      }
    }

    return res.status(201).json({
      created: created.length,
      total: items.length,
      entries: created,
      ...(alreadyExists.length > 0 ? { alreadyExists } : {}),
      ...(errors.length > 0 ? { errors } : {}),
    });
  });

  /**
   * POST /api/me/calendar-suggestions/merge
   *
   * Merges 2+ calendar events into a single draft time entry.  Hours are summed
   * (capped at 24), subjects are joined with " · ".  A calendar mapping is saved
   * for every source event so recurring events auto-match in the future.
   */
  app.post("/api/me/calendar-suggestions/merge", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const tenantId: string | null = req.user?.tenantId ?? null;

    const mergeSchema = z.object({
      items: z
        .array(
          z.object({
            eventId: z.string(),
            eventKey: z.string(),
            hours: z.number().min(0.01).max(8),
            description: z.string().default(""),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            seriesMasterId: z.string().nullable().optional(),
            subject: z.string().nullable().optional(),
          })
        )
        .min(2),
      projectId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().optional(),
    });

    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { items, projectId, date, description } = parsed.data;

    // Authorise project against caller's tenant.
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(422).json({ message: `Project not found: ${projectId}` });
    }
    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ message: "Project does not belong to your organization" });
    }

    // Sum hours, round to nearest quarter-hour, cap at 24.
    const rawTotal = items.reduce((sum, i) => sum + i.hours, 0);
    const totalHours = Math.min(24, Math.round(rawTotal * 4) / 4);

    const mergedDescription =
      description ??
      items
        .map(i => i.subject || i.description)
        .filter(Boolean)
        .join(" · ");

    try {
      const timeEntry = await storage.createTimeEntry({
        personId: userId,
        projectId,
        date,
        hours: String(totalHours),
        description: mergedDescription,
        billable: true,
        tenantId,
        fromCalendarSuggestion: true,
        calendarEventId: items[0].eventId,
      });

      // Persist mapping for every merged event so recurring ones auto-match next time.
      for (const item of items) {
        await storage.upsertCalendarMapping(
          userId,
          tenantId,
          item.eventKey,
          projectId,
          item.subject ?? null,
        );
      }

      console.log(
        `[CALENDAR_SUGGESTIONS] user=${userId} merged ${items.length} events → entry=${timeEntry.id} (${totalHours}h)`
      );
      return res.status(201).json({ created: 1, entryId: timeEntry.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CALENDAR_SUGGESTIONS] Merge error:", message);
      return res.status(500).json({ message: "Failed to create merged time entry" });
    }
  });

  /**
   * GET /api/me/calendar-mappings
   *
   * Returns the authenticated user's saved recurring-event → project mappings,
   * each enriched with project name + client name for display.
   */
  app.get("/api/me/calendar-mappings", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const tenantId: string | null = req.user?.tenantId ?? null;

    try {
      const [mappings, projects] = await Promise.all([
        storage.getUserCalendarMappings(userId),
        storage.getProjects(tenantId),
      ]);

      const projectMap = new Map(projects.map(p => [p.id, p]));

      const items = mappings.map(m => {
        const project = projectMap.get(m.projectId);
        return {
          eventKey: m.eventKey,
          projectId: m.projectId,
          projectName: project?.name ?? null,
          clientName: project?.client?.name ?? null,
          label: m.label,
          lastUsedAt: m.lastUsedAt,
          createdAt: m.createdAt,
        };
      });

      // Sort most recently used first
      items.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());

      return res.json({ mappings: items });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[CALENDAR_MAPPINGS] Error fetching mappings:", message);
      return res.status(500).json({ message: "Failed to fetch calendar mappings" });
    }
  });

  /**
   * PATCH /api/me/calendar-mappings/:eventKey
   * Update the project a saved mapping points to. The project must belong to
   * the authenticated user's tenant.
   */
  app.patch("/api/me/calendar-mappings/:eventKey", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const tenantId: string | null = req.user?.tenantId ?? null;
    const { eventKey } = req.params;

    const bodySchema = z.object({ projectId: z.string().min(1) });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { projectId } = parsed.data;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(422).json({ message: `Project not found: ${projectId}` });
    }
    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({
        message: `Project ${projectId} does not belong to your organization`,
      });
    }

    const updated = await storage.updateCalendarMappingProject(userId, eventKey, projectId);
    if (!updated) {
      return res.status(404).json({ message: "Mapping not found" });
    }

    console.log(
      `[CALENDAR_MAPPINGS] user=${userId} updated eventKey=${eventKey} -> project=${projectId}`
    );
    return res.json({ mapping: updated });
  });

  /**
   * DELETE /api/me/calendar-mappings/:eventKey
   * Remove a saved mapping. Future suggestions for this event will fall back
   * to heuristic matching.
   */
  app.delete("/api/me/calendar-mappings/:eventKey", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const { eventKey } = req.params;

    await storage.deleteCalendarMapping(userId, eventKey);
    console.log(`[CALENDAR_MAPPINGS] user=${userId} deleted eventKey=${eventKey}`);
    return res.status(204).end();
  });

  /**
   * POST /api/me/calendar-mappings/bulk-reassign
   * Reassign all (or a specific set of) saved mappings to a new project.
   * Body: { projectId: string, eventKeys?: string[] }
   * If eventKeys is omitted, ALL mappings for the user are updated.
   */
  app.post("/api/me/calendar-mappings/bulk-reassign", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const schema = z.object({
      projectId: z.string().min(1),
      eventKeys: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }
    const { projectId, eventKeys } = parsed.data;
    let count: number;
    if (eventKeys) {
      count = await storage.bulkReassignCalendarMappings(userId, eventKeys, projectId);
    } else {
      const all = await storage.getUserCalendarMappings(userId);
      count = await storage.bulkReassignCalendarMappings(userId, all.map(m => m.eventKey), projectId);
    }
    console.log(`[CALENDAR_MAPPINGS] user=${userId} bulk-reassigned ${count} mappings -> project=${projectId}`);
    return res.json({ updated: count });
  });

  /**
   * DELETE /api/me/calendar-mappings
   * Clear ALL saved calendar event→project mappings for the authenticated user.
   */
  app.delete("/api/me/calendar-mappings", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;
    const count = await storage.clearAllCalendarMappings(userId);
    console.log(`[CALENDAR_MAPPINGS] user=${userId} cleared all ${count} mappings`);
    return res.json({ deleted: count });
  });

  /**
   * POST /api/me/calendar-suggestions/telemetry
   * Records adoption telemetry events: shown, dismissed, manual_project_pick.
   * Fire-and-forget — the client does not wait for the response.
   */
  app.post("/api/me/calendar-suggestions/telemetry", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;

    const telemetrySchema = z.object({
      event: z.enum(["shown", "dismissed", "manual_project_pick"]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      suggestionCount: z.number().int().min(0).optional(),
      matchedCount: z.number().int().min(0).optional(),
      eventId: z.string().optional(),
    });

    const parsed = telemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid telemetry event" });
    }

    const { event, ...meta } = parsed.data;
    console.log(
      `[CALENDAR_SUGGESTIONS:TELEMETRY] user=${userId} event=${event}`,
      JSON.stringify(meta)
    );

    return res.json({ ok: true });
  });

  /**
   * PATCH /api/me/calendar-suggestions/settings
   * Update the authenticated user's calendar suggestion preferences.
   */
  app.patch("/api/me/calendar-suggestions/settings", deps.requireAuth, async (req, res) => {
    const userId: string = req.user!.id;

    const settingsSchema = z.object({
      calendarSuggestionsEnabled: z.boolean().optional(),
      calendarSuggestionsDaysBack: z.number().int().min(0).max(30).optional(),
      calendarDefaultProjectId: z.string().nullable().optional(),
    });

    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid settings", errors: parsed.error.errors });
    }

    const updates: Record<string, boolean | number | string | null> = {};
    if (parsed.data.calendarSuggestionsEnabled !== undefined) {
      updates.calendarSuggestionsEnabled = parsed.data.calendarSuggestionsEnabled;
    }
    if (parsed.data.calendarSuggestionsDaysBack !== undefined) {
      updates.calendarSuggestionsDaysBack = parsed.data.calendarSuggestionsDaysBack;
    }
    if (parsed.data.calendarDefaultProjectId !== undefined) {
      updates.calendarDefaultProjectId = parsed.data.calendarDefaultProjectId;
    }

    const updatedUser = await storage.updateUser(userId, updates);
    return res.json({
      calendarSuggestionsEnabled: updatedUser.calendarSuggestionsEnabled,
      calendarSuggestionsDaysBack: updatedUser.calendarSuggestionsDaysBack,
      calendarDefaultProjectId: (updatedUser as any).calendarDefaultProjectId ?? null,
    });
  });
}
