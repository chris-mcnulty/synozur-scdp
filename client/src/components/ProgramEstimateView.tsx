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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, BarChart3, List, Check, X, ChevronDown, ChevronUp, ChevronRight, Filter, Wand2, Calculator, AlertTriangle, Loader2, Users } from "lucide-react";
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
  startWeek: "0",
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
            min="0"
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
  const [filterStage, setFilterStage] = useState("all");
  const [filterWeek, setFilterWeek] = useState("all");
  const [filterResource, setFilterResource] = useState("all");
  const [filterWorkstream, setFilterWorkstream] = useState("");
  const [filterText, setFilterText] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [bulkEditDialog, setBulkEditDialog] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    epicId: "", stageId: "", workstream: "", week: "", size: "", complexity: "", confidence: "", rate: "", costRate: "",
  });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [assignRolesDialog, setAssignRolesDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const programBlocks = useMemo(
    () => lineItems
      .filter((li) => li.durationWeeks != null)
      .sort((a, b) => {
        const weekA = Number(a.week ?? 0);
        const weekB = Number(b.week ?? 0);
        if (weekA !== weekB) return weekA - weekB;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }),
    [lineItems]
  );

  const resourceNames = useMemo(() => {
    const names = new Set<string>();
    programBlocks.forEach((b) => { if (b.resourceName) names.add(b.resourceName); });
    return Array.from(names).sort();
  }, [programBlocks]);

  const weekNumbers = useMemo(() => {
    const weeks = new Set<number>();
    programBlocks.forEach((b) => { if (b.week != null) weeks.add(b.week); });
    return Array.from(weeks).sort((a, b) => a - b);
  }, [programBlocks]);

  const workstreamNames = useMemo(() => {
    const names = new Set<string>();
    programBlocks.forEach((b) => { if (b.workstream) names.add(b.workstream); });
    return Array.from(names).sort();
  }, [programBlocks]);

  const filteredBlocks = useMemo(() => {
    return programBlocks.filter((b) => {
      const matchesEpic = filterEpic === "all" || b.epicId === filterEpic;
      const matchesStage = filterStage === "all" || b.stageId === filterStage;
      const matchesWeek = filterWeek === "all" || String(b.week ?? 0) === filterWeek;
      const matchesResource = filterResource === "all" || b.resourceName === filterResource;
      const matchesWorkstream = !filterWorkstream || (b.workstream || "").toLowerCase().includes(filterWorkstream.toLowerCase());
      const matchesText = !filterText ||
        (b.description || "").toLowerCase().includes(filterText.toLowerCase()) ||
        (b.resourceName || "").toLowerCase().includes(filterText.toLowerCase());
      return matchesEpic && matchesStage && matchesWeek && matchesResource && matchesWorkstream && matchesText;
    });
  }, [programBlocks, filterEpic, filterStage, filterWeek, filterResource, filterWorkstream, filterText]);

  const hasFilters = filterEpic !== "all" || filterStage !== "all" || filterWeek !== "all" || filterResource !== "all" || filterWorkstream !== "" || filterText !== "";

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
      week: f.startWeek !== "" ? Number(f.startWeek) : 0,
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

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ itemIds, updates }: { itemIds: string[]; updates: any }) => {
      const promises = itemIds.map(itemId =>
        apiRequest(`/api/estimates/${estimateId}/line-items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', estimateId, 'line-items'] });
      setSelectedItems(new Set());
      setBulkEditDialog(false);
      setAssignRolesDialog(false);
      setBulkEditData({ epicId: "", stageId: "", workstream: "", week: "", size: "", complexity: "", confidence: "", rate: "", costRate: "" });
      setSelectedUserId("");
      toast({ title: "Bulk update completed successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to bulk update", description: error.message || "Please try again", variant: "destructive" });
    }
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
      startWeek: String(block.week ?? 0),
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

  const ganttMinWeek = useMemo(() => {
    if (!programBlocks.length) return 0;
    return Math.min(...programBlocks.map((b) => b.week ?? 0), 0);
  }, [programBlocks]);

  const ganttMaxWeek = useMemo(() => {
    if (!programBlocks.length) return 12;
    return Math.max(...programBlocks.map((b) => (b.week ?? 0) + (b.durationWeeks || 1) - 1), 12);
  }, [programBlocks]);

  const ganttWeeks = Array.from({ length: ganttMaxWeek - ganttMinWeek + 1 }, (_, i) => i + ganttMinWeek);

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

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          className="h-7 text-xs w-36"
          placeholder="Search descriptions..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <Select value={filterEpic} onValueChange={setFilterEpic}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue placeholder="All Epics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Epics</SelectItem>
            {epics.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterWeek} onValueChange={setFilterWeek}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue placeholder="All Weeks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Weeks</SelectItem>
            {weekNumbers.map((w) => (
              <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterResource} onValueChange={setFilterResource}>
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue placeholder="All Resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {resourceNames.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-7 text-xs w-28 hidden md:block"
          placeholder="Workstream..."
          value={filterWorkstream}
          onChange={(e) => setFilterWorkstream(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="radio"
            checked={showSummary}
            onChange={() => setShowSummary(!showSummary)}
            className="accent-primary"
          />
          Summary
        </label>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => { setFilterEpic("all"); setFilterStage("all"); setFilterWeek("all"); setFilterResource("all"); setFilterWorkstream(""); setFilterText(""); }}
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

      {/* Selection bar */}
      {selectedItems.size > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{selectedItems.size} items selected</span>
            <div className="flex gap-2">
              <Button onClick={() => setBulkEditDialog(true)} size="sm" disabled={!isEditable}>
                Bulk Edit
              </Button>
              <Button onClick={() => setAssignRolesDialog(true)} size="sm" variant="outline" disabled={!isEditable}>
                <Users className="h-3.5 w-3.5 mr-1" /> Assign Roles/Users
              </Button>
              <Button onClick={() => setSelectedItems(new Set())} variant="outline" size="sm">
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      )}

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
                <TableHead className="w-10 px-2">
                  <Checkbox
                    checked={filteredBlocks.length > 0 && filteredBlocks.every(b => selectedItems.has(b.id))}
                    onCheckedChange={(checked) => {
                      const newSelection = new Set(selectedItems);
                      if (checked) {
                        filteredBlocks.forEach(b => newSelection.add(b.id));
                      } else {
                        filteredBlocks.forEach(b => newSelection.delete(b.id));
                      }
                      setSelectedItems(newSelection);
                    }}
                  />
                </TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Epic / Stage</TableHead>
                <TableHead className="text-xs">Resource</TableHead>
                <TableHead className="text-xs">Hours</TableHead>
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
                const epic = epics.find((e) => e.id === block.epicId);
                const stage = stages.find((s) => s.id === block.stageId);
                const epicColor = epic ? epicColorMap.get(epic.id) : undefined;
                const isSelected = selectedItems.has(block.id);

                return (
                  <Fragment key={block.id}>
                    <TableRow className={`text-xs ${isEditing ? "bg-muted/40" : ""} ${isSelected ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
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
                      <TableCell className="py-2 px-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const newSelected = new Set(selectedItems);
                            if (checked) { newSelected.add(block.id); } else { newSelected.delete(block.id); }
                            setSelectedItems(newSelected);
                          }}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="font-medium">{block.description || block.resourceName || "—"}</span>
                        {block.workstream && (
                          <span className="block text-muted-foreground">Week {block.week ?? 0}</span>
                        )}
                        {!block.workstream && <span className="block text-muted-foreground">Week {block.week ?? 0}</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        {epic && (
                          <div className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${epicColor}`} />
                            <span>{epic.name}</span>
                          </div>
                        )}
                        {stage && <span className="text-muted-foreground block">{stage.name}</span>}
                        {block.workstream && <span className="text-muted-foreground block">{block.workstream}</span>}
                        {!epic && !stage && !block.workstream && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="font-medium">{block.resourceName || "—"}</span>
                        {block.roleId && (
                          <Badge variant="outline" className="ml-1 text-xs px-1 py-0">Role</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2">{Number(block.adjustedHours || 0).toFixed(1)}</TableCell>
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
                        <TableCell colSpan={isEditable ? 10 : 8} className="p-0">
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
                const startWk = block.week ?? 0;
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
                          left: `${(startWk - ganttMinWeek) * 32}px`,
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

      {/* Summary view */}
      {showSummary && (() => {
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

        const epicTotals = filteredBlocks.reduce((acc: any, block) => {
          const epicName = epics.find((e) => e.id === block.epicId)?.name || "Unassigned";
          if (!acc[epicName]) { acc[epicName] = { hours: 0, amount: 0, count: 0 }; }
          acc[epicName].hours += Number(block.adjustedHours || 0);
          acc[epicName].amount += Number(block.totalAmount || 0);
          acc[epicName].count += 1;
          return acc;
        }, {});

        const resourceTotals = filteredBlocks.reduce((acc: any, block) => {
          const name = block.resourceName || "Unassigned";
          if (!acc[name]) { acc[name] = { hours: 0, amount: 0, count: 0 }; }
          acc[name].hours += Number(block.adjustedHours || 0);
          acc[name].amount += Number(block.totalAmount || 0);
          acc[name].count += 1;
          return acc;
        }, {});

        return (
          <div className="space-y-4">
            {sortedWeeks.length > 1 && (
              <div className="p-4 bg-muted/30 rounded-lg border">
                <h4 className="font-semibold mb-2 text-sm">Subtotals by Week</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedWeeks.map(([week, data]: [string, any]) => (
                    <div key={week} className="flex justify-between p-2 bg-background rounded border">
                      <span className="font-medium text-sm">Week {week}</span>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{Math.round(data.hours)} hrs ({data.count} blocks)</div>
                        <div className="font-semibold text-sm">${Math.round(data.amount).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg border">
                <h4 className="font-semibold mb-2 text-sm">By Epic</h4>
                {Object.entries(epicTotals).map(([name, data]: [string, any]) => (
                  <div key={name} className="flex justify-between py-1 border-b last:border-b-0">
                    <span className="text-sm">{name}</span>
                    <span className="text-sm font-medium">{Math.round(data.hours)} hrs · ${Math.round(data.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-muted/30 rounded-lg border">
                <h4 className="font-semibold mb-2 text-sm">By Resource</h4>
                {Object.entries(resourceTotals).map(([name, data]: [string, any]) => (
                  <div key={name} className="flex justify-between py-1 border-b last:border-b-0">
                    <span className="text-sm">{name}</span>
                    <span className="text-sm font-medium">{Math.round(data.hours)} hrs · ${Math.round(data.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
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
              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
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
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mt-4">
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

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditDialog} onOpenChange={setBulkEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Edit Blocks</DialogTitle>
            <DialogDescription>
              Edit {selectedItems.size} selected blocks. Only fields with values will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Epic</Label>
                <Select value={bulkEditData.epicId} onValueChange={(v) => setBulkEditData({...bulkEditData, epicId: v})}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Epic</SelectItem>
                    {epics.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select value={bulkEditData.stageId} onValueChange={(v) => setBulkEditData({...bulkEditData, stageId: v})}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Stage</SelectItem>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Workstream</Label>
                <Input placeholder="Keep current" value={bulkEditData.workstream} onChange={(e) => setBulkEditData({...bulkEditData, workstream: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Week</Label>
                <Input type="number" placeholder="Keep current" value={bulkEditData.week} onChange={(e) => setBulkEditData({...bulkEditData, week: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Size</Label>
                <Select value={bulkEditData.size} onValueChange={(v) => setBulkEditData({...bulkEditData, size: v})}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Complexity</Label>
                <Select value={bulkEditData.complexity} onValueChange={(v) => setBulkEditData({...bulkEditData, complexity: v})}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Simple</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Complex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Confidence</Label>
                <Select value={bulkEditData.confidence} onValueChange={(v) => setBulkEditData({...bulkEditData, confidence: v})}>
                  <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rate ($)</Label>
                <Input type="number" placeholder="Keep current" value={bulkEditData.rate} onChange={(e) => setBulkEditData({...bulkEditData, rate: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Cost Rate ($)</Label>
                <Input type="number" placeholder="Keep current" value={bulkEditData.costRate} onChange={(e) => setBulkEditData({...bulkEditData, costRate: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const updates: any = {};
                if (bulkEditData.epicId) updates.epicId = bulkEditData.epicId === "none" ? null : bulkEditData.epicId;
                if (bulkEditData.stageId) updates.stageId = bulkEditData.stageId === "none" ? null : bulkEditData.stageId;
                if (bulkEditData.workstream) updates.workstream = bulkEditData.workstream;
                if (bulkEditData.week) updates.week = String(bulkEditData.week);
                if (bulkEditData.size) updates.size = bulkEditData.size;
                if (bulkEditData.complexity) updates.complexity = bulkEditData.complexity;
                if (bulkEditData.confidence) updates.confidence = bulkEditData.confidence;
                if (bulkEditData.rate) updates.rate = String(bulkEditData.rate);
                if (bulkEditData.costRate) updates.costRate = String(bulkEditData.costRate);
                if (Object.keys(updates).length > 0) {
                  bulkUpdateMutation.mutate({ itemIds: Array.from(selectedItems), updates });
                }
              }}
              disabled={!isEditable || bulkUpdateMutation.isPending || Object.values(bulkEditData).every(v => !v)}
            >
              {bulkUpdateMutation.isPending ? "Updating..." : "Update Selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Roles/Users Dialog */}
      <Dialog open={assignRolesDialog} onOpenChange={setAssignRolesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Roles/Users</DialogTitle>
            <DialogDescription>
              Select a role or user to assign to {selectedItems.size} selected blocks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Resource Assignment</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Select role or user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Generic Roles</div>
                  {roles.map((role: any) => (
                    <SelectItem key={`role-${role.id}`} value={`role-${role.id}`}>
                      {role.name} (${role.defaultRackRate}/hr)
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Specific Staff</div>
                  {users.filter((u: any) => u.isAssignable).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} - {u.role} (${u.defaultBillingRate}/hr)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRolesDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedUserId) return;
                let updates: any = {};
                if (selectedUserId === "unassigned") {
                  updates = { assignedUserId: null, roleId: null, resourceName: null, rate: "0", costRate: "0" };
                } else if (selectedUserId.startsWith("role-")) {
                  const roleId = selectedUserId.substring(5);
                  const selectedRole = roles.find((r: any) => r.id === roleId);
                  if (selectedRole) {
                    updates = {
                      assignedUserId: null, roleId: selectedRole.id, resourceName: selectedRole.name,
                      rate: selectedRole.defaultRackRate?.toString() || "0", costRate: selectedRole.defaultCostRate?.toString() || "0"
                    };
                  }
                } else {
                  const selectedUser = users.find((u: any) => u.id === selectedUserId);
                  if (selectedUser) {
                    updates = {
                      assignedUserId: selectedUser.id, roleId: null, resourceName: selectedUser.name,
                      rate: selectedUser.defaultBillingRate?.toString() || "0", costRate: selectedUser.defaultCostRate?.toString() || "0"
                    };
                  }
                }
                if (Object.keys(updates).length > 0) {
                  bulkUpdateMutation.mutate({ itemIds: Array.from(selectedItems), updates });
                  setAssignRolesDialog(false);
                  setSelectedUserId("");
                }
              }}
              disabled={!isEditable || !selectedUserId || bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? "Assigning..." : "Assign"}
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
