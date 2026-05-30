import type { OutlookCalendarEvent } from './outlook-client';
import type { Project, Client, UserCalendarMapping } from '@shared/schema';
import { createHash } from 'crypto';

export type MappingConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ProjectMapping {
  projectId: string | null;
  confidence: MappingConfidence;
  reason: string;
}

type ProjectWithClient = Project & { client: Client };

/**
 * Derive a stable event key for recurring-memory storage.
 * Uses seriesMasterId if present (best signal), otherwise a hash of subject + organiserEmail.
 */
export function buildEventKey(event: OutlookCalendarEvent): string {
  if (event.seriesMasterId) {
    return createHash('sha256').update(event.seriesMasterId).digest('hex').substring(0, 32);
  }
  const raw = `${(event.subject || '').toLowerCase().trim()}|${(event.organizer?.emailAddress?.address || '').toLowerCase()}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

/**
 * Compute hours from event start/end, capped at 8.
 */
export function computeEventHours(event: OutlookCalendarEvent): number {
  try {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.min(8, Math.max(0.25, Math.round(hours * 4) / 4));
  } catch {
    return 1;
  }
}

/**
 * Format start/end time for display (e.g. "9:00 AM – 10:00 AM").
 */
export function formatEventTime(event: OutlookCalendarEvent): string {
  try {
    const fmt = (dt: string) => new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${fmt(event.start.dateTime)} – ${fmt(event.end.dateTime)}`;
  } catch {
    return '';
  }
}

/**
 * Signal 1: Extract [ProjectCode] from event subject.
 * Matches any text in square brackets, e.g. "[ACME-2025]".
 */
function extractProjectCodeFromSubject(subject: string): string | null {
  const match = subject.match(/\[([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Signal 2: Keyword match against project name / client name / vocabulary.
 * Returns the best matching project or null.
 */
function keywordMatch(subject: string, projects: ProjectWithClient[]): ProjectWithClient | null {
  const subjectLower = subject.toLowerCase();
  let best: ProjectWithClient | null = null;
  let bestScore = 0;

  for (const project of projects) {
    let score = 0;
    const projectNameLower = project.name.toLowerCase();
    const clientNameLower = project.client?.name?.toLowerCase() || '';
    const codeL = project.code?.toLowerCase() || '';

    if (subjectLower.includes(projectNameLower)) score += 3;
    if (subjectLower.includes(clientNameLower) && clientNameLower.length > 3) score += 2;
    if (codeL && subjectLower.includes(codeL)) score += 4;

    if (score > bestScore) {
      bestScore = score;
      best = project;
    }
  }

  return bestScore >= 2 ? best : null;
}

/**
 * Signal 3: Attendee email domain match against client domain.
 * Extracts unique domains from attendees and organiser, then looks for a client
 * whose email domain appears in those domains.
 */
function domainMatch(event: OutlookCalendarEvent, projects: ProjectWithClient[]): ProjectWithClient | null {
  const attendeeEmails: string[] = [];
  if (event.organizer?.emailAddress?.address) attendeeEmails.push(event.organizer.emailAddress.address);
  for (const a of event.attendees || []) {
    if (a.emailAddress?.address) attendeeEmails.push(a.emailAddress.address);
  }

  const attendeeDomains = new Set(
    attendeeEmails.map(e => e.split('@')[1]?.toLowerCase()).filter(Boolean)
  );

  if (attendeeDomains.size === 0) return null;

  for (const project of projects) {
    const emailsToCheck = [
      project.client?.billingContact,
      project.client?.contactName,
    ].filter((v): v is string => typeof v === 'string' && v.includes('@'));

    for (const email of emailsToCheck) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain && attendeeDomains.has(domain)) {
        return project;
      }
    }
  }

  return null;
}

/**
 * Map an Outlook calendar event to the best matching project.
 * Priority order:
 *   1. Explicit [ProjectCode] tag in event subject
 *   2. Subject keyword match against project/client names
 *   3. Attendee email domain match against client domain
 *   4. Recurring event memory (lastUsed mapping)
 *   5. User's configured default fallback project
 */
export function mapEventToProject(
  event: OutlookCalendarEvent,
  projects: ProjectWithClient[],
  userMappings: UserCalendarMapping[],
  defaultProjectId?: string | null,
): ProjectMapping {
  const activeProjects = projects.filter(p => p.status === 'active');

  // Signal 1: [ProjectCode] tag
  const code = extractProjectCodeFromSubject(event.subject || '');
  if (code) {
    const codeLower = code.toLowerCase();
    const matched = activeProjects.find(p =>
      p.code?.toLowerCase() === codeLower || p.name?.toLowerCase() === codeLower
    );
    if (matched) {
      return { projectId: matched.id, confidence: 'high', reason: `Matched project code [${code}] in event title` };
    }
  }

  // Signal 2: Subject keyword match
  const kwMatch = keywordMatch(event.subject || '', activeProjects);
  if (kwMatch) {
    return { projectId: kwMatch.id, confidence: 'medium', reason: `Subject keyword matched "${kwMatch.name}"` };
  }

  // Signal 3: Attendee domain match
  const domMatch = domainMatch(event, activeProjects);
  if (domMatch) {
    return { projectId: domMatch.id, confidence: 'medium', reason: `Attendee domain matched client "${domMatch.client?.name}"` };
  }

  // Signal 4: Recurring memory
  const eventKey = buildEventKey(event);
  const memoryMapping = userMappings.find(m => m.eventKey === eventKey);
  if (memoryMapping) {
    const memProject = activeProjects.find(p => p.id === memoryMapping.projectId);
    if (memProject) {
      return { projectId: memProject.id, confidence: 'high', reason: `Remembered from previous mapping to "${memProject.name}"` };
    }
  }

  // Signal 5: User's configured default project
  if (defaultProjectId) {
    const defaultProject = activeProjects.find(p => p.id === defaultProjectId);
    if (defaultProject) {
      return { projectId: defaultProject.id, confidence: 'low', reason: `Default project "${defaultProject.name}"` };
    }
  }

  return { projectId: null, confidence: 'none', reason: 'No project match found' };
}
