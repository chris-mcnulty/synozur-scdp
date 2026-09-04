import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth } from "date-fns";
import { ChevronDown, ChevronRight, Copy, Info, Lock, Plus, ShieldOff, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Grouping = "none" | "month" | "assignment" | "commercial" | "epic" | "workstream" | "stage";
type Option = { id: string; name?: string; label?: string };

interface ProjectTimeWorkbenchProps {
  projectId: string;
  entries: any[];
  loading?: boolean;
  people: any[];
  assignments: any[];
  milestones: any[];
  workstreams: any[];
  epics: any[];
  stages: any[];
  canManage: boolean;
  canClearCoverage: boolean;
  currentUserRole?: string;
  highlightedEntryId?: string | null;
}

interface Draft {
  key: string;
  personId: string;
  date: string;
  hours: string;
  allocationId: string;
  projectStageId: string;
  workstreamId: string;
  description: string;
  billable: boolean;
  milestoneId: string;
  commercialBucketId: string;
  commercialEligibilityOutcome: string;
  commercialApprovalReference: string;
  baselineSow: boolean;
}

const ALL = "__all__";
const MISSING = "__missing__";
const BASELINE = "__baseline__";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newDraft(personId = ""): Draft {
  return {
    key: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    personId,
    date: today(),
    hours: "",
    allocationId: "",
    projectStageId: "",
    workstreamId: "",
    description: "",
    billable: true,
    milestoneId: "",
    commercialBucketId: "",
    commercialEligibilityOutcome: "",
    commercialApprovalReference: "",
    baselineSow: false,
  };
}

function optionName(value: any, fallback: string) {
  return value?.name || value?.label || fallback;
}

function personName(person: any) {
  return person?.name || person?.fullName || person?.email || "Unknown person";
}

function statusOf(entry: any) {
  if (entry.locked || entry.isLocked) return "locked";
  return entry.submissionStatus || entry.status || "draft";
}

function immutableReason(entry: any): string | null {
  // The normalized project-time read model may provide a more precise reason.
  if (entry.readOnlyReason || entry.readonlyReason) return entry.readOnlyReason || entry.readonlyReason;
  if (entry.locked || entry.isLocked) return "Locked in an invoice batch";
  if (entry.invoiceBatchId) return "Included in an invoice batch";
  if (entry.vendorInvoiceLineId) return "Linked to a vendor invoice line";
  if (entry.billedFlag) return "Marked as billed";
  if (entry.readOnly || entry.isReadOnly) return "This entry is read-only";
  return null;
}

function validation(draft: Draft) {
  const hours = Number(draft.hours);
  return {
    personId: !draft.personId ? "Person is required." : "",
    date: !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? "Use a valid date." : "",
    hours: !Number.isFinite(hours) || hours <= 0 || hours > 24 ? "Hours must be between 0.01 and 24." : "",
  };
}

function FieldSelect({ label, value, onChange, options, noneLabel, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  noneLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || MISSING} onValueChange={(v) => onChange(v === MISSING ? "" : v)} disabled={disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={MISSING}>{noneLabel}</SelectItem>
          {options.map((option) => <SelectItem key={option.id} value={option.id}>{optionName(option, "Unnamed")}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ProjectTimeWorkbench({
  projectId, entries, loading, people, assignments, milestones, workstreams, epics, stages,
  canManage, canClearCoverage, currentUserRole, highlightedEntryId,
}: ProjectTimeWorkbenchProps) {
  const { toast } = useToast();
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [filters, setFilters] = useState({
    assignment: ALL, commercial: ALL, epic: ALL, workstream: ALL, stage: ALL,
    person: ALL, startDate: "", endDate: "", billability: ALL, status: ALL,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
  const [bulkCommercial, setBulkCommercial] = useState({ bucketId: "", eligibility: "eligible", approvalReference: "" });
  const [confirm, setConfirm] = useState<{ action: "delete" | "coverage"; entry: any } | null>(null);

  const bucketQuery = useQuery<{ required?: boolean; projectBasis?: string | null; buckets?: any[] }>({
    queryKey: ["/api/projects", projectId, "commercial-buckets"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/commercial-buckets`),
    enabled: !!projectId,
  });
  const buckets = bucketQuery.data?.buckets || [];
  const draftValidation = (draft: Draft) => {
    const bucket = buckets.find((item) => item.id === draft.commercialBucketId);
    return {
      ...validation(draft),
      commercialApprovalReference: bucket?.approvalRequired && draft.commercialEligibilityOutcome === "eligible" && !draft.commercialApprovalReference.trim()
        ? "An approval reference is required for eligible time in this commercial bucket."
        : "",
    };
  };

  const assignmentMap = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);
  const maps = useMemo(() => ({
    people: new Map(people.map((p) => [p.id, personName(p)])),
    workstream: new Map(workstreams.map((x) => [x.id, optionName(x, "Unnamed workstream")])),
    epic: new Map(epics.map((x) => [x.id, optionName(x, "Unnamed epic")])),
    stage: new Map(stages.map((x) => [x.id, optionName(x, "Unnamed stage")])),
    bucket: new Map(buckets.map((x) => [x.id, optionName(x, "Unnamed commercial bucket")])),
  }), [people, workstreams, epics, stages, buckets]);

  const rows = useMemo(() => entries.filter((entry) => entry?.date).map((entry) => {
    const assignment = assignmentMap.get(entry.allocationId);
    const assignmentLabel = entry.assignmentLabel || assignment?.taskDescription || assignment?.roleInstanceLabel ||
      assignment?.role?.name || (entry.allocationId ? "Legacy assignment" : "Unassigned");
    // An epic is assignment hierarchy, never an independently editable
    // time-entry link. The normalized read-model label may still describe
    // legacy rows, while filter/group IDs come only from the assignment.
    const epicId = assignment?.projectEpicId || assignment?.epic?.id || "";
    const workstreamId = entry.workstreamId || entry.projectWorkstreamId || assignment?.projectWorkstreamId || assignment?.workstream?.id || "";
    const stageId = entry.projectStageId || assignment?.projectStageId || assignment?.stage?.id || "";
    const isBaseline = !entry.commercialBucketId && Boolean(
      entry.baselineSow || entry.isBaseline || entry.commercialTreatmentState === "baseline_terms" ||
      entry.commercialTreatment === "baseline_terms" || assignment?.isBaseline,
    );
    const commercialKey = entry.commercialBucketId || (isBaseline ? BASELINE : MISSING);
    return {
      ...entry,
      hoursNumber: Number(entry.hours) || 0,
      isBillable: Boolean(entry.billable ?? entry.isBillable),
      isLocked: Boolean(entry.locked || entry.isLocked),
      immutableReason: immutableReason(entry),
      assignment,
      assignmentLabel,
      epicId,
      epicLabel: entry.epicLabel || entry.epicName || maps.epic.get(epicId) || (epicId ? "Unresolved epic" : "No epic"),
      workstreamId,
      workstreamLabel: entry.workstreamLabel || entry.workstreamName || maps.workstream.get(workstreamId) || (workstreamId ? "Unresolved workstream" : "No workstream"),
      stageId,
      stageLabel: entry.stageLabel || entry.stageName || maps.stage.get(stageId) || entry.phase || (stageId ? "Unresolved stage" : "No stage"),
      commercialKey,
      commercialLabel: entry.commercialTreatmentLabel || entry.commercialBucketLabel || maps.bucket.get(entry.commercialBucketId) ||
        (isBaseline ? "Baseline terms" : "No commercial bucket"),
      personLabel: entry.personName || maps.people.get(entry.personId) || "Unknown person",
      normalizedStatus: statusOf(entry),
    };
  }), [entries, assignmentMap, maps]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (filters.assignment !== ALL && (filters.assignment === MISSING ? !!row.allocationId : row.allocationId !== filters.assignment)) return false;
    if (filters.commercial !== ALL && row.commercialKey !== filters.commercial) return false;
    if (filters.epic !== ALL && (filters.epic === MISSING ? !!row.epicId : row.epicId !== filters.epic)) return false;
    if (filters.workstream !== ALL && (filters.workstream === MISSING ? !!row.workstreamId : row.workstreamId !== filters.workstream)) return false;
    if (filters.stage !== ALL && (filters.stage === MISSING ? !!row.stageId : row.stageId !== filters.stage)) return false;
    if (filters.person !== ALL && (filters.person === MISSING ? !!row.personId : row.personId !== filters.person)) return false;
    if (filters.startDate && row.date < filters.startDate) return false;
    if (filters.endDate && row.date > filters.endDate) return false;
    if (filters.billability !== ALL && row.isBillable !== (filters.billability === "billable")) return false;
    if (filters.status !== ALL && row.normalizedStatus !== filters.status) return false;
    return true;
  }), [rows, filters]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    filtered.forEach((row) => {
      let label = "All entries";
      if (grouping === "month") {
        try { label = format(startOfMonth(parseISO(row.date)), "MMMM yyyy"); } catch { label = "Invalid date"; }
      } else if (grouping === "assignment") label = row.assignmentLabel;
      else if (grouping === "commercial") label = row.commercialLabel;
      else if (grouping === "epic") label = row.epicLabel;
      else if (grouping === "workstream") label = row.workstreamLabel;
      else if (grouping === "stage") label = row.stageLabel;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(row);
    });
    return [...groups.entries()].map(([name, groupRows]) => ({
      name,
      rows: groupRows.sort((a, b) => b.date.localeCompare(a.date)),
      total: groupRows.reduce((n, row) => n + row.hoursNumber, 0),
      billable: groupRows.filter((row) => row.isBillable).reduce((n, row) => n + row.hoursNumber, 0),
    }));
  }, [filtered, grouping]);

  const summary = useMemo(() => ({
    total: filtered.reduce((n, row) => n + row.hoursNumber, 0),
    billable: filtered.filter((row) => row.isBillable).reduce((n, row) => n + row.hoursNumber, 0),
    nonbillable: filtered.filter((row) => !row.isBillable).reduce((n, row) => n + row.hoursNumber, 0),
  }), [filtered]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [`/api/time-entries?projectId=${projectId}`] });
  const updateMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: Draft }) => apiRequest(`/api/time-entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        personId: draft.personId, date: draft.date, hours: draft.hours, allocationId: draft.allocationId || null,
        projectStageId: draft.projectStageId || null,
        workstreamId: draft.workstreamId || null, description: draft.description, billable: draft.billable,
        milestoneId: draft.milestoneId || null,
        commercialBucketId: draft.baselineSow ? null : draft.commercialBucketId || null,
        commercialEligibilityOutcome: draft.baselineSow ? "not_eligible" : draft.commercialEligibilityOutcome || null,
        commercialApprovalReference: draft.baselineSow ? null : draft.commercialApprovalReference.trim() || null,
        baselineSow: draft.baselineSow,
      }),
    }),
    onSuccess: () => { refresh(); setExpandedId(null); setEditor(null); toast({ title: "Time entry updated" }); },
    onError: (error: Error) => toast({ title: "Time entry could not be updated", description: error.message, variant: "destructive" }),
  });
  const batchMutation = useMutation({
    mutationFn: (items: Draft[]) => apiRequest("/api/time-entries/batch-create", {
      method: "POST",
      body: JSON.stringify({ projectId, entries: items.map((d) => ({
        ...d, key: undefined, allocationId: d.allocationId || undefined,
        projectStageId: d.projectStageId || undefined,
        workstreamId: d.workstreamId || undefined, milestoneId: d.milestoneId || undefined,
        commercialBucketId: d.baselineSow ? null : d.commercialBucketId || null,
        commercialEligibilityOutcome: d.baselineSow ? "not_eligible" : d.commercialEligibilityOutcome || undefined,
        commercialApprovalReference: d.baselineSow ? null : d.commercialApprovalReference.trim() || undefined,
      })) }),
    }),
    onSuccess: () => { refresh(); setDrafts([newDraft()]); setShowComposer(false); toast({ title: "Time entries saved" }); },
    onError: (error: Error) => toast({ title: "Rows were not saved", description: error.message, variant: "destructive" }),
  });
  const bulkMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => apiRequest("/api/time-entries/bulk-update", {
      method: "POST", body: JSON.stringify({ ids: [...selected], updates, projectId }),
    }),
    onSuccess: (result: any) => {
      refresh(); setSelected(new Set());
      toast({ title: "Selected entries updated", description: result?.errors?.length ? result.errors.join(" ") : undefined });
    },
    onError: (error: Error) => toast({ title: "Bulk update failed", description: error.message, variant: "destructive" }),
  });
  const destructiveMutation = useMutation({
    mutationFn: ({ action, entry }: { action: "delete" | "coverage"; entry: any }) => action === "delete"
      ? apiRequest(`/api/time-entries/${entry.id}`, { method: "DELETE" })
      : apiRequest(`/api/time-entries/${entry.id}`, { method: "PATCH", body: JSON.stringify({ coveredByMilestoneId: null }) }),
    onSuccess: (_, values) => { refresh(); toast({ title: values.action === "delete" ? "Time entry deleted" : "Milestone coverage cleared" }); },
    onError: (error: Error) => toast({ title: "Action failed", description: error.message, variant: "destructive" }),
  });

  const assignmentSelected = (draft: Draft, allocationId: string): Draft => {
    const assignment = assignmentMap.get(allocationId);
    return {
      ...draft,
      allocationId,
      personId: assignment?.personId || draft.personId,
      projectStageId: assignment?.projectStageId || assignment?.stage?.id || "",
      workstreamId: assignment?.projectWorkstreamId || assignment?.workstream?.id || "",
    };
  };
  const openEditor = (row: any) => {
    if (expandedId === row.id) { setExpandedId(null); setEditor(null); return; }
    setExpandedId(row.id);
    setEditor({
      key: row.id, personId: row.personId || "", date: row.date, hours: String(row.hoursNumber),
      allocationId: row.allocationId || "", projectStageId: row.stageId,
      workstreamId: row.workstreamId, description: row.description || "", billable: row.isBillable,
      milestoneId: row.milestoneId || "", commercialBucketId: row.commercialBucketId || "",
      commercialEligibilityOutcome: row.commercialEligibilityOutcome || "", commercialApprovalReference: row.commercialApprovalReference || "", baselineSow: row.commercialKey === BASELINE,
    });
  };
  const editable = (row: any) => canManage && !row.immutableReason &&
    (!["submitted", "approved"].includes(row.normalizedStatus) || ["admin", "billing-admin"].includes(currentUserRole || ""));
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const hasLockedSelection = selectedRows.some((row) => !editable(row));
  const allVisibleSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.id));
  const bulkBucket = buckets.find((bucket) => bucket.id === bulkCommercial.bucketId);
  const bulkCommercialNeedsApproval = !!bulkBucket?.approvalRequired && bulkCommercial.eligibility === "eligible";

  const renderDraftFields = (draft: Draft, setDraft: (next: Draft) => void, includePerson = true) => {
    const errors = draftValidation(draft);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {includePerson && <FieldSelect label="Person" value={draft.personId} onChange={(personId) => setDraft({ ...draft, personId })} options={people.map((p) => ({ ...p, name: personName(p) }))} noneLabel="Select person" />}
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />{errors.date && <p className="text-xs text-destructive">{errors.date}</p>}</div>
        <div className="space-y-1"><Label>Hours</Label><Input type="number" min="0.01" max="24" step="0.25" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} />{errors.hours && <p className="text-xs text-destructive">{errors.hours}</p>}</div>
        <FieldSelect label="Assignment" value={draft.allocationId} onChange={(id) => setDraft(assignmentSelected(draft, id))} options={assignments.map((a) => ({ id: a.id, name: a.taskDescription || a.roleInstanceLabel || a.role?.name || "Unnamed assignment" }))} noneLabel="Unassigned" />
        <FieldSelect label="Workstream" value={draft.workstreamId} onChange={(workstreamId) => setDraft({ ...draft, workstreamId })} options={workstreams} noneLabel="No workstream" />
        <FieldSelect label="Stage" value={draft.projectStageId} onChange={(projectStageId) => setDraft({ ...draft, projectStageId })} options={stages} noneLabel="No stage" />
        <FieldSelect label="Milestone coverage" value={draft.milestoneId} onChange={(milestoneId) => setDraft({ ...draft, milestoneId })} options={milestones} noneLabel="No milestone" />
        <FieldSelect label="Commercial treatment" value={draft.baselineSow ? BASELINE : draft.commercialBucketId} onChange={(commercialBucketId) => {
          if (commercialBucketId === BASELINE) {
            setDraft({ ...draft, commercialBucketId: "", commercialEligibilityOutcome: "not_eligible", commercialApprovalReference: "", baselineSow: true });
            return;
          }
          const bucket = buckets.find((b) => b.id === commercialBucketId);
          setDraft({ ...draft, commercialBucketId, commercialEligibilityOutcome: commercialBucketId ? draft.commercialEligibilityOutcome || bucket?.defaultEligibilityOutcome || "eligible" : "", baselineSow: false });
        }} options={[{ id: BASELINE, name: "Baseline terms" }, ...buckets.filter((b) => b.isActive !== false)]} noneLabel={bucketQuery.data?.required ? "Classification required" : "No commercial bucket"} />
        {!!draft.commercialBucketId && (
          <>
            <div className="space-y-1"><Label>Eligibility</Label><Select value={draft.commercialEligibilityOutcome || "eligible"} onValueChange={(commercialEligibilityOutcome) => setDraft({ ...draft, commercialEligibilityOutcome })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="eligible">Eligible</SelectItem><SelectItem value="not_eligible">Not eligible for recovery</SelectItem><SelectItem value="pending_approval">Pending approval</SelectItem></SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-2"><Label>Approval reference {buckets.find((bucket) => bucket.id === draft.commercialBucketId)?.approvalRequired && draft.commercialEligibilityOutcome === "eligible" ? "(required)" : "(optional)"}</Label><Input value={draft.commercialApprovalReference} onChange={(event) => setDraft({ ...draft, commercialApprovalReference: event.target.value })} aria-describedby={errors.commercialApprovalReference ? `approval-error-${draft.key}` : undefined} />{errors.commercialApprovalReference && <p id={`approval-error-${draft.key}`} className="text-xs text-destructive" role="alert">{errors.commercialApprovalReference}</p>}</div>
          </>
        )}
        <div className="space-y-1 sm:col-span-2"><Label>Description</Label><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} /></div>
        <div className="flex items-center gap-2 pt-6"><Checkbox id={`billable-${draft.key}`} checked={draft.billable} onCheckedChange={(billable) => setDraft({ ...draft, billable: !!billable })} /><Label htmlFor={`billable-${draft.key}`}>Billable effort</Label></div>
        {errors.personId && <p className="text-xs text-destructive">{errors.personId}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-5" data-testid="project-time-workbench">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div><h3 className="text-lg font-semibold">Time workbench</h3><p className="text-sm text-muted-foreground">Find, add, and maintain project effort.</p></div>
        {canManage && <Button size="sm" onClick={() => setShowComposer((open) => !open)} aria-expanded={showComposer}><Plus className="h-4 w-4 mr-2" />Add rows</Button>}
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Time is an effort measure</AlertTitle>
        <AlertDescription>Recognized project revenue comes from financial and revenue-recognition records. Fixed-price, retainer, and baseline-SOW time tracks effort and is not revenue calculated from hours × rate. “Baseline terms” is a display classification, not a stored commercial bucket.</AlertDescription>
      </Alert>

      {showComposer && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add project time rows</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {drafts.map((draft, index) => (
              <div key={draft.key} className="rounded-md border p-3 space-y-3">
                <div className="flex justify-between"><span className="text-sm font-medium">Row {index + 1}</span><div className="flex">
                  <Button variant="ghost" size="icon" aria-label={`Duplicate row ${index + 1}`} onClick={() => setDrafts((old) => [...old.slice(0, index + 1), { ...draft, key: newDraft().key }, ...old.slice(index + 1)])}><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} disabled={drafts.length === 1} onClick={() => setDrafts((old) => old.filter((item) => item.key !== draft.key))}><X className="h-4 w-4" /></Button>
                </div></div>
                {renderDraftFields(draft, (next) => setDrafts((old) => old.map((item) => item.key === draft.key ? next : item)))}
              </div>
            ))}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setDrafts((old) => [...old, newDraft(old.at(-1)?.personId)])}><Plus className="h-4 w-4 mr-2" />Add another row</Button>
              <Button disabled={batchMutation.isPending || drafts.some((draft) => Object.values(draftValidation(draft)).some(Boolean))} onClick={() => batchMutation.mutate(drafts)}>{batchMutation.isPending ? "Saving all…" : `Save all ${drafts.length} rows`}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[["Total effort", summary.total], ["Billable effort", summary.billable], ["Non-billable effort", summary.nonbillable]].map(([label, value]) => (
          <Card key={String(label)}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{Number(value).toFixed(1)}h</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filter and group</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {([
            ["Assignment", "assignment", assignments, "Unassigned"],
            ["Epic", "epic", epics, "No epic"],
            ["Workstream", "workstream", workstreams, "No workstream"],
            ["Stage", "stage", stages, "No stage"],
            ["Person", "person", people.map((p) => ({ ...p, name: personName(p) })), "Unknown person"],
          ] as Array<[string, "assignment" | "epic" | "workstream" | "stage" | "person", any[], string]>).map(([label, key, options, missing]) => (
            <div className="space-y-1" key={String(key)}><Label>{String(label)}</Label><Select value={(filters as any)[key]} onValueChange={(value) => { setFilters((old) => ({ ...old, [key as string]: value })); setSelected(new Set()); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>All</SelectItem><SelectItem value={MISSING}>{String(missing)}</SelectItem>{(options as any[]).map((item) => <SelectItem key={item.id} value={item.id}>{item.name || item.label || item.taskDescription || item.roleInstanceLabel || item.role?.name || "Unnamed"}</SelectItem>)}</SelectContent></Select></div>
          ))}
          <div className="space-y-1"><Label>Commercial treatment</Label><Select value={filters.commercial} onValueChange={(commercial) => setFilters((old) => ({ ...old, commercial }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>All</SelectItem><SelectItem value={BASELINE}>Baseline terms</SelectItem><SelectItem value={MISSING}>No commercial bucket</SelectItem>{buckets.map((bucket) => <SelectItem key={bucket.id} value={bucket.id}>{optionName(bucket, "Unnamed")}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Start date</Label><Input type="date" value={filters.startDate} onChange={(e) => setFilters((old) => ({ ...old, startDate: e.target.value }))} /></div>
          <div className="space-y-1"><Label>End date</Label><Input type="date" value={filters.endDate} onChange={(e) => setFilters((old) => ({ ...old, endDate: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Billability</Label><Select value={filters.billability} onValueChange={(billability) => setFilters((old) => ({ ...old, billability }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>All</SelectItem><SelectItem value="billable">Billable</SelectItem><SelectItem value="nonbillable">Non-billable</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Status</Label><Select value={filters.status} onValueChange={(status) => setFilters((old) => ({ ...old, status }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>All</SelectItem>{["draft", "submitted", "approved", "rejected", "locked"].map((status) => <SelectItem key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Group by</Label><Select value={grouping} onValueChange={(value) => setGrouping(value as Grouping)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["none", "month", "assignment", "commercial", "epic", "workstream", "stage"] as Grouping[]).map((value) => <SelectItem key={value} value={value}>{value === "none" ? "No grouping" : value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end"><Button variant="ghost" onClick={() => { setFilters({ assignment: ALL, commercial: ALL, epic: ALL, workstream: ALL, stage: ALL, person: ALL, startDate: "", endDate: "", billability: ALL, status: ALL }); setSelected(new Set()); }}>Clear all filters</Button></div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 rounded-md border bg-background p-3 shadow-sm flex flex-wrap items-center gap-2" role="toolbar" aria-label="Selected time entry actions">
          <strong className="text-sm">{selected.size} selected</strong>
          {hasLockedSelection ? <span className="text-sm text-amber-700 flex items-center gap-1"><Lock className="h-4 w-4" />Remove locked, submitted, or approved rows to make bulk changes.</span> : <>
            <Button size="sm" variant="outline" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate({ billable: true })}>Mark billable</Button>
            <Button size="sm" variant="outline" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate({ billable: false })}>Mark non-billable</Button>
            <Select onValueChange={(projectStageId) => bulkMutation.mutate({ projectStageId: projectStageId === MISSING ? null : projectStageId })}><SelectTrigger className="w-40 h-9"><SelectValue placeholder="Set stage…" /></SelectTrigger><SelectContent><SelectItem value={MISSING}>No stage</SelectItem>{stages.map((x) => <SelectItem key={x.id} value={x.id}>{optionName(x, "Unnamed")}</SelectItem>)}</SelectContent></Select>
            <Select onValueChange={(allocationId) => {
              const assignment = assignmentMap.get(allocationId);
              bulkMutation.mutate({ allocationId: allocationId === MISSING ? null : allocationId, projectStageId: assignment?.projectStageId || null, workstreamId: assignment?.projectWorkstreamId || null });
            }}><SelectTrigger className="w-44 h-9"><SelectValue placeholder="Set assignment…" /></SelectTrigger><SelectContent><SelectItem value={MISSING}>Unassigned</SelectItem>{assignments.map((a) => <SelectItem key={a.id} value={a.id}>{a.taskDescription || a.roleInstanceLabel || a.role?.name || "Unnamed"}</SelectItem>)}</SelectContent></Select>
            <Select onValueChange={(personId) => bulkMutation.mutate({ personId })}><SelectTrigger className="w-40 h-9"><SelectValue placeholder="Set person…" /></SelectTrigger><SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{personName(p)}</SelectItem>)}</SelectContent></Select>
            <div className="flex flex-wrap items-end gap-2 rounded border p-2">
              <div className="space-y-1"><Label className="text-xs">Commercial treatment</Label><Select value={bulkCommercial.bucketId || MISSING} onValueChange={(bucketId) => {
                if (bucketId === BASELINE) setBulkCommercial({ bucketId, eligibility: "not_eligible", approvalReference: "" });
                else if (bucketId === MISSING) setBulkCommercial({ bucketId: "", eligibility: "", approvalReference: "" });
                else setBulkCommercial((old) => ({ ...old, bucketId, eligibility: old.eligibility || buckets.find((bucket) => bucket.id === bucketId)?.defaultEligibilityOutcome || "eligible" }));
              }}><SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={BASELINE}>Baseline terms</SelectItem><SelectItem value={MISSING}>No commercial bucket</SelectItem>{buckets.map((x) => <SelectItem key={x.id} value={x.id}>{optionName(x, "Unnamed")}</SelectItem>)}</SelectContent></Select></div>
              {!!bulkCommercial.bucketId && bulkCommercial.bucketId !== BASELINE && <div className="space-y-1"><Label className="text-xs">Eligibility</Label><Select value={bulkCommercial.eligibility || "eligible"} onValueChange={(eligibility) => setBulkCommercial((old) => ({ ...old, eligibility }))}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="eligible">Eligible</SelectItem><SelectItem value="not_eligible">Not eligible</SelectItem><SelectItem value="pending_approval">Pending approval</SelectItem></SelectContent></Select></div>}
              {bulkCommercialNeedsApproval && <div className="space-y-1"><Label className="text-xs">Approval reference (required)</Label><Input className="h-9 w-52" value={bulkCommercial.approvalReference} onChange={(event) => setBulkCommercial((old) => ({ ...old, approvalReference: event.target.value }))} aria-describedby="bulk-commercial-help" /></div>}
              <Button size="sm" disabled={bulkMutation.isPending || (bulkCommercialNeedsApproval && !bulkCommercial.approvalReference.trim())} onClick={() => bulkMutation.mutate(bulkCommercial.bucketId === BASELINE ? { commercialBucketId: null, baselineSow: true, commercialEligibilityOutcome: "not_eligible", commercialApprovalReference: null } : { commercialBucketId: bulkCommercial.bucketId || null, baselineSow: false, commercialEligibilityOutcome: bulkCommercial.eligibility || null, commercialApprovalReference: bulkCommercial.approvalReference.trim() || null })}>Apply commercial</Button>
              {bulkCommercialNeedsApproval && !bulkCommercial.approvalReference.trim() && <span id="bulk-commercial-help" className="text-xs text-destructive" role="alert">An approval reference is required before applying this bucket.</span>}
            </div>
          </>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      {loading ? <Card><CardContent className="py-10 text-center text-muted-foreground">Loading project time…</CardContent></Card> :
      grouped.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No time entries match these filters.</CardContent></Card> :
      grouped.map((group) => (
        <Card key={group.name}>
          <CardHeader className="pb-2"><div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between"><CardTitle className="text-base">{group.name}</CardTitle><p className="text-sm text-muted-foreground">{group.total.toFixed(1)}h total · {group.billable.toFixed(1)}h billable · {(group.total - group.billable).toFixed(1)}h non-billable</p></div></CardHeader>
          <CardContent className="overflow-x-auto px-0 sm:px-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><Checkbox aria-label="Select all visible entries" checked={allVisibleSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(filtered.filter(editable).map((row) => row.id)) : new Set())} /></TableHead>
                <TableHead className="w-10"><span className="sr-only">Expand</span></TableHead><TableHead>Date / person</TableHead><TableHead>Effort</TableHead><TableHead>Assignment / hierarchy</TableHead><TableHead>Commercial</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{group.rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow data-testid={`time-entry-${row.id}`} className={highlightedEntryId === row.id ? "bg-primary/10 ring-1 ring-primary" : ""}>
                    <TableCell><Checkbox aria-label={`Select ${row.personLabel} entry on ${row.date}`} checked={selected.has(row.id)} disabled={!editable(row)} onCheckedChange={(checked) => setSelected((old) => { const next = new Set(old); checked ? next.add(row.id) : next.delete(row.id); return next; })} /></TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${expandedId === row.id ? "Collapse" : "Expand"} time entry`} aria-expanded={expandedId === row.id} onClick={() => openEditor(row)}>{expandedId === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell>
                    <TableCell><div className="whitespace-nowrap">{row.date}</div><div className="text-sm text-muted-foreground">{row.personLabel}</div></TableCell>
                    <TableCell><strong>{row.hoursNumber.toFixed(1)}h</strong><div className="text-xs text-muted-foreground">{row.isBillable ? "Billable" : "Non-billable"}</div></TableCell>
                    <TableCell className="min-w-[240px]"><div className="font-medium">{row.assignmentLabel}</div><div className="text-xs text-muted-foreground">{row.epicLabel} · {row.workstreamLabel} · {row.stageLabel}</div><div className="max-w-[360px] truncate text-sm" title={row.description}>{row.description || "No description"}</div></TableCell>
                    <TableCell><Badge variant="outline">{row.commercialLabel}</Badge><div className="text-xs text-muted-foreground mt-1">{row.commercialEligibilityOutcome?.replaceAll("_", " ") || "No eligibility decision"}</div></TableCell>
                    <TableCell><Badge variant={row.immutableReason ? "secondary" : "outline"}>{row.normalizedStatus}</Badge>{row.immutableReason && <div className="mt-1 flex max-w-[180px] items-start gap-1 text-xs text-muted-foreground"><Lock className="mt-0.5 h-3 w-3 shrink-0" />{row.immutableReason}</div>}{row.coveredByMilestoneId && <div className="text-xs text-purple-700 mt-1">Covered by {row.coveredByMilestoneName || "milestone"}</div>}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {row.coveredByMilestoneId && canClearCoverage && !row.immutableReason && <Button variant="ghost" size="icon" aria-label="Clear milestone coverage" onClick={() => setConfirm({ action: "coverage", entry: row })}><ShieldOff className="h-4 w-4" /></Button>}
                      {editable(row) && <Button variant="ghost" size="icon" className="text-destructive" aria-label="Delete time entry" onClick={() => setConfirm({ action: "delete", entry: row })}><Trash2 className="h-4 w-4" /></Button>}
                    </TableCell>
                  </TableRow>
                  {expandedId === row.id && <TableRow><TableCell colSpan={8} className="bg-muted/20 p-4">
                    {!editable(row) ? <Alert><Lock className="h-4 w-4" /><AlertTitle>Read only</AlertTitle><AlertDescription>{row.immutableReason || `This ${row.normalizedStatus} entry cannot be edited in the project workbench.`}</AlertDescription></Alert> :
                    editor && <form onSubmit={(e) => { e.preventDefault(); if (!Object.values(draftValidation(editor)).some(Boolean)) updateMutation.mutate({ id: row.id, draft: editor }); }} className="space-y-4">
                      {renderDraftFields(editor, setEditor)}
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setExpandedId(null); setEditor(null); }}>Cancel</Button><Button type="submit" disabled={updateMutation.isPending || Object.values(draftValidation(editor)).some(Boolean)}>{updateMutation.isPending ? "Saving…" : "Save changes"}</Button></div>
                    </form>}
                  </TableCell></TableRow>}
                </Fragment>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.action === "delete" ? "Delete time entry?" : "Clear milestone coverage?"}</AlertDialogTitle><AlertDialogDescription>{confirm?.action === "delete" ? "This permanently deletes the selected project time entry. This action cannot be undone." : "The entry will return to eligible unbilled time. Its hours and other details will not change."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirm) destructiveMutation.mutate(confirm); setConfirm(null); }}>{confirm?.action === "delete" ? "Delete entry" : "Clear coverage"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}