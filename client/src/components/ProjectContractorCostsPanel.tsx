import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, FileText, ExternalLink, ArrowRight, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { formatBusinessDate } from "@/lib/date-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
  status: string;
  engagementLabel: string | null;
  pdfSpeWebUrl: string | null;
  pdfFileName: string | null;
  contractor: { id: string; name: string; contractorBusinessName: string | null } | null;
}

interface Summary {
  totalInvoiced: string;
  totalApproved: string;
  totalPaid: string;
  invoiceCount: number;
}

interface Contractor {
  id: string;
  name: string;
  contractorBusinessName: string | null;
}

interface SowCeiling {
  id: string;
  contractorUserId?: string;
  contractorId?: string;
  contractor?: Contractor | null;
  engagementLabel: string;
  ceilingType: "hours" | "dollars";
  amount: string | number;
  currency: string;
  agreedRate: string | number | null;
  effectiveDate: string;
  notes: string | null;
  usage?: {
    used: string | number;
    remaining: string | number;
    percentUsed: string | number;
    warning?: "amber" | "red" | null;
  };
}

interface CeilingForm {
  contractorUserId: string;
  engagementLabel: string;
  ceilingType: "hours" | "dollars";
  ceilingAmount: string;
  currency: string;
  agreedRate: string;
  effectiveDate: string;
  notes: string;
}

const EMPTY_CEILING: CeilingForm = {
  contractorUserId: "",
  engagementLabel: "",
  ceilingType: "hours",
  ceilingAmount: "",
  currency: "USD",
  agreedRate: "",
  effectiveDate: "",
  notes: "",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  paid: "Paid",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function fmt(value: string | number | undefined) {
  if (value == null) return "$0.00";
  return `$${parseFloat(String(value)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtComparisonCurrency(value: string | number | undefined, currency: string) {
  const amount = value == null ? 0 : parseFloat(String(value));
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProjectContractorCostsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SowCeiling | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CeilingForm>(EMPTY_CEILING);
  const { data, isLoading } = useQuery<{ invoices: Invoice[]; summary: Summary }>({
    queryKey: [`/api/projects/${projectId}/contractor-cost-invoices`],
    enabled: !!projectId,
  });
  const { data: ceilingResponse, isLoading: ceilingsLoading } = useQuery<SowCeiling[] | { ceilings: SowCeiling[] }>({
    queryKey: [`/api/projects/${projectId}/contractor-sow-ceilings`],
    enabled: !!projectId,
  });
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/users", { isContractor: true }],
    queryFn: () => apiRequest("/api/users?isContractor=true"),
    enabled: formOpen,
  });
  const ceilings = Array.isArray(ceilingResponse) ? ceilingResponse : ceilingResponse?.ceilings ?? [];
  const ceilingKey = [`/api/projects/${projectId}/contractor-sow-ceilings`];

  const saveCeiling = useMutation({
    mutationFn: () => apiRequest(
      editing
        ? `/api/projects/${projectId}/contractor-sow-ceilings/${editing.id}`
        : `/api/projects/${projectId}/contractor-sow-ceilings`,
      {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          contractorUserId: form.contractorUserId,
          engagementLabel: form.engagementLabel.trim(),
          ceilingType: form.ceilingType,
          amount: Number(form.ceilingAmount),
          currency: form.currency.trim().toUpperCase(),
          agreedRate: Number(form.agreedRate),
          effectiveDate: form.effectiveDate,
          notes: form.notes.trim() || null,
        }),
      },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ceilingKey });
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_CEILING);
      toast({ title: editing ? "SOW ceiling updated" : "SOW ceiling created" });
    },
    onError: (e: any) => toast({ title: "Could not save SOW ceiling", description: e.message, variant: "destructive" }),
  });

  const deleteCeiling = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/projects/${projectId}/contractor-sow-ceilings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ceilingKey });
      toast({ title: "SOW ceiling deleted" });
    },
    onError: (e: any) => toast({ title: "Could not delete SOW ceiling", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_CEILING);
    setFormOpen(true);
  };
  const openEdit = (ceiling: SowCeiling) => {
    setEditing(ceiling);
    setForm({
      contractorUserId: ceiling.contractorUserId || ceiling.contractorId || ceiling.contractor?.id || "",
      engagementLabel: ceiling.engagementLabel || "",
      ceilingType: ceiling.ceilingType,
      ceilingAmount: String(ceiling.amount),
      currency: ceiling.currency || "USD",
      agreedRate: ceiling.agreedRate == null ? "" : String(ceiling.agreedRate),
      effectiveDate: ceiling.effectiveDate?.slice(0, 10) || "",
      notes: ceiling.notes || "",
    });
    setFormOpen(true);
  };

  const invoices = data?.invoices ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Invoiced</p>
            <p className="text-2xl font-bold">{fmt(summary?.totalInvoiced)}</p>
            <p className="text-xs text-muted-foreground">{summary?.invoiceCount ?? 0} invoice(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold">{fmt(summary?.totalApproved)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold">{fmt(summary?.totalPaid)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>SOW Ceilings</CardTitle>
              <CardDescription>Track agreed contractor limits and consumption by engagement</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> Add ceiling
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ceilingsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : ceilings.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No SOW ceilings have been configured for this project.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor / Engagement</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead className="text-right">Ceiling</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ceilings.map((ceiling) => {
                    const amount = Number(ceiling.amount) || 0;
                    const used = Number(ceiling.usage?.used ?? 0);
                    const remaining = Number(ceiling.usage?.remaining ?? amount - used);
                    const percent = Number(ceiling.usage?.percentUsed ?? (amount ? used / amount * 100 : 0));
                    const isCritical = percent >= 100;
                    const isWarning = percent >= 80;
                    const display = (value: number) => ceiling.ceilingType === "hours"
                      ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`
                      : fmtComparisonCurrency(value, ceiling.currency);
                    return (
                      <TableRow key={ceiling.id} className={isCritical ? "bg-red-50/60 dark:bg-red-950/20" : isWarning ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                        <TableCell>
                          <div className="font-medium">{ceiling.contractor?.contractorBusinessName || ceiling.contractor?.name || "Contractor"}</div>
                          <div className="text-xs text-muted-foreground">{ceiling.engagementLabel}</div>
                          {ceiling.agreedRate != null && <div className="text-xs text-muted-foreground">{fmtComparisonCurrency(ceiling.agreedRate, ceiling.currency)}/hour agreed rate</div>}
                        </TableCell>
                        <TableCell className="text-sm">{formatBusinessDate(ceiling.effectiveDate)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{display(amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{display(used)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${isCritical ? "text-red-700 dark:text-red-400" : ""}`}>{display(remaining)}</TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm font-medium ${isCritical ? "text-red-700 dark:text-red-400" : isWarning ? "text-amber-700 dark:text-amber-400" : ""}`}>
                            {(isWarning || isCritical) && <AlertTriangle className="h-4 w-4" />}
                            {percent.toFixed(0)}%
                          </div>
                          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full ${isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                          </div>
                          <span className="sr-only">{ceiling.ceilingType === "hours" ? "Hour" : ceiling.currency} ceiling usage</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(ceiling)} aria-label="Edit ceiling"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => {
                              if (window.confirm("Delete this SOW ceiling?")) deleteCeiling.mutate(ceiling.id);
                            }} aria-label="Delete ceiling"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Contractor Cost Invoices</CardTitle>
              <CardDescription>Inbound invoices billed to this project by subcontractors</CardDescription>
            </div>
            <Link href={`/contractor-cost-invoices?projectId=${projectId}`}>
              <Button variant="outline" size="sm">
                View all
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No contractor invoices for this project yet.</p>
              <Link href={`/contractor-cost-invoices`}>
                <Button variant="outline" size="sm" className="mt-3">
                  Add invoice
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => {
                    const name = inv.contractor?.contractorBusinessName || inv.contractor?.name || "Unknown";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>
                          {inv.pdfSpeWebUrl ? (
                            <a href={inv.pdfSpeWebUrl} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                              {inv.invoiceNumber} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatBusinessDate(inv.invoiceDate)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.engagementLabel || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmt(inv.total)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit SOW ceiling" : "Add SOW ceiling"}</DialogTitle>
            <DialogDescription>Define the agreed limit and rate for a contractor engagement.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2">
              <Label>Contractor</Label>
              <Select value={form.contractorUserId} onValueChange={(value) => setForm((f) => ({ ...f, contractorUserId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>
                  {contractors.map((contractor) => <SelectItem key={contractor.id} value={contractor.id}>{contractor.contractorBusinessName || contractor.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="sow-engagement">Engagement label</Label>
              <Input id="sow-engagement" value={form.engagementLabel} onChange={(e) => setForm((f) => ({ ...f, engagementLabel: e.target.value }))} placeholder="e.g. Discovery and implementation" />
            </div>
            <div>
              <Label>Ceiling type</Label>
              <Select value={form.ceilingType} onValueChange={(value: "hours" | "dollars") => setForm((f) => ({ ...f, ceilingType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="hours">Hours</SelectItem><SelectItem value="dollars">Dollars</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sow-amount">Ceiling amount</Label>
              <Input id="sow-amount" type="number" min="0" step="0.01" value={form.ceilingAmount} onChange={(e) => setForm((f) => ({ ...f, ceilingAmount: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sow-currency">Comparison currency</Label>
              <Input
                id="sow-currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                maxLength={3}
                placeholder="USD"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Invoice usage is converted into this currency using its recorded exchange rate.
              </p>
            </div>
            <div>
              <Label htmlFor="sow-rate">Agreed hourly rate ({form.currency || "currency"})</Label>
              <Input id="sow-rate" type="number" min="0" step="0.01" value={form.agreedRate} onChange={(e) => setForm((f) => ({ ...f, agreedRate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sow-effective">Effective date</Label>
              <Input id="sow-effective" type="date" value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="sow-notes">Notes</Label>
              <Textarea id="sow-notes" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Scope assumptions or approval reference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => saveCeiling.mutate()} disabled={!form.contractorUserId || !form.engagementLabel.trim() || !form.ceilingAmount || form.currency.trim().length !== 3 || !form.agreedRate || !form.effectiveDate || saveCeiling.isPending}>
              {saveCeiling.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add ceiling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
