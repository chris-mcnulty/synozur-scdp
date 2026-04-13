import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ExternalLink,
  Unlink,
  RefreshCw,
  Search,
  Building2,
  FolderOpen,
  FileText,
  AlertTriangle,
  Link2,
  Link2Off,
} from "lucide-react";
import { MicrosoftTeamsIcon } from "@/components/icons/microsoft-icons";

interface TeamLink {
  teamId: string;
  teamName: string | null;
  teamWebUrl: string | null;
  source: "client_teams" | "legacy";
}

interface ProjectLink {
  id: string;
  name: string;
  code: string | null;
  clientId: string | null;
  status: string | null;
  channelId: string | null;
  channelName: string | null;
  channelWebUrl: string | null;
  plannerPlanId: string | null;
  plannerPlanWebUrl: string | null;
}

interface EstimateLink {
  id: string;
  name: string;
  clientId: string | null;
  status: string | null;
  teamId: string | null;
  teamName: string | null;
  channelId: string | null;
  channelName: string | null;
  channelWebUrl: string | null;
}

interface ClientGroup {
  clientId: string;
  clientName: string;
  team: TeamLink | null;
  projects: ProjectLink[];
  estimates: EstimateLink[];
}

interface TeamsLinksResponse {
  groups: ClientGroup[];
  orphanProjects: ProjectLink[];
  orphanEstimates: EstimateLink[];
}

type PendingAction =
  | { type: "unlinkClientTeam"; clientId: string; clientName: string }
  | { type: "unlinkProjectChannel"; projectId: string; projectName: string }
  | { type: "unlinkEstimateChannel"; estimateId: string; estimateName: string };

export function TeamsLinksTab() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  const { data, isLoading, error } = useQuery<TeamsLinksResponse>({
    queryKey: ["/api/org/teams-links"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/org/teams-links"] });
  };

  const unlinkClientTeam = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest(`/api/clients/${clientId}/microsoft-team`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Client unlinked from Team" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ title: "Failed to unlink team", description: e.message, variant: "destructive" }),
  });

  const unlinkProjectChannel = useMutation({
    mutationFn: (projectId: string) =>
      apiRequest(`/api/projects/${projectId}/channel`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Project channel unlinked" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ title: "Failed to unlink channel", description: e.message, variant: "destructive" }),
  });

  const unlinkEstimateChannel = useMutation({
    mutationFn: (estimateId: string) =>
      apiRequest(`/api/estimates/${estimateId}/channel`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Estimate channel unlinked" });
      invalidate();
    },
    onError: (e: Error) =>
      toast({ title: "Failed to unlink channel", description: e.message, variant: "destructive" }),
  });

  const confirmAction = () => {
    if (!pending) return;
    if (pending.type === "unlinkClientTeam") unlinkClientTeam.mutate(pending.clientId);
    if (pending.type === "unlinkProjectChannel") unlinkProjectChannel.mutate(pending.projectId);
    if (pending.type === "unlinkEstimateChannel") unlinkEstimateChannel.mutate(pending.estimateId);
    setPending(null);
  };

  const filteredGroups = useMemo(() => {
    if (!data?.groups) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter((g) => {
      if (g.clientName?.toLowerCase().includes(q)) return true;
      if (g.team?.teamName?.toLowerCase().includes(q)) return true;
      if (g.projects.some((p) => p.name?.toLowerCase().includes(q) || p.channelName?.toLowerCase().includes(q))) return true;
      if (g.estimates.some((e) => e.name?.toLowerCase().includes(q) || e.channelName?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [data, search]);

  const totalClients = data?.groups.length ?? 0;
  const clientsWithTeam = data?.groups.filter((g) => g.team).length ?? 0;
  const linkedProjects = data?.groups.reduce((acc, g) => acc + g.projects.filter((p) => p.channelId).length, 0) ?? 0;
  const linkedEstimates = data?.groups.reduce((acc, g) => acc + g.estimates.filter((e) => e.channelId).length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MicrosoftTeamsIcon className="h-5 w-5" />
            Teams & Channels Overview
          </CardTitle>
          <CardDescription>
            View all Microsoft Teams, projects, and estimate channel links grouped by client. You can unlink or
            re-create any connection here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Clients" value={totalClients} />
            <StatCard label="Clients with Team" value={clientsWithTeam} />
            <StatCard label="Linked Projects" value={linkedProjects} />
            <StatCard label="Linked Estimates" value={linkedEstimates} />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by client, team, project, estimate, or channel name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-teams-links-search"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {search ? "No matching clients, projects, or estimates." : "No clients found for this tenant."}
            </div>
          ) : (
            <Accordion type="multiple" className="w-full border rounded-md">
              {filteredGroups.map((group) => (
                <ClientGroupRow
                  key={group.clientId}
                  group={group}
                  navigate={setLocation}
                  onUnlinkTeam={() =>
                    setPending({
                      type: "unlinkClientTeam",
                      clientId: group.clientId,
                      clientName: group.clientName,
                    })
                  }
                  onUnlinkProjectChannel={(p) =>
                    setPending({
                      type: "unlinkProjectChannel",
                      projectId: p.id,
                      projectName: p.name,
                    })
                  }
                  onUnlinkEstimateChannel={(e) =>
                    setPending({
                      type: "unlinkEstimateChannel",
                      estimateId: e.id,
                      estimateName: e.name,
                    })
                  }
                />
              ))}
            </Accordion>
          )}

          {(data?.orphanProjects.length ?? 0) > 0 || (data?.orphanEstimates.length ?? 0) > 0 ? (
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Unassigned (no matching client)</h4>
              <div className="space-y-2 border rounded-md p-3">
                {data?.orphanProjects.map((p) => (
                  <ProjectRow
                    key={`orphan-proj-${p.id}`}
                    project={p}
                    navigate={setLocation}
                    onUnlink={() =>
                      setPending({ type: "unlinkProjectChannel", projectId: p.id, projectName: p.name })
                    }
                  />
                ))}
                {data?.orphanEstimates.map((e) => (
                  <EstimateRow
                    key={`orphan-est-${e.id}`}
                    estimate={e}
                    navigate={setLocation}
                    onUnlink={() =>
                      setPending({ type: "unlinkEstimateChannel", estimateId: e.id, estimateName: e.name })
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Unlink</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === "unlinkClientTeam" && (
                <>This will unlink the Microsoft Team from <strong>{pending.clientName}</strong>. The Team in
                Microsoft 365 will not be deleted — only the Constellation link is removed. You can re-link or
                re-create it afterwards.</>
              )}
              {pending?.type === "unlinkProjectChannel" && (
                <>This will remove the channel link from project <strong>{pending.projectName}</strong>. The
                channel itself remains in Teams. You can re-create a channel connection from the project page.</>
              )}
              {pending?.type === "unlinkEstimateChannel" && (
                <>This will remove the channel link from estimate <strong>{pending.estimateName}</strong>. The
                channel itself remains in Teams. You can re-create a channel connection from the estimate page.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-teams-links-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction} data-testid="button-teams-links-confirm-unlink">
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ClientGroupRow({
  group,
  navigate,
  onUnlinkTeam,
  onUnlinkProjectChannel,
  onUnlinkEstimateChannel,
}: {
  group: ClientGroup;
  navigate: (to: string) => void;
  onUnlinkTeam: () => void;
  onUnlinkProjectChannel: (p: ProjectLink) => void;
  onUnlinkEstimateChannel: (e: EstimateLink) => void;
}) {
  const hasAnyLink =
    !!group.team ||
    group.projects.some((p) => p.channelId) ||
    group.estimates.some((e) => e.channelId);

  return (
    <AccordionItem value={group.clientId} className="border-b last:border-b-0">
      <AccordionTrigger className="px-4 hover:no-underline" data-testid={`row-client-${group.clientId}`}>
        <div className="flex items-center justify-between gap-3 w-full pr-2">
          <div className="flex items-center gap-2 text-left">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{group.clientName}</span>
            {group.team ? (
              <Badge variant="secondary" className="ml-2 gap-1">
                <Link2 className="h-3 w-3" />
                Team linked
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2 gap-1 text-muted-foreground">
                <Link2Off className="h-3 w-3" />
                No Team
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{group.projects.length} proj</span>
            <span>•</span>
            <span>{group.estimates.length} est</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0 space-y-4">
        {/* Team row */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-md bg-muted/40">
          <MicrosoftTeamsIcon className="h-4 w-4" />
          <span className="text-sm font-medium flex-1 min-w-[180px]">
            {group.team ? (
              <>
                {group.team.teamName || <span className="text-muted-foreground italic">Unnamed Team</span>}
                {group.team.source === "legacy" && (
                  <Badge variant="outline" className="ml-2 text-[10px]">legacy</Badge>
                )}
              </>
            ) : (
              <span className="text-muted-foreground italic">No Team linked to this client</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {group.team?.teamWebUrl && (
              <Button
                asChild
                variant="outline"
                size="sm"
                data-testid={`link-open-team-${group.clientId}`}
              >
                <a href={group.team.teamWebUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                </a>
              </Button>
            )}
            {group.team ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onUnlinkTeam}
                data-testid={`button-unlink-team-${group.clientId}`}
              >
                <Unlink className="h-3.5 w-3.5 mr-1" /> Unlink
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/clients/${group.clientId}`)}
                data-testid={`button-link-team-${group.clientId}`}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Link Team
              </Button>
            )}
          </div>
        </div>

        {/* Projects */}
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Projects ({group.projects.length})
          </h5>
          {group.projects.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">No projects for this client.</div>
          ) : (
            <div className="space-y-1">
              {group.projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  navigate={navigate}
                  onUnlink={() => onUnlinkProjectChannel(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Estimates */}
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Estimates ({group.estimates.length})
          </h5>
          {group.estimates.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">No estimates for this client.</div>
          ) : (
            <div className="space-y-1">
              {group.estimates.map((e) => (
                <EstimateRow
                  key={e.id}
                  estimate={e}
                  navigate={navigate}
                  onUnlink={() => onUnlinkEstimateChannel(e)}
                />
              ))}
            </div>
          )}
        </div>

        {!hasAnyLink && (
          <div className="text-xs text-muted-foreground italic">
            No Teams connections yet for this client.
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function ProjectRow({
  project,
  navigate,
  onUnlink,
}: {
  project: ProjectLink;
  navigate: (to: string) => void;
  onUnlink: () => void;
}) {
  const linked = !!project.channelId;
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded border bg-background">
      <FolderOpen className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-[160px]">
        <div className="text-sm font-medium">
          {project.name}
          {project.code && (
            <span className="text-xs text-muted-foreground ml-2">({project.code})</span>
          )}
        </div>
        {linked ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            Channel: {project.channelName || project.channelId}
            {project.plannerPlanId && <span className="ml-2">• Planner plan linked</span>}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No channel linked</div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {linked && project.channelWebUrl && (
          <Button asChild variant="ghost" size="sm" data-testid={`link-open-project-channel-${project.id}`}>
            <a href={project.channelWebUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </a>
          </Button>
        )}
        {linked && (
          <Button variant="ghost" size="sm" onClick={onUnlink} data-testid={`button-unlink-project-${project.id}`}>
            <Unlink className="h-3.5 w-3.5 mr-1" /> Unlink
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${project.id}`)}
          data-testid={`button-relink-project-${project.id}`}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          {linked ? "Re-link" : "Link"}
        </Button>
      </div>
    </div>
  );
}

function EstimateRow({
  estimate,
  navigate,
  onUnlink,
}: {
  estimate: EstimateLink;
  navigate: (to: string) => void;
  onUnlink: () => void;
}) {
  const linked = !!estimate.channelId;
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded border bg-background">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-[160px]">
        <div className="text-sm font-medium">{estimate.name}</div>
        {linked ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            {estimate.teamName ? `${estimate.teamName} / ` : ""}
            {estimate.channelName || estimate.channelId}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No channel linked</div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {linked && estimate.channelWebUrl && (
          <Button asChild variant="ghost" size="sm" data-testid={`link-open-estimate-channel-${estimate.id}`}>
            <a href={estimate.channelWebUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </a>
          </Button>
        )}
        {linked && (
          <Button variant="ghost" size="sm" onClick={onUnlink} data-testid={`button-unlink-estimate-${estimate.id}`}>
            <Unlink className="h-3.5 w-3.5 mr-1" /> Unlink
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/estimates/${estimate.id}`)}
          data-testid={`button-relink-estimate-${estimate.id}`}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          {linked ? "Re-link" : "Link"}
        </Button>
      </div>
    </div>
  );
}
