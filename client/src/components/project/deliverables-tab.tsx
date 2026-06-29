import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEmbed } from "@/hooks/use-embed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Sparkles, MoreHorizontal, Pencil, Trash2, History, Clock, CheckCircle2, CircleDot, Eye, XCircle, Loader2, CalendarClock, AlertTriangle, ArrowRight } from "lucide-react";
import type { ProjectDeliverable } from "@shared/schema";

// Parse a YYYY-MM-DD string into a UTC date-only value (timezone-safe).
function toDateOnly(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return isNaN(dt.getTime()) ? null : dt;
}

function addDaysISO(iso: string, days: number): string {
  const base = toDateOnly(iso);
  if (!base) return iso;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().split("T")[0];
}

function daysBetweenISO(a: string, b: string): number {
  const da = toDateOnly(a);
  const db = toDateOnly(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function fmtDate(iso?: string | null): string {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString() : "—";
}

interface DeliverablesTabProps {
  projectId: string;
  projectTeamMembers: { id: string; name: string }[];
}

const STATUS_OPTIONS = [
  { value: "not-started", label: "Not Started", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "in-progress", label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "in-review", label: "In Review", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  { value: "accepted", label: "Accepted", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
];

function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return <Badge variant="outline" className={opt.color}>{opt.label}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "in-progress": return <CircleDot className="h-4 w-4 text-blue-500" />;
    case "in-review": return <Eye className="h-4 w-4 text-amber-500" />;
    case "accepted": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "rejected": return <XCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

export function DeliverablesTab({ projectId, projectTeamMembers }: DeliverablesTabProps) {
  const { toast } = useToast();
  const { isReadonly: embedReadonly } = useEmbed();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [editingDeliverable, setEditingDeliverable] = useState<(ProjectDeliverable & { ownerName?: string }) | null>(null);
  const [historyDeliverableId, setHistoryDeliverableId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formStatus, setFormStatus] = useState("not-started");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formDeliveredDate, setFormDeliveredDate] = useState("");
  const [formAcceptanceNotes, setFormAcceptanceNotes] = useState("");
  const [formEpicId, setFormEpicId] = useState<string>("none");
  const [formStageId, setFormStageId] = useState<string>("none");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushAnchorId, setPushAnchorId] = useState<string>("");
  const [pushNewDate, setPushNewDate] = useState<string>("");

  const [narrativeText, setNarrativeText] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [candidateOwners, setCandidateOwners] = useState<Record<number, string>>({});
  const [isExtracting, setIsExtracting] = useState(false);

  const { data: deliverables = [], isLoading } = useQuery<(ProjectDeliverable & { ownerName?: string })[]>({
    queryKey: ['/api/projects', projectId, 'deliverables'],
    queryFn: () => fetch(`/api/projects/${projectId}/deliverables`, {
      headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" },
    }).then(r => r.json()),
  });

  const { data: allUsers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/users'],
  });

  const { data: epics = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/projects', projectId, 'epics'],
    queryFn: () => fetch(`/api/projects/${projectId}/epics`, {
      headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" },
    }).then(r => r.json()),
  });

  const { data: stages = [] } = useQuery<{ id: string; name: string; epicId: string }[]>({
    queryKey: ['/api/projects', projectId, 'stages'],
    queryFn: () => fetch(`/api/projects/${projectId}/stages`, {
      headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" },
    }).then(r => r.json()),
  });

  const { data: milestones = [] } = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'milestones'],
    queryFn: () => fetch(`/api/projects/${projectId}/milestones`, {
      headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" },
    }).then(r => r.json()),
  });

  const teamMembers = projectTeamMembers.length > 0 ? projectTeamMembers : allUsers;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/projects/${projectId}/deliverables`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'deliverables'] });
      toast({ title: "Deliverable created" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Failed to create deliverable", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest(`/api/projects/${projectId}/deliverables/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'deliverables'] });
      toast({ title: "Deliverable updated" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Failed to update deliverable", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/projects/${projectId}/deliverables/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'deliverables'] });
      toast({ title: "Deliverable deleted" });
    },
    onError: (err: any) => toast({ title: "Failed to delete deliverable", description: err.message, variant: "destructive" }),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/projects/${projectId}/deliverables/bulk`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'deliverables'] });
      toast({ title: `${data.created} deliverable(s) added` });
      setShowExtractDialog(false);
      setCandidates([]);
      setSelectedCandidates(new Set());
      setCandidateOwners({});
      setNarrativeText("");
    },
    onError: (err: any) => toast({ title: "Failed to create deliverables", description: err.message, variant: "destructive" }),
  });

  const bulkShiftMutation = useMutation({
    mutationFn: (data: { deliverableIds: string[]; deltaDays: number }) =>
      apiRequest(`/api/projects/${projectId}/deliverables/bulk-shift-dates`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'deliverables'] });
      toast({ title: `${res.affectedCount} deliverable(s) pushed out` });
      closePushDialog();
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast({ title: "Failed to push dates", description: err.message, variant: "destructive" }),
  });

  function closeDialog() {
    setShowAddDialog(false);
    setEditingDeliverable(null);
    setFormName("");
    setFormDescription("");
    setFormOwner("");
    setFormStatus("not-started");
    setFormTargetDate("");
    setFormDeliveredDate("");
    setFormAcceptanceNotes("");
    setFormEpicId("none");
    setFormStageId("none");
  }

  function openEdit(d: ProjectDeliverable & { ownerName?: string }) {
    setEditingDeliverable(d);
    setFormName(d.name);
    setFormDescription(d.description || "");
    setFormOwner(d.ownerUserId);
    setFormStatus(d.status);
    setFormTargetDate(d.targetDate || "");
    setFormDeliveredDate(d.deliveredDate || "");
    setFormAcceptanceNotes(d.acceptanceNotes || "");
    setFormEpicId(d.epicId || "none");
    setFormStageId(d.stageId || "none");
    setShowAddDialog(true);
  }

  const epicName = (epicId?: string | null) => epics.find(e => e.id === epicId)?.name || null;

  // A non-payment (delivery) milestone tied to an epic is that phase's deadline.
  // If several exist, the latest target date is the phase's final deadline.
  const phaseMilestoneForEpic = (epicId?: string | null) => {
    if (!epicId) return null;
    const matches = milestones
      .filter((m: any) => m.projectEpicId === epicId && !m.isPaymentMilestone && m.targetDate)
      .sort((a: any, b: any) => daysBetweenISO(a.targetDate, b.targetDate));
    return matches.length ? matches[matches.length - 1] : null;
  };

  function openPushDialog(ids: Set<string>) {
    if (ids.size === 0) return;
    setSelectedIds(ids);
    const dated = deliverables
      .filter(d => ids.has(d.id) && d.targetDate)
      .sort((a, b) => (a.targetDate! < b.targetDate! ? -1 : 1));
    const anchor = dated[0];
    setPushAnchorId(anchor?.id || "");
    setPushNewDate(anchor?.targetDate || "");
    setShowPushDialog(true);
  }

  function closePushDialog() {
    setShowPushDialog(false);
    setPushAnchorId("");
    setPushNewDate("");
  }

  function pushEntirePhase(epicId: string) {
    const ids = new Set(deliverables.filter(d => d.epicId === epicId).map(d => d.id));
    if (ids.size === 0) {
      toast({ title: "No deliverables in that phase yet", variant: "destructive" });
      return;
    }
    openPushDialog(ids);
  }

  function handleSave() {
    if (!formName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!formOwner) {
      toast({ title: "Owner is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      ownerUserId: formOwner,
      status: formStatus,
      targetDate: formTargetDate || null,
      deliveredDate: formDeliveredDate || null,
      acceptanceNotes: formAcceptanceNotes.trim() || null,
      epicId: formEpicId === "none" ? null : formEpicId,
      stageId: formStageId === "none" ? null : formStageId,
    };
    if (editingDeliverable) {
      updateMutation.mutate({ id: editingDeliverable.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handleExtract() {
    if (!narrativeText.trim()) {
      toast({ title: "Paste a project narrative to extract deliverables", variant: "destructive" });
      return;
    }
    setIsExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/deliverables/ai-extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        },
        body: JSON.stringify({ narrative: narrativeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const newOnly = (data.candidates || []).filter((c: any) => c.isNew !== false);
      setCandidates(newOnly);
      setSelectedCandidates(new Set(newOnly.map((_: any, i: number) => i)));
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  }

  function handleAddSelected() {
    const selected = candidates.filter((_, i) => selectedCandidates.has(i));
    const missing = selected.filter((_, i) => {
      const idx = candidates.indexOf(selected[0]) + i;
      return !candidateOwners[Array.from(selectedCandidates)[i]];
    });
    const allHaveOwners = Array.from(selectedCandidates).every(idx => candidateOwners[idx]);
    if (!allHaveOwners) {
      toast({ title: "Every deliverable needs an owner", variant: "destructive" });
      return;
    }
    const toCreate = Array.from(selectedCandidates).map(idx => ({
      name: candidates[idx].name,
      description: candidates[idx].description,
      ownerUserId: candidateOwners[idx],
    }));
    bulkCreateMutation.mutate({ deliverables: toCreate });
  }

  const filtered = statusFilter === "all" ? deliverables : deliverables.filter(d => d.status === statusFilter);

  const counts = {
    total: deliverables.length,
    accepted: deliverables.filter(d => d.status === "accepted").length,
    inProgress: deliverables.filter(d => d.status === "in-progress").length,
    overdue: deliverables.filter(d => d.targetDate && d.status !== "accepted" && d.status !== "rejected" && new Date(d.targetDate) < new Date()).length,
  };

  const epicsWithDeliverables = epics.filter(e => deliverables.some(d => d.epicId === e.id));

  const pushAnchor = deliverables.find(d => d.id === pushAnchorId);
  const pushDelta = pushAnchor?.targetDate && pushNewDate
    ? daysBetweenISO(pushAnchor.targetDate, pushNewDate)
    : 0;
  const pushPreview = deliverables
    .filter(d => selectedIds.has(d.id))
    .map(d => {
      const newDate = d.targetDate ? addDaysISO(d.targetDate, pushDelta) : null;
      const ms = phaseMilestoneForEpic(d.epicId);
      const breachesMilestone = !!(newDate && ms?.targetDate && newDate > ms.targetDate);
      return { d, newDate, ms, breachesMilestone };
    });
  const pushWarnings = pushPreview.filter(p => p.breachesMilestone);
  const pushNoDateCount = pushPreview.filter(p => !p.d.targetDate).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Project Deliverables</CardTitle>
              <CardDescription>Track tangible outputs, documents, and work products</CardDescription>
            </div>
            {!embedReadonly && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCandidates([]); setSelectedCandidates(new Set()); setCandidateOwners({}); setShowExtractDialog(true); }}>
                <Sparkles className="h-4 w-4 mr-1" /> Extract from Narrative
              </Button>
              <Button size="sm" onClick={() => { closeDialog(); setShowAddDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Deliverable
              </Button>
            </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {counts.total > 0 && (
            <div className="flex gap-4 mb-4 text-sm">
              <span className="text-muted-foreground">{counts.total} total</span>
              <span className="text-green-600 dark:text-green-400">{counts.accepted} accepted</span>
              <span className="text-blue-600 dark:text-blue-400">{counts.inProgress} in progress</span>
              {counts.overdue > 0 && <span className="text-red-600 dark:text-red-400">{counts.overdue} overdue</span>}
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <Label className="text-sm text-muted-foreground">Filter:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!embedReadonly && (
              <div className="ml-auto flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <Button size="sm" variant="default" onClick={() => openPushDialog(selectedIds)} data-testid="button-push-selected">
                    <CalendarClock className="h-4 w-4 mr-1" /> Push {selectedIds.size} selected
                  </Button>
                )}
                {epicsWithDeliverables.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="button-push-phase">
                        <CalendarClock className="h-4 w-4 mr-1" /> Push entire phase
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {epicsWithDeliverables.map(e => (
                        <DropdownMenuItem key={e.id} onClick={() => pushEntirePhase(e.id)}>
                          {e.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {deliverables.length === 0 ? "No deliverables yet. Add one manually or extract from a project narrative." : "No deliverables match the selected filter."}
            </div>
          ) : (
            <div className="rounded-md border dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    {!embedReadonly && (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={filtered.length > 0 && filtered.every(d => selectedIds.has(d.id))}
                          onCheckedChange={(c) => {
                            const next = new Set(selectedIds);
                            if (c) filtered.forEach(d => next.add(d.id));
                            else filtered.forEach(d => next.delete(d.id));
                            setSelectedIds(next);
                          }}
                          data-testid="checkbox-select-all-deliverables"
                        />
                      </TableHead>
                    )}
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Deliverable</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target Date</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => {
                    const isOverdue = d.targetDate && d.status !== "accepted" && d.status !== "rejected" && new Date(d.targetDate) < new Date();
                    return (
                      <TableRow key={d.id} className={`dark:border-gray-700 ${isOverdue ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                        {!embedReadonly && (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={(c) => {
                                const next = new Set(selectedIds);
                                if (c) next.add(d.id); else next.delete(d.id);
                                setSelectedIds(next);
                              }}
                              data-testid={`checkbox-deliverable-${d.id}`}
                            />
                          </TableCell>
                        )}
                        <TableCell><StatusIcon status={d.status} /></TableCell>
                        <TableCell>
                          <div className="font-medium">{d.name}</div>
                          {d.description && <div className="text-xs text-muted-foreground line-clamp-1">{d.description}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {epicName(d.epicId) ? <Badge variant="outline">{epicName(d.epicId)}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{d.ownerName || "—"}</TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                          {d.targetDate ? new Date(d.targetDate + 'T00:00:00').toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {d.deliveredDate ? new Date(d.deliveredDate + 'T00:00:00').toLocaleDateString() : "—"}
                        </TableCell>
                        {!embedReadonly && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(d)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setHistoryDeliverableId(d.id); setShowHistoryDialog(true); }}>
                                <History className="h-4 w-4 mr-2" /> View History
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600" onClick={() => {
                                if (confirm("Delete this deliverable?")) deleteMutation.mutate(d.id);
                              }}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDeliverable ? "Edit Deliverable" : "Add Deliverable"}</DialogTitle>
            <DialogDescription>Define a tangible output or work product for this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g., Discovery Findings Report" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="What this deliverable includes..." rows={3} />
            </div>
            <div>
              <Label>Owner *</Label>
              <Select value={formOwner} onValueChange={setFormOwner}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner..." />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {epics.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phase</Label>
                  <Select
                    value={formEpicId}
                    onValueChange={(v) => { setFormEpicId(v); setFormStageId("none"); }}
                  >
                    <SelectTrigger data-testid="select-deliverable-epic">
                      <SelectValue placeholder="No phase" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No phase</SelectItem>
                      {epics.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Stage</Label>
                  <Select
                    value={formStageId}
                    onValueChange={setFormStageId}
                    disabled={formEpicId === "none"}
                  >
                    <SelectTrigger data-testid="select-deliverable-stage">
                      <SelectValue placeholder={formEpicId === "none" ? "Pick a phase first" : "No stage"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No stage</SelectItem>
                      {stages.filter(s => s.epicId === formEpicId).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Date</Label>
                <Input type="date" value={formTargetDate} onChange={e => setFormTargetDate(e.target.value)} />
              </div>
            </div>
            {(formStatus === "accepted" || formStatus === "rejected" || editingDeliverable) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Delivered Date</Label>
                  <Input type="date" value={formDeliveredDate} onChange={e => setFormDeliveredDate(e.target.value)} />
                </div>
                <div>
                  <Label>Acceptance Notes</Label>
                  <Input value={formAcceptanceNotes} onChange={e => setFormAcceptanceNotes(e.target.value)} placeholder="Notes..." />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingDeliverable ? "Save Changes" : "Add Deliverable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExtractDialog} onOpenChange={setShowExtractDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Extract Deliverables from Narrative</DialogTitle>
            <DialogDescription>Paste a project proposal, SOW, or narrative and AI will identify candidate deliverables. Only net-new items (not already tracked) will be shown.</DialogDescription>
          </DialogHeader>
          {candidates.length === 0 ? (
            <div className="space-y-4">
              <Textarea
                value={narrativeText}
                onChange={e => setNarrativeText(e.target.value)}
                placeholder="Paste the project narrative, SOW, or proposal text here..."
                rows={12}
                className="font-mono text-sm"
              />
              <Button onClick={handleExtract} disabled={isExtracting} className="w-full">
                {isExtracting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyzing narrative...</> : <><Sparkles className="h-4 w-4 mr-1" /> Extract Deliverables</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Found {candidates.length} candidate deliverable(s). Select the ones to add and assign an owner to each.
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {candidates.map((c, idx) => (
                  <div key={idx} className={`border rounded-lg p-3 dark:border-gray-700 ${selectedCandidates.has(idx) ? 'border-primary bg-primary/5' : 'opacity-60'}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedCandidates.has(idx)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedCandidates);
                          if (checked) next.add(idx); else next.delete(idx);
                          setSelectedCandidates(next);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="font-medium text-sm">{c.name}</div>
                        {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                        {c.suggestedPhase && <Badge variant="outline" className="text-xs">{c.suggestedPhase}</Badge>}
                        {selectedCandidates.has(idx) && (
                          <div className="mt-2">
                            <Label className="text-xs">Owner *</Label>
                            <Select value={candidateOwners[idx] || ""} onValueChange={(val) => setCandidateOwners(prev => ({ ...prev, [idx]: val }))}>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select owner..." />
                              </SelectTrigger>
                              <SelectContent>
                                {teamMembers.map(u => (
                                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCandidates([])}>Back</Button>
                <Button onClick={handleAddSelected} disabled={selectedCandidates.size === 0 || bulkCreateMutation.isPending}>
                  {bulkCreateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Add {selectedCandidates.size} Deliverable(s)
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPushDialog} onOpenChange={(open) => { if (!open) closePushDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Push Deliverable Dates</DialogTitle>
            <DialogDescription>
              Pick a new target date for one deliverable. The same shift is applied to all selected deliverables so they move together.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Anchor deliverable</Label>
                <Select value={pushAnchorId} onValueChange={(val) => {
                  setPushAnchorId(val);
                  const a = deliverables.find(d => d.id === val);
                  setPushNewDate(a?.targetDate || "");
                }}>
                  <SelectTrigger data-testid="select-push-anchor">
                    <SelectValue placeholder="Select a deliverable..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pushPreview.filter(p => p.d.targetDate).map(p => (
                      <SelectItem key={p.d.id} value={p.d.id}>{p.d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>New target date</Label>
                <Input
                  type="date"
                  value={pushNewDate}
                  onChange={e => setPushNewDate(e.target.value)}
                  disabled={!pushAnchorId}
                  data-testid="input-push-new-date"
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {pushDelta === 0
                ? "Choose a new date to see the shift."
                : `Shifting ${pushPreview.filter(p => p.d.targetDate).length} deliverable(s) by ${pushDelta > 0 ? "+" : ""}${pushDelta} day(s) (${(Math.abs(pushDelta) / 7).toFixed(1)} weeks ${pushDelta > 0 ? "later" : "earlier"}).`}
              {pushNoDateCount > 0 && ` ${pushNoDateCount} selected deliverable(s) have no target date and will be skipped.`}
            </div>

            {pushWarnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium text-sm">
                  <AlertTriangle className="h-4 w-4" /> {pushWarnings.length} deliverable(s) will land after their phase deadline
                </div>
                <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1 list-disc pl-5">
                  {pushWarnings.map(w => (
                    <li key={w.d.id}>
                      <span className="font-medium">{w.d.name}</span> → {fmtDate(w.newDate)} is past “{w.ms?.name}” (phase deadline {fmtDate(w.ms?.targetDate)})
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  You can still proceed — consider also moving the phase milestone date to match.
                </div>
              </div>
            )}

            <div className="rounded-md border dark:border-gray-700 max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead>Deliverable</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead></TableHead>
                    <TableHead>New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pushPreview.map(p => (
                    <TableRow key={p.d.id} className={`dark:border-gray-700 ${p.breachesMilestone ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <TableCell className="text-sm font-medium">{p.d.name}</TableCell>
                      <TableCell className="text-sm">{epicName(p.d.epicId) || "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(p.d.targetDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.d.targetDate ? <ArrowRight className="h-4 w-4" /> : null}</TableCell>
                      <TableCell className={`text-sm ${p.breachesMilestone ? 'text-amber-700 dark:text-amber-300 font-medium' : ''}`}>
                        {p.d.targetDate ? fmtDate(p.newDate) : <span className="text-muted-foreground">no date</span>}
                        {p.breachesMilestone && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePushDialog}>Cancel</Button>
            <Button
              onClick={() => bulkShiftMutation.mutate({ deliverableIds: Array.from(selectedIds), deltaDays: pushDelta })}
              disabled={pushDelta === 0 || bulkShiftMutation.isPending}
              data-testid="button-confirm-push"
            >
              {bulkShiftMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Push {pushPreview.filter(p => p.d.targetDate).length} deliverable(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        deliverableId={historyDeliverableId}
        projectId={projectId}
      />
    </div>
  );
}

function HistoryDialog({ open, onOpenChange, deliverableId, projectId }: { open: boolean; onOpenChange: (v: boolean) => void; deliverableId: string | null; projectId: string }) {
  const { data: history = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'deliverables', deliverableId, 'history'],
    queryFn: () => fetch(`/api/projects/${projectId}/deliverables/${deliverableId}/history`, {
      headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" },
    }).then(r => r.json()),
    enabled: !!deliverableId && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Status History</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No history available.</div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    {h.oldStatus ? (
                      <><StatusBadge status={h.oldStatus} /> <span className="text-muted-foreground">→</span> <StatusBadge status={h.newStatus} /></>
                    ) : (
                      <StatusBadge status={h.newStatus} />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {h.changedByName || "System"} — {new Date(h.changedAt).toLocaleString()}
                  </div>
                  {h.comments && <div className="text-xs mt-1">{h.comments}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
