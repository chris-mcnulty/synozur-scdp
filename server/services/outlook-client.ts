import { Client } from '@microsoft/microsoft-graph-client';

// ─── Connector token (shared service-level Outlook connection) ─────────────────
// This is used only as a fallback and is intentionally NOT used for per-user
// calendar data to avoid cross-user data exposure. See getEventsForUser().

async function getConnectorAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        Accept: 'application/json',
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then(res => res.json())
    .then(data => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Outlook not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableOutlookClient(): Promise<Client> {
  const accessToken = await getConnectorAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken,
    },
  });
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export interface OutlookCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer?: { emailAddress: { name: string; address: string } };
  attendees?: Array<{ emailAddress: { name: string; address: string }; type: string }>;
  seriesMasterId?: string;
  type?: string; // 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster'
  isAllDay?: boolean;
  isCancelled?: boolean;
  recurrence?: unknown;
  bodyPreview?: string;
}

// Per-user, per-date cache. Key: `userId:date`
const eventCache = new Map<string, { events: OutlookCalendarEvent[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const CALENDAR_FIELDS =
  'id,subject,start,end,organizer,attendees,seriesMasterId,type,isAllDay,isCancelled,recurrence,bodyPreview';

/**
 * Fetch calendar events for a given user and date.
 *
 * Uses the user's own delegated Azure AD token (via ssoRefreshToken) so that
 * each user only sees their own calendar. Results are cached per userId+date.
 *
 * @param userId         - Internal user ID (used as cache key only)
 * @param date           - ISO date string YYYY-MM-DD
 * @param ssoRefreshToken - User's Azure AD refresh token from the session
 */
export async function getEventsForUser(
  userId: string,
  date: string,
  ssoRefreshToken: string | null | undefined
): Promise<OutlookCalendarEvent[]> {
  const cacheKey = `${userId}:${date}`;
  const cached = eventCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.events;
  }

  // Obtain a delegated Calendars.Read access token for this specific user.
  // If the user has no SSO refresh token, the calendar feature cannot function
  // in a user-scoped way — throw rather than silently return shared-account data.
  if (!ssoRefreshToken) {
    throw new Error('Outlook not connected: no delegated token available for this user');
  }

  const { msalInstance } = await import('../auth/entra-config.js');
  if (!msalInstance) {
    throw new Error('Outlook not connected: MSAL instance not configured');
  }

  const tokenResult = await msalInstance.acquireTokenByRefreshToken({
    refreshToken: ssoRefreshToken,
    scopes: ['Calendars.Read'],
  });

  if (!tokenResult?.accessToken) {
    throw new Error('Outlook not connected: could not acquire Calendars.Read token');
  }

  const client = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => tokenResult.accessToken,
    },
  });

  const startDateTime = `${date}T00:00:00`;
  const endDateTime = `${date}T23:59:59`;

  const result = await client
    .api('/me/calendarView')
    .query({
      startDateTime,
      endDateTime,
      $select: CALENDAR_FIELDS,
      $top: 50,
      $orderby: 'start/dateTime',
    })
    .get();

  const events: OutlookCalendarEvent[] = (result?.value || []).filter(
    (e: OutlookCalendarEvent) => !e.isCancelled && !e.isAllDay
  );

  eventCache.set(cacheKey, { events, fetchedAt: Date.now() });
  return events;
}

export function clearEventCache(userId?: string, date?: string): void {
  if (userId && date) {
    eventCache.delete(`${userId}:${date}`);
  } else if (userId) {
    for (const key of eventCache.keys()) {
      if (key.startsWith(`${userId}:`)) eventCache.delete(key);
    }
  } else {
    eventCache.clear();
  }
}
