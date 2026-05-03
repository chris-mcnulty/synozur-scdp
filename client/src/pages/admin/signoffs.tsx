import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface SignoffRow {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  action: string;
  comment: string | null;
  clientUserName: string;
  clientUserEmail: string | null;
  ipAddress: string | null;
  signedAt: string;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  signerName: string | null;
  signerEmail: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
  clientId?: string;
}

const ENTITY_TYPES = [
  { value: "all", label: "All entity types" },
  { value: "estimate", label: "Estimate" },
  { value: "project_milestone", label: "Milestone" },
  { value: "status_report", label: "Status Report" },
  { value: "sow", label: "Change Order" },
];

function entityLabel(type: string) {
  return ENTITY_TYPES.find((t) => t.value === type)?.label ?? type;
}

function actionBadge(action: string) {
  const cls: Record<string, string> = {
    approved: "text-green-700 border-green-500 bg-green-50 dark:bg-green-950/30",
    accepted: "text-green-700 border-green-500 bg-green-50 dark:bg-green-950/30",
    acknowledged: "text-blue-700 border-blue-500 bg-blue-50 dark:bg-blue-950/30",
    changes_requested: "text-yellow-700 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30",
    rejected: "text-red-700 border-red-500 bg-red-50 dark:bg-red-950/30",
  };
  return (
    <Badge variant="outline" className={cls[action] ?? ""}>
      {action.replace(/_/g, " ")}
    </Badge>
  );
}

export default function AdminSignoffsPage() {
  const [entityType, setEntityType] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [clientId, setClientId] = useState<string>("all");
  const [projectId, setProjectId] = useState<string>("all");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (entityType !== "all") p.set("entityType", entityType);
    if (startDate) p.set("startDate", startDate);
    if (endDate) p.set("endDate", endDate);
    if (clientId !== "all") p.set("clientId", clientId);
    if (projectId !== "all") p.set("projectId", projectId);
    return p.toString();
  }, [entityType, startDate, endDate, clientId, projectId]);

  const { data: signoffs = [], isLoading } = useQuery<SignoffRow[]>({
    queryKey: ["/api/embed/signoffs", entityType, startDate, endDate, clientId, projectId],
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch(`/api/embed/signoffs${queryParams ? `?${queryParams}` : ""}`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) throw new Error("Failed to load sign-offs");
      return res.json();
    },
  });

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["/api/clients"],
  });

  const { data: projectsData } = useQuery<any>({
    queryKey: ["/api/projects", "all-for-signoffs"],
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch(`/api/projects?pageSize=1000`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
  });

  const projects: ProjectOption[] = useMemo(() => {
    if (!projectsData) return [];
    if (Array.isArray(projectsData)) return projectsData;
    if (Array.isArray(projectsData.data)) return projectsData.data;
    if (Array.isArray(projectsData.projects)) return projectsData.projects;
    if (Array.isArray(projectsData.items)) return projectsData.items;
    return [];
  }, [projectsData]);

  const filteredProjects = useMemo(() => {
    if (clientId === "all") return projects;
    return projects.filter((p) => p.clientId === clientId);
  }, [projects, clientId]);

  const downloadCsv = async () => {
    const sessionId = localStorage.getItem("sessionId");
    const params = new URLSearchParams(queryParams);
    params.set("format", "csv");
    const res = await fetch(`/api/embed/signoffs?${params.toString()}`, {
      credentials: "include",
      headers: sessionId ? { "X-Session-Id": sessionId } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signoffs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setEntityType("all");
    setStartDate("");
    setEndDate("");
    setClientId("all");
    setProjectId("all");
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6" data-testid="page-admin-signoffs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileCheck2 className="h-7 w-7 text-primary" />
              Sign-off Audit Log
            </h1>
            <p className="text-muted-foreground mt-1">
              Complete history of client sign-offs across all projects in this tenant.
            </p>
          </div>
          <Button onClick={downloadCsv} variant="outline" data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Narrow down the audit log by entity, date, client, or project.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entityType">Entity Type</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger id="entityType" data-testid="select-entity-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">To</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId">Client</Label>
                <Select
                  value={clientId}
                  onValueChange={(v) => {
                    setClientId(v);
                    setProjectId("all");
                  }}
                >
                  <SelectTrigger id="clientId" data-testid="select-client">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectId">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="projectId" data-testid="select-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {filteredProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
                Reset filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign-offs ({signoffs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : signoffs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No sign-offs match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Signed At</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Signer</TableHead>
                      <TableHead>Comment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signoffs.map((row) => (
                      <TableRow key={row.id} data-testid={`row-signoff-${row.id}`}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {row.signedAt ? format(new Date(row.signedAt), "MMM d, yyyy HH:mm") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.entityName ?? row.entityId}</div>
                          <div className="text-xs text-muted-foreground">{entityLabel(row.entityType)}</div>
                        </TableCell>
                        <TableCell>{actionBadge(row.action)}</TableCell>
                        <TableCell>{row.clientName ?? "—"}</TableCell>
                        <TableCell>{row.projectName ?? "—"}</TableCell>
                        <TableCell>
                          <div className="text-sm">{row.clientUserName || row.signerName || "—"}</div>
                          {(row.clientUserEmail || row.signerEmail) && (
                            <div className="text-xs text-muted-foreground">
                              {row.clientUserEmail || row.signerEmail}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md">
                          {row.comment ? (
                            <div className="text-sm whitespace-pre-wrap">{row.comment}</div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
