import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, CheckCircle, Clock, Plus, Trash2, Search,
  FileText, AlertCircle, RefreshCw, ChevronRight, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Client, Project } from "@shared/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RevenueEntry {
  id: string;
  projectId: string;
  clientId: string;
  sourceType: "invoice" | "po" | "contract" | "manual";
  referenceNumber: string | null;
  amount: string;
  recognized: boolean;
  recognizedAt: string | null;
  invoiceBatchId: string | null;
  notes: string | null;
  createdAt: string;
  project: { id: string; name: string; code: string; sowTotal: string | null };
  client: { id: string; name: string };
}

interface InvoiceSuggestion {
  invoiceBatchId: string;
  batchId: string;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  /** Amount attributable to this specific project in the batch (non-expense lines only) */
  projectAmount: string;
  /** Full batch total — shown for context */
  totalAmount: string;
  finalizedAt: string | null;
  glInvoiceNumber: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAmount(val: string | number | null | undefined) {
  const n = Number(val ?? 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function sourceBadge(type: string) {
  const map: Record<string, string> = {
    invoice: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
    po: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
    contract: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
    manual: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  };
  return (
    <Badge className={`text-xs ${map[type] ?? map.manual}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </Badge>
  );
}

// ─── Add Entry Dialog ─────────────────────────────────────────────────────────

function AddEntryDialog({
  open,
  onClose,
  clients,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  projects: Project[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    projectId: "",
    clientId: "",
    sourceType: "manual" as const,
    referenceNumber: "",
    amount: "",
    recognized: false,
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("/api/financials/revenue", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financials/revenue"] });
      toast({ title: "Revenue entry created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed to create entry", description: e.message, variant: "destructive" }),
  });

  const filteredProjects = form.clientId
    ? projects.filter((p: any) => p.clientId === form.clientId)
    : projects;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Revenue Entry</DialogTitle>
          <DialogDescription>
            Record a PO, contract value, or other manual revenue amount. For invoices already in the system, use the Suggestions tab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Client</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm(f => ({ ...f, clientId: v, projectId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Source Type</Label>
              <Select value={form.sourceType} onValueChange={(v) => setForm(f => ({ ...f, sourceType: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="po">PO</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference # (optional)</Label>
              <Input placeholder="PO-1234" value={form.referenceNumber} onChange={(e) => setForm(f => ({ ...f, referenceNumber: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Amount ($)</Label>
            <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="recognized"
              checked={form.recognized}
              onCheckedChange={(c) => setForm(f => ({ ...f, recognized: !!c }))}
            />
            <Label htmlFor="recognized">Mark as recognized immediately</Label>
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.projectId || !form.clientId || !form.amount || createMutation.isPending}
            onClick={() => createMutation.mutate(form)}
          >
            {createMutation.isPending ? "Saving…" : "Create Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FinancialsRevenue() {
  const { toast } = useToast();
  const { hasAnyRole } = useAuth();

  const [tab, setTab] = useState<"entries" | "suggestions">("entries");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "recognized" | "pending">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);

  // ── Data fetches
  const { data: entries = [], isLoading: entriesLoading } = useQuery<RevenueEntry[]>({
    queryKey: ["/api/financials/revenue"],
  });

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<InvoiceSuggestion[]>({
    queryKey: ["/api/financials/revenue/suggestions"],
    enabled: tab === "suggestions",
  });

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  // ── Mutations
  const toggleMutation = useMutation({
    mutationFn: ({ id, recognized }: { id: string; recognized: boolean }) =>
      apiRequest(`/api/financials/revenue/${id}`, { method: "PATCH", body: JSON.stringify({ recognized }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/financials/revenue"] }),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const bulkRecognizeMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("/api/financials/revenue/bulk-recognize", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/financials/revenue"] });
      setSelectedIds(new Set());
      toast({ title: `${data.recognized} entries marked recognized` });
    },
    onError: (e: any) => toast({ title: "Bulk recognize failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/financials/revenue/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financials/revenue"] });
      toast({ title: "Entry deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const confirmInvoiceMutation = useMutation({
    mutationFn: ({ invoiceBatchId, projectId, recognized }: { invoiceBatchId: string; projectId: string; recognized: boolean }) =>
      apiRequest("/api/financials/revenue/confirm-invoice", {
        method: "POST",
        body: JSON.stringify({ invoiceBatchId, projectId, recognized }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financials/revenue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financials/revenue/suggestions"] });
      toast({ title: "Invoice confirmed as revenue entry" });
    },
    onError: (e: any) => {
      const msg = e.message?.includes("409") || e.message?.includes("already exists")
        ? "This invoice has already been confirmed for this project."
        : e.message;
      toast({ title: "Failed", description: msg, variant: "destructive" });
    },
  });

  // ── Filtered entries
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (clientFilter !== "all" && e.clientId !== clientFilter) return false;
      if (statusFilter === "recognized" && !e.recognized) return false;
      if (statusFilter === "pending" && e.recognized) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.project?.name?.toLowerCase().includes(q) &&
          !e.client?.name?.toLowerCase().includes(q) &&
          !e.referenceNumber?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [entries, clientFilter, statusFilter, search]);

  // ── Summary metrics
  const totalRecognized = entries.filter(e => e.recognized).reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = entries.filter(e => !e.recognized).reduce((s, e) => s + Number(e.amount), 0);
  const totalAll = totalRecognized + totalPending;

  const pendingInSelectedIds = Array.from(selectedIds).filter(
    (id) => entries.find((e) => e.id === id && !e.recognized)
  );

  if (!hasAnyRole(["admin", "billing-admin", "executive"])) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">
          You do not have permission to view this page.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Revenue Recognition</h2>
            <p className="text-muted-foreground">
              Track and recognise client revenue against finalized invoices and contracts.
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtAmount(totalAll)}</div>
              <p className="text-xs text-muted-foreground">{entries.length} record{entries.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recognized</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{fmtAmount(totalRecognized)}</div>
              <p className="text-xs text-muted-foreground">{entries.filter(e => e.recognized).length} entries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Recognition</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{fmtAmount(totalPending)}</div>
              <p className="text-xs text-muted-foreground">{entries.filter(e => !e.recognized).length} entries</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Entries vs Suggestions */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="entries">
              Revenue Entries
              {entries.length > 0 && (
                <span className="ml-2 text-xs bg-muted rounded px-1.5 py-0.5">{entries.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="suggestions">
              Unrecognised Invoices
              {suggestions.length > 0 && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">{suggestions.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Revenue Entries tab ── */}
          <TabsContent value="entries" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search project, client, reference…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="recognized">Recognized</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              {selectedIds.size > 0 && pendingInSelectedIds.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => bulkRecognizeMutation.mutate(pendingInSelectedIds)}
                  disabled={bulkRecognizeMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Mark {pendingInSelectedIds.length} Recognized
                </Button>
              )}
            </div>

            {entriesLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">
                    {entries.length === 0
                      ? "No revenue entries yet. Confirm finalized invoices from the Unrecognised Invoices tab, or add a manual entry."
                      : "No entries match the current filters."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={filtered.length > 0 && filtered.every(e => selectedIds.has(e.id))}
                          onCheckedChange={(c) => {
                            if (c) setSelectedIds(new Set(filtered.map(e => e.id)));
                            else setSelectedIds(new Set());
                          }}
                        />
                      </TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recognized</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((entry) => (
                      <TableRow key={entry.id} className={selectedIds.has(entry.id) ? "bg-muted/30" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={(c) => {
                              const next = new Set(selectedIds);
                              if (c) next.add(entry.id); else next.delete(entry.id);
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link href={`/projects/${entry.projectId}`} className="hover:underline">
                            {entry.project?.name || entry.projectId}
                          </Link>
                          {entry.project?.code && (
                            <span className="ml-1 text-xs text-muted-foreground">({entry.project.code})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.client?.name}</TableCell>
                        <TableCell>{sourceBadge(entry.sourceType)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.referenceNumber || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">{fmtAmount(entry.amount)}</TableCell>
                        <TableCell>
                          {entry.recognized ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Recognized
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.recognizedAt
                            ? format(new Date(entry.recognizedAt), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title={entry.recognized ? "Un-recognize" : "Mark recognized"}
                              onClick={() => toggleMutation.mutate({ id: entry.id, recognized: !entry.recognized })}
                            >
                              {entry.recognized ? (
                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              title="Delete"
                              onClick={() => deleteMutation.mutate(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* ── Unrecognised Invoices tab ── */}
          <TabsContent value="suggestions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Finalized invoices without a revenue entry</CardTitle>
                <CardDescription>
                  These invoice batches are finalized but haven't been confirmed as revenue entries.
                  Confirming one copies the amount and creates a revenue record — no double-entry of figures.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {suggestionsLoading ? (
                  <div className="py-12 text-center text-muted-foreground">Loading…</div>
                ) : suggestions.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
                    <p>All finalized invoices have been confirmed as revenue entries.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Finalized</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestions.map((s) => (
                        <TableRow key={`${s.invoiceBatchId}-${s.projectId}`}>
                          <TableCell className="font-mono text-sm">
                            {s.glInvoiceNumber || s.batchId}
                          </TableCell>
                          <TableCell className="font-medium">
                            {s.projectName ? (
                              <Link href={`/projects/${s.projectId}`} className="hover:underline">
                                {s.projectName}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.clientName || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.finalizedAt ? format(new Date(s.finalizedAt), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {fmtAmount(s.projectAmount)}
                            {s.projectAmount !== s.totalAmount && (
                              <span className="block text-xs text-muted-foreground font-normal">
                                of {fmtAmount(s.totalAmount)} batch total
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={confirmInvoiceMutation.isPending || !s.projectId}
                                onClick={() =>
                                  confirmInvoiceMutation.mutate({
                                    invoiceBatchId: s.invoiceBatchId,
                                    projectId: s.projectId!,
                                    recognized: false,
                                  })
                                }
                              >
                                Confirm (Pending)
                              </Button>
                              <Button
                                size="sm"
                                disabled={confirmInvoiceMutation.isPending || !s.projectId}
                                onClick={() =>
                                  confirmInvoiceMutation.mutate({
                                    invoiceBatchId: s.invoiceBatchId,
                                    projectId: s.projectId!,
                                    recognized: true,
                                  })
                                }
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Confirm & Recognize
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AddEntryDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          clients={clients}
          projects={projects as any}
        />
      </div>
    </Layout>
  );
}
