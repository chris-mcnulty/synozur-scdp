import { useState, useMemo, Fragment } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, BarChart3, List, Check, X, ChevronDown, ChevronUp, ChevronRight, Filter, Wand2, Calculator, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PMWizardDialog } from "@/components/pm-wizard-dialog";
import type { Estimate, EstimateLineItem, EstimateEpic, EstimateStage } from "@shared/schema";

interface ProgramEstimateViewProps {
  estimate: Estimate;
  lineItems: EstimateLineItem[];
  epics: EstimateEpic[];
  stages: EstimateStage[];
  users: any[];
  roles: any[];
  isEditable: boolean;
  estimateId: string;
}

const UTILIZATION_OPTIONS = [
  { value: 20, label: "20% (8 hrs/wk)" },
  { value: 40, label: "40% (16 hrs/wk)" },
  { value: 60, label: "60% (24 hrs/wk)" },
  { value: 80, label: "80% (32 hrs/wk)" },
  { value: 100, label: "100% (40 hrs/wk)" },
];

const BLOCK_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
  "bg-orange-500", "bg-pink-500",
];

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const COMPLEXITY_OPTIONS = [
  { value: "small", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "High" },
];

const CONFIDENCE_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function calcAdjustedHours(
  durationWeeks: number,
  utilizationPercent: number,
  size: string,
  complexity: string,
  confidence: string,
  estimate: Estimate
): number {
  const hoursPerWeek = (utilizationPercent / 100) * 40;
  const baseHours = durationWeeks * hoursPerWeek;

  let sizeMultiplier = 1.0;
  if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
  else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);

  let complexityMultiplier = 1.0;
  if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
  else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);

  let confidenceMultiplier = 1.0;
  if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
  else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);

  return baseHours * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
}

interface BlockForm {
  description: string;
  comments: string;
  epicId: string;
  stageId: string;
  workstream: string;
  roleId: string;
  roleFreeText: string;
  userId: string;
  startWeek: string;
  durationWeeks: string;
  utilizationPercent: string;
  billingRate: string;
  costRate: string;
  size: string;
  complexity: string;
  confidence: string;
}

const defaultForm = (): BlockForm => ({
  description: "",
  comments: "",
  epicId: "none",
  stageId: "none",
  workstream: "",
  roleId: "none",
  roleFreeText: "",
  userId: "none",
  startWeek: "1",
  durationWeeks: "4",
  utilizationPercent: "100",
  billingRate: "0",
  costRate: "0",
  size: "small",
  complexity: "small",
  confidence: "high",
});

interface FormRowProps {
  f: BlockForm;
  setF: (f: BlockForm) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  epics: any[];
  stages: any[];
  roles: any[];
  users: any[];
  estimate: Estimate;
}

const FormRow = ({
  f,
  setF,
  onSubmit,
  onCancel,
  submitLabel,
  epics,
  stages,
  roles,
  users,
  estimate,
}: FormRowProps) => {
  const filteredStages = (epicId: string) => stages.filter((s: any) => s.epicId === epicId);
  const resolveRateFromUser = (userId: string) => {
    const u = users.find((u: any) => u.id === userId);
    return { billingRate: u?.defaultBillingRate || "0", costRate: u?.defaultCostRate || "0" };
  };
  const resolveRateFromRole = (roleId: string) => {
    const r = roles.find((r: any) => r.id === roleId);
    return { billingRate: r?.defaultRackRate || "0", costRate: r?.defaultCostRate || "0" };
  };

  const d = Number(f.durationWeeks) || 0;
  const u = Number(f.utilizationPercent) || 100;
  const h = d * (u / 100) * 40;
  const adj = calcAdjustedHours(d, u, f.size, f.complexity, f.confidence, estimate);
  const total = adj * (Number(f.billingRate) || 0);

  return (
    <div className="space-y-1.5 p-2 border-b bg-muted/20">
      {/* Row 1: Role / Start Week / Duration */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="col-span-2">
          <Label className="text-xs">Role / Resource *</Label>
          <div className="flex gap-1.5 mt-0.5">
            <Select
              value={f.roleId}
              onValueChange={(v) => {
                const rates = v !== "none" ? resolveRateFromRole(v) : { billingRate: f.billingRate, costRate: f.costRate };
                setF({ ...f, roleId: v, ...rates });
              }}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Role catalog" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Role catalog —</SelectItem>
                {roles.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={f.userId}
              onValueChange={(v) => {
                const rates = v !== "none" ? resolveRateFromUser(v) : { billingRate: f.billingRate, costRate: f.costRate };
                setF({ ...f, userId: v, roleFreeText: v !== "none" ? (users.find((u: any) => u.id === v)?.name || "") : f.roleFreeText, ...rates });
              }}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Named person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Named person —</SelectItem>
                {users.filter((u: any) => u.isAssignable).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {f.roleId === "none" && f.userId === "none" && (
            <Input
              className="h-7 text-xs mt-0.5"
              placeholder="Free-text role name (e.g. Principal Architect)"
              value={f.roleFreeText}
              onChange={(e) => setF({ ...f, roleFreeText: e.target.value })}
            />
          )}
        </div>

        <div>
          <Label className="text-xs">Start Week</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            type="number"
            min="1"
            value={f.startWeek}
            onChange={(e) => setF({ ...f, startWeek: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Duration (weeks)</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            type="number"
            min="1"
            value={f.durationWeeks}
            onChange={(e) => setF({ ...f, durationWeeks: e.target.value })}
          />
        </div>
      </div>

      {/* Row 2: All 8 contingency/rate fields in one dense row */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        <div>
          <Label className="text-xs">Utilization</Label>
          <Select value={f.utilizationPercent} onValueChange={(v) => setF({ ...f, utilizationPercent: v })}>
            <SelectTrigger className="h-7 text-xs mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UTILIZATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Billing ($/hr)</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            type="number"
            step="0.01"
            value={f.billingRate}
            onChange={(e) => setF({ ...f, billingRate: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Cost ($/hr)</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            type="number"
            step="0.01"
            value={f.costRate}
            onChange={(e) => setF({ ...f, costRate: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Epic</Label>
          <Select value={f.epicId} onValueChange={(v) => setF({ ...f, epicId: v, stageId: "none" })}>
            <SelectTrigger className="h-7 text-xs mt-0.5">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {epics.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Stage</Label>
          <Select value={f.stageId} onValueChange={(v) => setF({ ...f, stageId: v })} disabled={f.epicId === "none"}>
            <SelectTrigger className="h-7 text-xs mt-0.5">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {filteredStages(f.epicId).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Workstream</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            placeholder="Optional"
            value={f.workstream}
            onChange={(e) => setF({ ...f, workstream: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Size</Label>
          <Select value={f.size} onValueChange={(v) => setF({ ...f, size: v })}>
            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Complexity</Label>
          <Select value={f.complexity} onValueChange={(v) => setF({ ...f, complexity: v })}>
            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPLEXITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Confidence / Description / Comments */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        <div>
          <Label className="text-xs">Confidence</Label>
          <Select value={f.confidence} onValueChange={(v) => setF({ ...f, confidence: v })}>
            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONFIDENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-3">
          <Label className="text-xs">Description</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            placeholder="Block description"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>

        <div className="col-span-4">
          <Label className="text-xs">Comments</Label>
          <Input
            className="h-7 text-xs mt-0.5"
            placeholder="Optional comments or notes"
            value={f.comments}
            onChange={(e) => setF({ ...f, comments: e.target.value })}
          />
        </div>
      </div>

      {/* Recalc bar + action buttons */}
      <div className="flex items-center gap-3 pt-0.5">
        <div className="flex-1 rounded bg-muted/50 border px-3 py-1.5 text-xs font-mono">
          <span className="text-muted-foreground">Recalc: </span>
          <span>{h} base hrs</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="font-semibold">{adj.toFixed(1)} adj hrs</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        </div>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        )}
        <Button size="sm" onClick={onSubmit}>
          {submitLabel === "Add Block" ? <Plus className="h-3.5 w-3.5 mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
};

export function ProgramEstimateView({
  estimate,
  lineItems,
  epics,
  stages,
  users,
  roles,
  isEditable,
  estimateId,
}: ProgramEstimateViewProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<BlockForm>(defaultForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<BlockForm>(defaultForm());
  const [view, setView] = useState<"table" | "gantt">("table");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPMWizard, setShowPMWizard] = useState(false);
  const [showRecalcDialog, setShowRecalcDialog] = useState(false);

  // Filters
  const [filterEpic, setFilterEpic] = useState("all");
  const [filterResource, setFilterResource] = useState("all");
  const [filterText, setFilterText] = useState("");

  const programBlocks = useMemo(
    () => lineItems
      .filter((li) => li.durationWeeks != null)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [lineItems]
  );

  // Unique resource names for filter dropdown
  const resourceNames = useMemo(() => {
    const names = new Set<string>();
    programBlocks.forEach((b) => { if (b.resourceName) names.add(b.resourceName); });
    return Array.from(names).sort();
  }, [programBlocks]);

  const filteredBlocks = useMemo(() => {
    return programBlocks.filter((b) => {
      const matchesEpic = filterEpic === "all" || b.epicId === filterEpic;
      const matchesResource = filterResource === "all" || b.resourceName === filterResource;
      const matchesText = !filterText ||
        (b.description || "").toLowerCase().includes(filterText.toLowerCase()) ||
        (b.resourceName || "").toLowerCase().includes(filterText.toLowerCase());
      return matchesEpic && matchesResource && matchesText;
    });
  }, [programBlocks, filterEpic, filterResource, filterText]);

  const hasFilters = filterEpic !== "all" || filterResource !== "all" || filterText !== "";

  const epicColorMap = useMemo(() => {
    const map = new Map<string, string>();
    epics.forEach((epic, i) => {
      map.set(epic.id, BLOCK_COLORS[i % BLOCK_COLORS.length]);
    });
    return map;
  }, [epics]);

  const buildPayload = (f: BlockForm) => {
    const durationWeeks = Number(f.durationWeeks) || 1;
    const utilizationPercent = Number(f.utilizationPercent) || 100;
    const billingRate = Number(f.billingRate) || 0;
    const costRate = Number(f.costRate) || 0;

    const adjustedHours = calcAdjustedHours(
      durationWeeks, utilizationPercent, f.size, f.complexity, f.confidence, estimate
    );
    const totalAmount = adjustedHours * billingRate;
    const totalCost = adjustedHours * costRate;
    const margin = totalAmount - totalCost;
    const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
    const hoursPerWeek = (utilizationPercent / 100) * 40;
    const baseHoursRaw = durationWeeks * hoursPerWeek;

    const resolvedRole = f.roleId !== "none" ? roles.find((r: any) => r.id === f.roleId) : null;
    const resolvedUser = f.userId !== "none" ? users.find((u: any) => u.id === f.userId) : null;
    const roleLabel = resolvedUser?.name || resolvedRole?.name || f.roleFreeText || "Unnamed Role";

    return {
      description: f.description || roleLabel,
      comments: f.comments || null,
      epicId: f.epicId === "none" ? null : f.epicId,
      stageId: f.stageId === "none" ? null : f.stageId,
      workstream: f.workstream || null,
      week: Number(f.startWeek) || 1,
      durationWeeks,
      utilizationPercent,
      baseHours: String(baseHoursRaw),
      factor: "1",
      rate: String(billingRate),
      costRate: String(costRate),
      size: f.size,
      complexity: f.complexity,
      confidence: f.confidence,
      assignedUserId: f.userId !== "none" ? f.userId : null,
      roleId: f.roleId !== "none" ? f.roleId : null,
      resourceName: roleLabel,
      adjustedHours: String(adjustedHours),
      totalAmount: String(totalAmount),
      totalCost: String(totalCost),
      margin: String(margin),
      marginPercent: String(marginPercent),
      sortOrder: programBlocks.length,
    };
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/estimates/${estimateId}/line-items`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      setForm(defaultForm());
      setShowAddForm(false);
      toast({ title: "Block added" });
    },
    onError: () => toast({ title: "Failed to add block", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/estimates/${estimateId}/line-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      setEditingId(null);
      toast({ title: "Block updated" });
    },
    onError: () => toast({ title: "Failed to update block", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/estimates/${estimateId}/line-items/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      toast({ title: "Block removed" });
    },
    onError: () => toast({ title: "Failed to remove block", variant: "destructive" }),
  });

  const recalculateEstimateMutation = useMutation({
    mutationFn: () => apiRequest(`/api/estimates/${estimateId}/recalculate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      setShowRecalcDialog(false);
      toast({ title: "Estimate recalculated successfully" });
    },
    onError: () => toast({ title: "Failed to recalculate estimate", variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!form.roleFreeText && form.roleId === "none" && form.userId === "none") {
      toast({ title: "Enter a role name or select a role/person", variant: "destructive" });
      return;
    }
    createMutation.mutate(buildPayload(form));
  };

  const startEdit = (block: EstimateLineItem) => {
    setEditingId(block.id);
    setShowAddForm(false);
    setEditingForm({
      description: block.description || "",
      comments: block.comments || "",
      epicId: block.epicId || "none",
      stageId: block.stageId || "none",
      workstream: block.workstream || "",
      roleId: block.roleId || "none",
      roleFreeText: block.resourceName || "",
      userId: block.assignedUserId || "none",
      startWeek: String(block.week || 1),
      durationWeeks: String(block.durationWeeks || 4),
      utilizationPercent: String(block.utilizationPercent || 100),
      billingRate: String(block.rate || "0"),
      costRate: String(block.costRate || "0"),
      size: block.size || "small",
      complexity: block.complexity || "small",
      confidence: block.confidence || "high",
    });
  };

  const saveEdit = (block: EstimateLineItem) => {
    updateMutation.mutate({ id: block.id, data: buildPayload(editingForm) });
  };

  const totalHours = programBlocks.reduce((s, b) => s + Number(b.adjustedHours || 0), 0);
  const totalAmount = programBlocks.reduce((s, b) => s + Number(b.totalAmount || 0), 0);

  const ganttMaxWeek = useMemo(() => {
    if (!programBlocks.length) return 12;
    return Math.max(...programBlocks.map((b) => (b.week || 1) + (b.durationWeeks || 1) - 1), 12);
  }, [programBlocks]);

  const ganttWeeks = Array.from({ length: ganttMaxWeek }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      {/* Header row: summary + view toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {programBlocks.length} block{programBlocks.length !== 1 ? "s" : ""} ·{" "}
          {totalHours.toFixed(0)} adjusted hours ·{" "}
          <span className="font-semibold text-foreground">
            ${totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })} total
          </span>
        </p>
        <div className="flex items-center gap-2">
          {isEditable && (
            <Button size="sm" variant="outline" onClick={() => setShowPMWizard(true)}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> PM Wizard
            </Button>
          )}
          {isEditable && (
            <Button size="sm" variant="outline" onClick={() => setShowRecalcDialog(true)}>
              <Calculator className="h-3.5 w-3.5 mr-1" /> Recalculate All
            </Button>
          )}
          <div className="flex gap-1 border rounded-md p-0.5">
            <Button
              size="sm"
              variant={view === "table" ? "default" : "ghost"}
              className="h-7 px-2"
              onClick={() => setView("table")}
            >
              <List className="h-3.5 w-3.5 mr-1" /> Table
            </Button>
            <Button
              size="sm"
              variant={view === "gantt" ? "default" : "ghost"}
              className="h-7 px-2"
              onClick={() => setView("gantt")}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Timeline
            </Button>
          </div>
        </div>
      </div>

      {/* Filter + Add row */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          className="h-7 text-xs w-36"
          placeholder="Search..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <Select value={filterEpic} onValueChange={setFilterEpic}>
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue placeholder="Epic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All epics</SelectItem>
            {epics.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterResource} onValueChange={setFilterResource}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            {resourceNames.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => { setFilterEpic("all"); setFilterResource("all"); setFilterText(""); }}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
        <div className="ml-auto">
          {isEditable && (
            <Button
              size="sm"
              variant={showAddForm ? "secondary" : "default"}
              className="h-7 px-3 text-xs"
              onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); if (!showAddForm) setForm(defaultForm()); }}
            >
              {showAddForm ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {showAddForm ? "Cancel" : "Add Block"}
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible add form */}
      {showAddForm && isEditable && (
        <div className="rounded-md border">
          <FormRow
            f={form}
            setF={setForm}
            onSubmit={handleAdd}
            onCancel={() => { setShowAddForm(false); setForm(defaultForm()); }}
            submitLabel="Add Block"
            epics={epics}
            stages={stages}
            roles={roles}
            users={users}
            estimate={estimate}
          />
        </div>
      )}

      {view === "table" ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {isEditable && <TableHead className="w-8" />}
                <TableHead className="text-xs">Role / Resource</TableHead>
                <TableHead className="text-xs">Epic / Stage</TableHead>
                <TableHead className="text-xs">Wk</TableHead>
                <TableHead className="text-xs">Dur.</TableHead>
                <TableHead className="text-xs">Util.</TableHead>
                <TableHead className="text-xs">Hrs/Wk</TableHead>
                <TableHead className="text-xs">Adj. Hrs</TableHead>
                <TableHead className="text-xs">Rate</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs">S/C/C</TableHead>
                {isEditable && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBlocks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isEditable ? 12 : 10} className="text-center text-muted-foreground text-sm py-8">
                    {hasFilters ? "No blocks match the current filters." : "No blocks yet. Click \"Add Block\" to get started."}
                  </TableCell>
                </TableRow>
              )}
              {filteredBlocks.map((block) => {
                const isEditing = editingId === block.id;
                const hoursPerWeek = ((block.utilizationPercent || 100) / 100) * 40;
                const epic = epics.find((e) => e.id === block.epicId);
                const stage = stages.find((s) => s.id === block.stageId);
                const epicColor = epic ? epicColorMap.get(epic.id) : undefined;

                return (
                  <Fragment key={block.id}>
                    <TableRow className={`text-xs ${isEditing ? "bg-muted/40" : ""}`}>
                      {isEditable && (
                        <TableCell className="py-2 pl-2 pr-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => isEditing ? setEditingId(null) : startEdit(block)}
                            className="h-6 w-6 p-0"
                          >
                            {isEditing ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      )}
                      <TableCell className="py-2">
                        <span className="font-medium">{block.resourceName || "—"}</span>
                        {block.workstream && (
                          <span className="block text-muted-foreground">{block.workstream}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {epic && (
                          <div className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${epicColor}`} />
                            <span>{epic.name}</span>
                          </div>
                        )}
                        {stage && <span className="text-muted-foreground block">{stage.name}</span>}
                        {!epic && !stage && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="py-2">{block.week ?? "—"}</TableCell>
                      <TableCell className="py-2">{block.durationWeeks}w</TableCell>
                      <TableCell className="py-2">{block.utilizationPercent}%</TableCell>
                      <TableCell className="py-2">{hoursPerWeek.toFixed(0)}</TableCell>
                      <TableCell className="py-2">{Number(block.adjustedHours || 0).toFixed(1)}</TableCell>
                      <TableCell className="py-2">${Number(block.rate || 0).toLocaleString()}</TableCell>
                      <TableCell className="py-2 text-right font-medium">
                        ${Number(block.totalAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex gap-0.5">
                          {block.size !== "small" && (
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              {block.size === "medium" ? "M" : "L"}S
                            </Badge>
                          )}
                          {block.complexity !== "small" && (
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              {block.complexity === "medium" ? "M" : "H"}C
                            </Badge>
                          )}
                          {block.confidence !== "high" && (
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              {block.confidence === "medium" ? "M" : "L"}Conf
                            </Badge>
                          )}
                          {block.size === "small" && block.complexity === "small" && block.confidence === "high" && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      {isEditable && (
                        <TableCell className="py-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm("Remove this block?")) deleteMutation.mutate(block.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                    {isEditing && (
                      <TableRow key={`${block.id}-edit`}>
                        <TableCell colSpan={isEditable ? 12 : 10} className="p-0">
                          <FormRow
                            f={editingForm}
                            setF={setEditingForm}
                            onSubmit={() => saveEdit(block)}
                            onCancel={() => setEditingId(null)}
                            submitLabel="Save"
                            epics={epics}
                            stages={stages}
                            roles={roles}
                            users={users}
                            estimate={estimate}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="flex border-b">
              <div className="w-40 shrink-0 p-2 text-xs font-medium text-muted-foreground border-r">Role</div>
              <div className="flex-1 overflow-x-auto">
                <div className="flex">
                  {ganttWeeks.map((wk) => (
                    <div
                      key={wk}
                      className="text-center text-xs text-muted-foreground border-r last:border-r-0 py-2"
                      style={{ minWidth: 32, width: 32 }}
                    >
                      {wk}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {filteredBlocks.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                {hasFilters ? "No blocks match the current filters." : "No blocks to display."}
              </div>
            ) : (
              filteredBlocks.map((block) => {
                const epic = epics.find((e) => e.id === block.epicId);
                const epicColor = epic ? epicColorMap.get(epic.id) : "bg-gray-400";
                const startWk = block.week || 1;
                const dur = block.durationWeeks || 1;

                return (
                  <div key={block.id} className="flex border-b last:border-b-0 hover:bg-muted/30">
                    <div className="w-40 shrink-0 p-2 border-r">
                      <p className="text-xs font-medium truncate">{block.resourceName || "—"}</p>
                      {epic && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${epicColor}`} />
                          <span className="text-xs text-muted-foreground truncate">{epic.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 relative" style={{ minHeight: 36 }}>
                      <div className="flex h-full">
                        {ganttWeeks.map((wk) => (
                          <div
                            key={wk}
                            className="border-r last:border-r-0 h-full"
                            style={{ minWidth: 32, width: 32 }}
                          />
                        ))}
                      </div>
                      <div
                        className={`absolute top-1 bottom-1 rounded ${epicColor || "bg-blue-500"} opacity-80 flex items-center px-1`}
                        style={{
                          left: `${(startWk - 1) * 32}px`,
                          width: `${dur * 32 - 2}px`,
                        }}
                        title={`${block.resourceName} — Wk ${startWk}–${startWk + dur - 1} — ${block.utilizationPercent}%`}
                      >
                        <span className="text-white text-xs truncate">
                          {block.utilizationPercent}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Week Subtotals */}
      {(() => {
        const weekTotals = filteredBlocks.reduce((acc: any, block) => {
          const week = (block.week ?? 0).toString();
          if (!acc[week]) {
            acc[week] = { hours: 0, amount: 0, cost: 0, count: 0 };
          }
          acc[week].hours += Number(block.adjustedHours || 0);
          acc[week].amount += Number(block.totalAmount || 0);
          acc[week].cost += Number(block.totalCost || 0);
          acc[week].count += 1;
          return acc;
        }, {});

        const sortedWeeks = Object.entries(weekTotals).sort(([a], [b]) => Number(a) - Number(b));

        if (sortedWeeks.length > 1) {
          return (
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <h4 className="font-semibold mb-2">Subtotals by Week</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedWeeks.map(([week, data]: [string, any]) => (
                  <div key={week} className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                    <span className="font-medium">Week {week}</span>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        {Math.round(data.hours)} hrs ({data.count} blocks)
                      </div>
                      <div className="font-semibold">
                        ${Math.round(data.amount).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Totals Summary */}
      <div className="flex justify-end">
        <div className="text-right space-y-1">
          <div className="text-sm text-muted-foreground">
            Total Hours: {Math.round(totalHours)}
          </div>
          <div className="text-sm text-muted-foreground">
            Total Cost: ${Math.round(programBlocks.reduce((s, b) => s + Number(b.totalCost || 0), 0)).toLocaleString()}
          </div>
          {estimate?.presentedTotal && Number(estimate.presentedTotal) !== totalAmount ? (
            <>
              <div className="text-sm text-muted-foreground">
                Blocks Total: ${Math.round(totalAmount).toLocaleString()}
              </div>
              <div className="text-lg font-semibold text-blue-600">
                Quote Total: ${Math.round(Number(estimate.presentedTotal)).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                (Override: {Number(estimate.presentedTotal) > totalAmount ? '+' : ''}{Math.round(Number(estimate.presentedTotal) - totalAmount).toLocaleString()})
              </div>
            </>
          ) : (
            <div className="text-lg font-semibold">
              Total Amount: ${Math.round(totalAmount).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Recalculate Confirmation Dialog */}
      <Dialog open={showRecalcDialog} onOpenChange={setShowRecalcDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recalculate All Values?</DialogTitle>
            <DialogDescription>
              This will update all blocks with the following changes:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Lookup current billing and cost rates for each assigned resource</li>
              <li>Reapply size, complexity, and confidence factor multipliers</li>
              <li>Recalculate adjusted hours, amounts, costs, and margins</li>
              <li>Update estimate totals</li>
            </ul>
            <p className="text-sm font-medium text-orange-600 mt-4">
              This will overwrite any manual rate adjustments you may have made.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecalcDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => recalculateEstimateMutation.mutate()}
              disabled={recalculateEstimateMutation.isPending}
            >
              {recalculateEstimateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recalculating...</>
              ) : "Recalculate All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PM Wizard Dialog */}
      <PMWizardDialog
        estimateId={estimateId}
        open={showPMWizard}
        onOpenChange={setShowPMWizard}
      />
    </div>
  );
}
