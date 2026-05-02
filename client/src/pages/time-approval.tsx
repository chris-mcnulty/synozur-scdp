import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, User, Calendar, DollarSign, Filter } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { TimeEntry, Project, Client, User as UserType } from "@shared/schema";

type TimeEntryWithRelations = TimeEntry & {
  person: UserType;
  project: Project & { client: Client };
};

type SubmitterGroup = {
  submitterId: string;
  submitterName: string;
  entries: TimeEntryWithRelations[];
  totalHours: number;
};

function submissionStatusBadge(status: string | null) {
  switch (status) {
    case "submitted":
      return <Badge variant="outline" className="text-yellow-600 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
    case "approved":
      return <Badge variant="outline" className="text-green-600 border-green-500 bg-green-50 dark:bg-green-950/30"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge variant="outline" className="text-red-600 border-red-500 bg-red-50 dark:bg-red-950/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
  }
}

export default function TimeApproval() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuth();

  const [selectedStatus, setSelectedStatus] = useState<string>("submitted");
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [pendingRejectIds, setPendingRejectIds] = useState<string[]>([]);

  const isApprover = hasAnyRole(["admin", "billing-admin", "pm", "executive", "portfolio-manager"]);

  const { data: entries = [], isLoading } = useQuery<TimeEntryWithRelations[]>({
    queryKey: ["/api/time-approvals/inbox", selectedStatus],
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== "all") params.set("status", selectedStatus);
      const response = await fetch(`/api/time-approvals/inbox?${params}`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!response.ok) throw new Error("Failed to fetch inbox");
      return response.json();
    },
    enabled: isApprover,
  });

  const approveMutation = useMutation({
    mutationFn: async (entryIds: string[]) => {
      return apiRequest("/api/time-entries/approve", {
        method: "POST",
        body: JSON.stringify({ entryIds }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-approvals/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setSelectedEntries(new Set());
      toast({
        title: "Entries approved",
        description: `${data.approved} time ${data.approved === 1 ? "entry" : "entries"} approved.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ entryIds, note }: { entryIds: string[]; note: string }) => {
      return apiRequest("/api/time-entries/reject", {
        method: "POST",
        body: JSON.stringify({ entryIds, note }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-approvals/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setSelectedEntries(new Set());
      setRejectDialogOpen(false);
      setRejectNote("");
      setPendingRejectIds([]);
      toast({
        title: "Entries rejected",
        description: `${data.rejected} time ${data.rejected === 1 ? "entry" : "entries"} returned for revision.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    },
  });

  const submitterGroups = useMemo<SubmitterGroup[]>(() => {
    const map = new Map<string, SubmitterGroup>();
    for (const entry of entries) {
      const sid = entry.submittedBy || entry.personId;
      const sname = entry.person?.name || "Unknown";
      if (!map.has(sid)) {
        map.set(sid, { submitterId: sid, submitterName: sname, entries: [], totalHours: 0 });
      }
      const group = map.get(sid)!;
      group.entries.push(entry);
      group.totalHours += parseFloat(String(entry.hours)) || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.submitterName.localeCompare(b.submitterName));
  }, [entries]);

  const allEntryIds = entries.map((e) => e.id);
  const allSelected = allEntryIds.length > 0 && allEntryIds.every((id) => selectedEntries.has(id));

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(allEntryIds));
    }
  };

  const handleApproveSelected = () => {
    const ids = Array.from(selectedEntries);
    if (ids.length === 0) return;
    approveMutation.mutate(ids);
  };

  const handleRejectSelected = () => {
    const ids = Array.from(selectedEntries);
    if (ids.length === 0) return;
    setPendingRejectIds(ids);
    setRejectNote("");
    setRejectDialogOpen(true);
  };

  const handleApproveGroup = (group: SubmitterGroup) => {
    const ids = group.entries.map((e) => e.id);
    approveMutation.mutate(ids);
  };

  const handleRejectGroup = (group: SubmitterGroup) => {
    const ids = group.entries.map((e) => e.id);
    setPendingRejectIds(ids);
    setRejectNote("");
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (!rejectNote.trim()) {
      toast({ title: "Rejection note required", description: "Please provide a reason for rejection.", variant: "destructive" });
      return;
    }
    rejectMutation.mutate({ entryIds: pendingRejectIds, note: rejectNote.trim() });
  };

  if (!isApprover) {
    return (
      <Layout>
        <div className="text-center py-16">
          <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  const pendingCount = entries.filter((e) => e.submissionStatus === "submitted").length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold">Time Approval Inbox</h2>
            <p className="text-sm lg:text-base text-muted-foreground">
              Review and approve submitted time entries before billing
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-500 text-sm px-3 py-1.5 self-start lg:self-auto">
              <Clock className="h-4 w-4 mr-1.5" />
              {pendingCount} pending review
            </Badge>
          )}
        </div>

        <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TabsList>
              <TabsTrigger value="submitted">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={selectedStatus} className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse h-24 bg-muted rounded-lg" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground opacity-40 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No entries here</h3>
                  <p className="text-muted-foreground text-sm">
                    {selectedStatus === "submitted"
                      ? "No time entries are awaiting review."
                      : `No ${selectedStatus} time entries found.`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {selectedStatus === "submitted" && (
                  <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      id="select-all"
                    />
                    <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
                      Select all ({entries.length})
                    </label>
                    {selectedEntries.size > 0 && (
                      <div className="flex gap-2 ml-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-500 hover:bg-green-50"
                          onClick={handleApproveSelected}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1.5" />
                          Approve Selected ({selectedEntries.size})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-500 hover:bg-red-50"
                          onClick={handleRejectSelected}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1.5" />
                          Reject Selected ({selectedEntries.size})
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {submitterGroups.map((group) => (
                    <Card key={group.submitterId}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{group.submitterName}</CardTitle>
                              <CardDescription>
                                {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"} · {group.totalHours.toFixed(2)}h total
                              </CardDescription>
                            </div>
                          </div>
                          {selectedStatus === "submitted" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-500 hover:bg-green-50"
                                onClick={() => handleApproveGroup(group)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4 mr-1.5" />
                                Approve All
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-500 hover:bg-red-50"
                                onClick={() => handleRejectGroup(group)}
                                disabled={rejectMutation.isPending}
                              >
                                <XCircle className="h-4 w-4 mr-1.5" />
                                Reject All
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {group.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/20 transition-colors"
                          >
                            {selectedStatus === "submitted" && (
                              <Checkbox
                                checked={selectedEntries.has(entry.id)}
                                onCheckedChange={() => toggleEntry(entry.id)}
                                className="mt-0.5"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{entry.project?.name}</span>
                                <span className="text-xs text-muted-foreground">{entry.project?.client?.name}</span>
                                {submissionStatusBadge(entry.submissionStatus)}
                                {entry.billable && (
                                  <Badge variant="outline" className="text-xs text-chart-4 border-chart-4/50 bg-chart-4/5">
                                    <DollarSign className="h-3 w-3 mr-0.5" />Billable
                                  </Badge>
                                )}
                              </div>
                              {entry.description && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">{entry.description}</p>
                              )}
                              {entry.rejectionNote && (
                                <p className="text-xs text-red-600 mt-1 italic">
                                  Rejection reason: {entry.rejectionNote}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold text-sm">{parseFloat(String(entry.hours)).toFixed(2)}h</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(entry.date.replace(/-/g, "/")), "MMM d")}
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Time Entries</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection. The submitter will be notified and asked to make changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="Explain what needs to be corrected..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Rejecting {pendingRejectIds.length} {pendingRejectIds.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectMutation.isPending || !rejectNote.trim()}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject & Notify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
