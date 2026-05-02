import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatProjectLabel } from "@/lib/project-utils";
import { ChevronDown, ChevronRight, CheckCheck, X, Clock, Info, Sparkles, Users, UserCheck } from "lucide-react";
import type { Project, Client } from "@shared/schema";

type ProjectWithClient = Project & { client: Client };

interface CalendarSuggestion {
  eventId: string;
  eventKey: string;
  subject: string;
  timeRange: string;
  hours: number;
  date: string;
  organizer: { name: string | null; email: string } | null;
  attendees: { name: string | null; email: string }[];
  seriesMasterId: string | null;
  type: string;
  projectId: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  mappingReason: string;
}

interface CalendarSuggestionsResponse {
  suggestions: CalendarSuggestion[];
  disabled: boolean;
  outlookNotConnected?: boolean;
}

interface Props {
  date: string;
  projects: ProjectWithClient[];
  onEntriesCreated: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  none: 'bg-muted text-muted-foreground',
};

function fireAndForgetTelemetry(
  payload: { event: string; date?: string; suggestionCount?: number; matchedCount?: number; eventId?: string }
): void {
  const sessionId = localStorage.getItem('sessionId');
  fetch('/api/me/calendar-suggestions/telemetry', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(payload),
  }).catch(() => { /* fire-and-forget */ });
}

export function CalendarSuggestionsPanel({ date, projects, onEntriesCreated }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [projectOverrides, setProjectOverrides] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // changingEvents tracks rows where the user clicked "Change" on an auto-mapped
  // suggestion — keeps the project picker visible even when suggestion.projectId exists.
  const [changingEvents, setChangingEvents] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activeProjects = projects
    .filter(p => p.status === 'active')
    .map(p => ({ ...p, displayLabel: formatProjectLabel(p) }))
    .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));

  const { data, isLoading, error } = useQuery<CalendarSuggestionsResponse>({
    queryKey: ['/api/me/calendar-suggestions', date],
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/me/calendar-suggestions?date=${date}`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch calendar suggestions');
      return response.json();
    },
    retry: false,
  });

  // Telemetry: fire "shown" when suggestions are first loaded
  useEffect(() => {
    if (!data || data.disabled || data.outlookNotConnected) return;
    const visible = data.suggestions.filter(s => !dismissed.has(s.eventId));
    if (visible.length === 0) return;
    fireAndForgetTelemetry({
      event: 'shown',
      date,
      suggestionCount: visible.length,
      matchedCount: visible.filter(s => s.projectId !== null).length,
    });
    // Only fire once per date change — data is the dependency
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptMutation = useMutation({
    mutationFn: async (items: Array<{
      eventId: string;
      eventKey: string;
      projectId: string;
      hours: number;
      description: string;
      date: string;
      seriesMasterId?: string | null;
      subject?: string | null;
    }>) => {
      const response = await apiRequest("/api/me/calendar-suggestions/accept", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      return response;
    },
    onSuccess: (result: { created: number }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      const eventIds = variables.map(v => v.eventId);
      setDismissed(prev => new Set([...prev, ...eventIds]));
      toast({
        title: result.created === 1 ? "Time entry created" : `${result.created} time entries created`,
        description: "Review and submit when ready.",
      });
      onEntriesCreated();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create entries",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAcceptOne = (suggestion: CalendarSuggestion) => {
    const resolvedProjectId = projectOverrides[suggestion.eventId] || suggestion.projectId;
    if (!resolvedProjectId) {
      toast({
        title: "No project selected",
        description: "Please pick a project before accepting this suggestion.",
        variant: "destructive",
      });
      return;
    }
    acceptMutation.mutate([{
      eventId: suggestion.eventId,
      eventKey: suggestion.eventKey,
      projectId: resolvedProjectId,
      hours: suggestion.hours,
      description: suggestion.subject,
      date: suggestion.date,
      seriesMasterId: suggestion.seriesMasterId,
      subject: suggestion.subject,
    }]);
  };

  const handleAcceptAllMatched = () => {
    const toAccept = visibleSuggestions
      .filter(s => (projectOverrides[s.eventId] || s.projectId))
      .map(s => ({
        eventId: s.eventId,
        eventKey: s.eventKey,
        projectId: (projectOverrides[s.eventId] || s.projectId) as string,
        hours: s.hours,
        description: s.subject,
        date: s.date,
        seriesMasterId: s.seriesMasterId,
        subject: s.subject,
      }));

    if (toAccept.length === 0) {
      toast({ title: "No matched events", description: "Map events to projects first.", variant: "destructive" });
      return;
    }

    acceptMutation.mutate(toAccept);
  };

  const handleDismiss = (eventId: string) => {
    setDismissed(prev => new Set([...prev, eventId]));
    fireAndForgetTelemetry({ event: 'dismissed', date, eventId });
  };

  const handleManualProjectPick = (eventId: string, projectId: string) => {
    setProjectOverrides(prev => ({ ...prev, [eventId]: projectId }));
    fireAndForgetTelemetry({ event: 'manual_project_pick', date, eventId });
  };

  if (error || data?.outlookNotConnected) return null;
  if (data?.disabled) return null;

  const allSuggestions = data?.suggestions || [];
  const visibleSuggestions = allSuggestions.filter(s => !dismissed.has(s.eventId));

  if (!isLoading && visibleSuggestions.length === 0 && allSuggestions.length === 0) return null;

  const matchedCount = visibleSuggestions.filter(
    s => (projectOverrides[s.eventId] || s.projectId)
  ).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
        <CardHeader className="pb-2 pt-3 px-4">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer group">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Suggestions from Calendar
                </CardTitle>
                {!isLoading && visibleSuggestions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {visibleSuggestions.length} event{visibleSuggestions.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isLoading && matchedCount > 0 && isOpen && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptAllMatched();
                    }}
                    disabled={acceptMutation.isPending}
                  >
                    <CheckCheck className="w-3 h-3 mr-1" />
                    Accept all matched ({matchedCount})
                  </Button>
                )}
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : visibleSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No calendar events found for this day.
              </p>
            ) : (
              <div className="space-y-2">
                {visibleSuggestions.map(suggestion => {
                  const isChanging = changingEvents.has(suggestion.eventId);
                  // Only use the override/auto-match as the resolved project when the
                  // user is NOT actively choosing a new project for this row.
                  const resolvedProjectId = isChanging
                    ? (projectOverrides[suggestion.eventId] ?? null)
                    : (projectOverrides[suggestion.eventId] || suggestion.projectId);
                  const resolvedProject = resolvedProjectId
                    ? activeProjects.find(p => p.id === resolvedProjectId)
                    : null;
                  // Show the picker when either: no project matched/overridden yet, or
                  // the user clicked "Change" on an already-mapped row.
                  const showPicker = isChanging || !resolvedProject;

                  const organizerName = suggestion.organizer?.name || suggestion.organizer?.email || null;
                  const attendeeCount = suggestion.attendees.length;
                  const externalAttendees = suggestion.attendees.filter(
                    a => a.email && !a.email.endsWith(suggestion.organizer?.email?.split('@')[1] ?? '__none__')
                  );

                  return (
                    <div
                      key={suggestion.eventId}
                      className="flex items-start gap-3 p-3 bg-background rounded-lg border border-border/50"
                    >
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Subject + time */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate max-w-[200px]" title={suggestion.subject}>
                            {suggestion.subject}
                          </span>
                          <div className="flex items-center gap-1 text-muted-foreground text-xs shrink-0">
                            <Clock className="w-3 h-3" />
                            {suggestion.timeRange}
                            <span className="ml-1">({suggestion.hours}h)</span>
                          </div>
                        </div>

                        {/* Row 2: Organizer + attendees */}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {organizerName && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <UserCheck className="w-3 h-3 shrink-0" />
                              <span className="truncate max-w-[160px]">{organizerName}</span>
                            </div>
                          )}
                          {attendeeCount > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                                    <Users className="w-3 h-3 shrink-0" />
                                    <span>{attendeeCount} attendee{attendeeCount !== 1 ? 's' : ''}</span>
                                    {externalAttendees.length > 0 && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-0.5">
                                        {externalAttendees.length} external
                                      </Badge>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px]">
                                  <ul className="text-xs space-y-0.5">
                                    {suggestion.attendees.slice(0, 8).map((a, i) => (
                                      <li key={i} className="truncate">{a.name || a.email}</li>
                                    ))}
                                    {suggestion.attendees.length > 8 && (
                                      <li className="text-muted-foreground">
                                        +{suggestion.attendees.length - 8} more
                                      </li>
                                    )}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>

                        {/* Row 3: Project badge / picker */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {!showPicker && resolvedProject ? (
                            <div className="flex items-center gap-1.5">
                              <Badge
                                className={`text-xs px-2 py-0 ${CONFIDENCE_COLORS[suggestion.projectId === resolvedProjectId && !projectOverrides[suggestion.eventId] ? suggestion.confidence : 'medium']}`}
                              >
                                {resolvedProject.displayLabel}
                              </Badge>
                              {suggestion.confidence !== 'none' && suggestion.projectId === resolvedProjectId && !projectOverrides[suggestion.eventId] && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      <p className="text-xs">{suggestion.mappingReason}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2 text-muted-foreground"
                                onClick={() => {
                                  setChangingEvents(prev => new Set([...prev, suggestion.eventId]));
                                }}
                              >
                                Change
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Select
                                value={projectOverrides[suggestion.eventId] || ""}
                                onValueChange={value => {
                                  handleManualProjectPick(suggestion.eventId, value);
                                  setChangingEvents(prev => {
                                    const next = new Set(prev);
                                    next.delete(suggestion.eventId);
                                    return next;
                                  });
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs w-48 border-dashed">
                                  <SelectValue placeholder="Pick project…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeProjects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.displayLabel}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isChanging && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs px-2 text-muted-foreground"
                                  onClick={() => {
                                    setChangingEvents(prev => {
                                      const next = new Set(prev);
                                      next.delete(suggestion.eventId);
                                      return next;
                                    });
                                  }}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          )}
                        </div>

                        {showPicker && !isChanging && projectOverrides[suggestion.eventId] === undefined && (
                          <p className="text-xs text-muted-foreground mt-1">
                            No project matched — pick one to accept this event
                          </p>
                        )}
                      </div>

                      {/* Accept / Dismiss actions */}
                      <div className="flex gap-1 shrink-0 mt-0.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleAcceptOne(suggestion)}
                                disabled={acceptMutation.isPending || !resolvedProjectId}
                              >
                                <CheckCheck className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Use as time entry</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDismiss(suggestion.eventId)}
                                disabled={acceptMutation.isPending}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Dismiss</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
