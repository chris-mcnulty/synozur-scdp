import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Plus, Save, Tags } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const BASIS = [
  { value: "fixed_fee", label: "Fixed Fee" },
  { value: "retainer", label: "Retainer" },
  { value: "tm", label: "T&M" },
  { value: "capped_tm", label: "Capped T&M" },
];

const basisLabel = (basis?: string | null) => BASIS.find(item => item.value === basis)?.label || basis || "Not configured";

export function CommercialBucketsPanel({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [basis, setBasis] = useState<string>("");
  const [required, setRequired] = useState(false);
  const [newBucket, setNewBucket] = useState({ label: "", basis: "", contractReference: "", effectiveStartDate: "", effectiveEndDate: "", hoursCeiling: "", dollarCeiling: "", approvalRequired: false, defaultEligibilityOutcome: "eligible", billingTreatment: "" });
  const [range, setRange] = useState({ startDate: "", endDate: "", status: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [classification, setClassification] = useState({ commercialBucketId: "", commercialEligibilityOutcome: "eligible", commercialApprovalReference: "" });

  const bucketQuery = useQuery<{ projectBasis: string | null; required: boolean; buckets: any[] }>({
    queryKey: ["/api/projects", projectId, "commercial-buckets"],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/commercial-buckets`, { credentials: "include" })).json(),
  });
  useEffect(() => {
    if (!bucketQuery.data) return;
    setBasis(bucketQuery.data.projectBasis || "");
    setRequired(bucketQuery.data.required);
  }, [projectId, bucketQuery.data?.projectBasis, bucketQuery.data?.required]);
  const summaryQuery = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "commercial-buckets", "summary"],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/commercial-buckets/summary`, { credentials: "include" })).json(),
  });
  const reconciliationQuery = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "commercial-reconciliation", range],
    queryFn: async () => {
      const params = new URLSearchParams(Object.entries(range).filter(([, value]) => value).map(([key, value]) => [key, value]));
      const response = await fetch(`/api/projects/${projectId}/commercial-reconciliation?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load reconciliation queue");
      return response.json();
    },
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "commercial-buckets"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "commercial-reconciliation"] });
  };

  const settingsMutation = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/commercial-buckets/settings`, { method: "PUT", body: JSON.stringify({ commercialBasis: basis || bucketQuery.data?.projectBasis || null, commercialBucketsRequired: required }) }),
    onSuccess: () => { refresh(); toast({ title: "Commercial settings saved" }); },
    onError: (error: Error) => toast({ title: "Unable to save settings", description: error.message, variant: "destructive" }),
  });
  const createMutation = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/commercial-buckets`, {
      method: "POST",
      body: JSON.stringify({
        ...newBucket,
        basis: newBucket.basis || basis,
        contractReference: newBucket.contractReference || null,
        effectiveStartDate: newBucket.effectiveStartDate || null,
        effectiveEndDate: newBucket.effectiveEndDate || null,
        hoursCeiling: newBucket.hoursCeiling || null,
        dollarCeiling: newBucket.dollarCeiling || null,
        billingTreatment: newBucket.billingTreatment || null,
        rateBasis: (newBucket.basis || basis) === "tm" || (newBucket.basis || basis) === "capped_tm" ? "applicable_rate" : "fixed_value",
      }),
    }),
    onSuccess: () => {
      setNewBucket({ label: "", basis: "", contractReference: "", effectiveStartDate: "", effectiveEndDate: "", hoursCeiling: "", dollarCeiling: "", approvalRequired: false, defaultEligibilityOutcome: "eligible", billingTreatment: "" });
      refresh(); toast({ title: "Commercial bucket created" });
    },
    onError: (error: Error) => toast({ title: "Unable to create bucket", description: error.message, variant: "destructive" }),
  });
  const classifyMutation = useMutation({
    mutationFn: (entryIds: string[]) => apiRequest(`/api/projects/${projectId}/commercial-reconciliation/classify`, {
      method: "POST",
      body: JSON.stringify({
        entryIds,
        commercialBucketId: classification.commercialBucketId || null,
        commercialEligibilityOutcome: classification.commercialEligibilityOutcome,
        commercialApprovalReference: classification.commercialApprovalReference || null,
      }),
    }),
    onSuccess: (result: any) => { setSelected(new Set()); refresh(); toast({ title: `${result.classified} time entries classified` }); },
    onError: (error: Error) => toast({ title: "Classification failed", description: error.message, variant: "destructive" }),
  });

  const buckets = bucketQuery.data?.buckets || [];
  const summaries = summaryQuery.data || [];
  const currentBasis = bucketQuery.data?.projectBasis || basis;
  const reconciliation = reconciliationQuery.data || [];
  const selectedCount = selected.size;
  const selectedEntries = useMemo(() => reconciliation.filter(entry => selected.has(entry.id)), [reconciliation, selected]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5" /> Commercial time classification</CardTitle>
          <CardDescription>Commercial buckets are contractual classifications. Workstreams and milestone coverage remain independent.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label>Project commercial basis</Label>
            <Select value={basis} onValueChange={setBasis} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Choose one commercial basis" /></SelectTrigger>
              <SelectContent>{BASIS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox id="buckets-required" checked={required} onCheckedChange={(value) => setRequired(value === true)} disabled={readOnly} />
            <Label htmlFor="buckets-required">Require a bucket on new time</Label>
          </div>
          {!readOnly && <Button onClick={() => settingsMutation.mutate()} disabled={!basis && !bucketQuery.data?.projectBasis || settingsMutation.isPending}><Save className="mr-2 h-4 w-4" /> Save settings</Button>}
        </CardContent>
      </Card>

      {!readOnly && currentBasis && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add commercial bucket</CardTitle><CardDescription>The project default is {basisLabel(currentBasis)}. Use another basis only when the contract has mixed treatment, such as a change order.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Business label" value={newBucket.label} onChange={event => setNewBucket({ ...newBucket, label: event.target.value })} />
            <Select value={newBucket.basis || currentBasis} onValueChange={value => setNewBucket({ ...newBucket, basis: value })}><SelectTrigger><SelectValue placeholder="Commercial basis" /></SelectTrigger><SelectContent>{BASIS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="SOW / change order reference" value={newBucket.contractReference} onChange={event => setNewBucket({ ...newBucket, contractReference: event.target.value })} />
            <Input type="date" aria-label="Effective start" value={newBucket.effectiveStartDate} onChange={event => setNewBucket({ ...newBucket, effectiveStartDate: event.target.value })} />
            <Input type="date" aria-label="Effective end" value={newBucket.effectiveEndDate} onChange={event => setNewBucket({ ...newBucket, effectiveEndDate: event.target.value })} />
            <Input type="number" min="0" placeholder="Hours ceiling (optional)" value={newBucket.hoursCeiling} onChange={event => setNewBucket({ ...newBucket, hoursCeiling: event.target.value })} />
            <Input type="number" min="0" placeholder="Dollar ceiling (optional)" value={newBucket.dollarCeiling} onChange={event => setNewBucket({ ...newBucket, dollarCeiling: event.target.value })} />
            <Select value={newBucket.defaultEligibilityOutcome} onValueChange={value => setNewBucket({ ...newBucket, defaultEligibilityOutcome: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="eligible">Normally eligible</SelectItem><SelectItem value="not_eligible">Not eligible for recovery</SelectItem></SelectContent></Select>
            <Input placeholder="Billing treatment / notes" value={newBucket.billingTreatment} onChange={event => setNewBucket({ ...newBucket, billingTreatment: event.target.value })} />
            <div className="flex items-center gap-2"><Checkbox id="approval-required" checked={newBucket.approvalRequired} onCheckedChange={value => setNewBucket({ ...newBucket, approvalRequired: value === true })} /><Label htmlFor="approval-required">Approval reference required</Label></div>
            <Button className="lg:col-span-4 justify-self-start" onClick={() => createMutation.mutate()} disabled={!newBucket.label || createMutation.isPending}><Plus className="mr-2 h-4 w-4" /> Add bucket</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Commercial burn and exceptions</CardTitle><CardDescription>Fixed-fee and retainer hours are tracked for realization, not usage billing.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {summaries.map(bucket => <div key={bucket.id} className="rounded-md border p-3 space-y-1">
            <div className="flex justify-between gap-2"><span className="font-medium text-sm">{bucket.label}</span><Badge variant="outline">{basisLabel(bucket.basis)}</Badge></div>
            <p className="text-sm">{bucket.eligibleHours.toFixed(2)} hrs · ${bucket.eligibleValue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{bucket.remainingHours != null ? `${bucket.remainingHours.toFixed(2)} hrs remaining` : bucket.remainingValue != null ? `$${bucket.remainingValue.toLocaleString()} remaining` : "No configured ceiling"}</p>
            {bucket.exceptions > 0 && <p className="text-xs text-amber-700">{bucket.exceptions} exception{bucket.exceptions === 1 ? "" : "s"}</p>}
          </div>)}
          {!summaries.length && <p className="text-sm text-muted-foreground">No commercial buckets have been configured.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Time reconciliation queue</CardTitle><CardDescription>Review first; this queue never infers historical eligibility from a description.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">From<Input type="date" value={range.startDate} onChange={event => setRange({ ...range, startDate: event.target.value })} /></label>
            <label className="text-sm">To<Input type="date" value={range.endDate} onChange={event => setRange({ ...range, endDate: event.target.value })} /></label>
            <Select value={range.status} onValueChange={status => setRange({ ...range, status })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All entries</SelectItem><SelectItem value="unclassified">Unclassified</SelectItem><SelectItem value="ineligible">Not eligible</SelectItem><SelectItem value="exceptions">Exceptions</SelectItem></SelectContent></Select>
            <Button variant="outline" onClick={() => setRange({ startDate: `${new Date().getFullYear()}-05-01`, endDate: `${new Date().getFullYear()}-08-31`, status: "all" })}>May–August</Button>
          </div>
          {!readOnly && <div className="rounded-md bg-muted p-3 flex flex-wrap gap-2 items-center">
            <Select value={classification.commercialBucketId || "__none__"} onValueChange={value => setClassification({ ...classification, commercialBucketId: value === "__none__" ? "" : value })}><SelectTrigger className="w-56"><SelectValue placeholder="Select bucket" /></SelectTrigger><SelectContent><SelectItem value="__none__">No bucket / not eligible</SelectItem>{buckets.filter(bucket => bucket.isActive).map(bucket => <SelectItem key={bucket.id} value={bucket.id}>{bucket.label}</SelectItem>)}</SelectContent></Select>
            <Select value={classification.commercialEligibilityOutcome} onValueChange={value => setClassification({ ...classification, commercialEligibilityOutcome: value })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="eligible">Eligible</SelectItem><SelectItem value="not_eligible">Not eligible</SelectItem><SelectItem value="pending_approval">Pending approval</SelectItem></SelectContent></Select>
            <Input className="w-56" placeholder="Approval reference" value={classification.commercialApprovalReference} onChange={event => setClassification({ ...classification, commercialApprovalReference: event.target.value })} />
            <Button disabled={!selectedCount || classifyMutation.isPending} onClick={() => classifyMutation.mutate(Array.from(selected))}><CheckCircle2 className="mr-2 h-4 w-4" /> Classify {selectedCount || ""}</Button>
          </div>}
          <div className="border rounded-md overflow-auto max-h-[440px]">
            <Table><TableHeader><TableRow>{!readOnly && <TableHead />}<TableHead>Date</TableHead><TableHead>Resource</TableHead><TableHead>Description</TableHead><TableHead>Workstream</TableHead><TableHead>Milestone coverage</TableHead><TableHead>Commercial classification</TableHead></TableRow></TableHeader>
              <TableBody>{reconciliation.map(entry => <TableRow key={entry.id}>{!readOnly && <TableCell><Checkbox checked={selected.has(entry.id)} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); checked ? next.add(entry.id) : next.delete(entry.id); return next; })} /></TableCell>}<TableCell>{entry.date}</TableCell><TableCell>{entry.personName}</TableCell><TableCell className="max-w-72 truncate">{entry.description || "—"}</TableCell><TableCell>{entry.workstreamName || "—"}</TableCell><TableCell>{entry.coveredByMilestoneName || "Not covered"}</TableCell><TableCell>{entry.commercialBucketLabel ? <><Badge variant={entry.commercialEligibilityOutcome === "eligible" ? "default" : "secondary"}>{entry.commercialBucketLabel} · {entry.commercialEligibilityOutcome}</Badge>{entry.commercialAudit?.length > 0 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Audit trail ({entry.commercialAudit.length})</summary>{entry.commercialAudit.map((audit: any) => <p key={audit.id}>{new Date(audit.classifiedAt).toLocaleString()}: {audit.eligibilityOutcome}{audit.approvalReference ? ` · ${audit.approvalReference}` : ""}</p>)}</details>}</> : entry.commercialEligibilityOutcome === "not_eligible" ? <Badge variant="secondary">Not eligible for recovery</Badge> : <span className="text-amber-700 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Unclassified</span>}</TableCell></TableRow>)}{!reconciliation.length && <TableRow><TableCell colSpan={readOnly ? 6 : 7} className="text-center text-muted-foreground">No time entries match these filters.</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
          {selectedEntries.length > 0 && <p className="text-xs text-muted-foreground">{selectedEntries.length} entries selected for an audited classification update.</p>}
        </CardContent>
      </Card>
    </div>
  );
}