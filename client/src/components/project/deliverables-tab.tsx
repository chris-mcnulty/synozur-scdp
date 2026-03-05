import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Plus, Sparkles, MoreHorizontal, Pencil, Trash2, History, Clock, CheckCircle2, CircleDot, Eye, XCircle, Loader2 } from "lucide-react";
import type { ProjectDeliverable } from "@shared/schema";

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
    setShowAddDialog(true);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Project Deliverables</CardTitle>
              <CardDescription>Track tangible outputs, documents, and work products</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCandidates([]); setSelectedCandidates(new Set()); setCandidateOwners({}); setShowExtractDialog(true); }}>
                <Sparkles className="h-4 w-4 mr-1" /> Extract from Narrative
              </Button>
              <Button size="sm" onClick={() => { closeDialog(); setShowAddDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Deliverable
              </Button>
            </div>
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
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Deliverable</TableHead>
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
                        <TableCell><StatusIcon status={d.status} /></TableCell>
                        <TableCell>
                          <div className="font-medium">{d.name}</div>
                          {d.description && <div className="text-xs text-muted-foreground line-clamp-1">{d.description}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{d.ownerName || "—"}</TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                          {d.targetDate ? new Date(d.targetDate + 'T00:00:00').toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {d.deliveredDate ? new Date(d.deliveredDate + 'T00:00:00').toLocaleDateString() : "—"}
                        </TableCell>
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
