import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Calendar, BarChart3, List, Edit2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Role / Resource *</Label>
          <div className="flex gap-2 mt-1">
            <Select
              value={f.roleId}
              onValueChange={(v) => {
                const rates = v !== "none" ? resolveRateFromRole(v) : { billingRate: f.billingRate, costRate: f.costRate };
                setF({ ...f, roleId: v, ...rates });
              }}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
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
              <SelectTrigger className="h-8 text-xs flex-1">
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
              className="h-8 text-xs mt-1"
              placeholder="Free-text role name (e.g. Principal Architect)"
              value={f.roleFreeText}
              onChange={(e) => setF({ ...f, roleFreeText: e.target.value })}
            />
          )}
        </div>

        <div>
          <Label className="text-xs">Start Week</Label>
          <Input
            className="h-8 text-xs mt-1"
            type="number"
            min="1"
            value={f.startWeek}
            onChange={(e) => setF({ ...f, startWeek: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Duration (weeks)</Label>
          <Input
            className="h-8 text-xs mt-1"
            type="number"
            min="1"
            value={f.durationWeeks}
            onChange={(e) => setF({ ...f, durationWeeks: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Utilization</Label>
          <Select value={f.utilizationPercent} onValueChange={(v) => setF({ ...f, utilizationPercent: v })}>
            <SelectTrigger className="h-8 text-xs mt-1">
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
          <Label className="text-xs">Billing Rate ($/hr)</Label>
          <Input
            className="h-8 text-xs mt-1"
            type="number"
            step="0.01"
            value={f.billingRate}
            onChange={(e) => setF({ ...f, billingRate: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Cost Rate ($/hr)</Label>
          <Input
            className="h-8 text-xs mt-1"
            type="number"
            step="0.01"
            value={f.costRate}
            onChange={(e) => setF({ ...f, costRate: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Epic</Label>
          <Select value={f.epicId} onValueChange={(v) => setF({ ...f, epicId: v, stageId: "none" })}>
            <SelectTrigger className="h-8 text-xs mt-1">
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Stage</Label>
          <Select value={f.stageId} onValueChange={(v) => setF({ ...f, stageId: v })} disabled={f.epicId === "none"}>
            <SelectTrigger className="h-8 text-xs mt-1">
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
            className="h-8 text-xs mt-1"
            placeholder="Optional"
            value={f.workstream}
            onChange={(e) => setF({ ...f, workstream: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">Size (contingency)</Label>
          <Select value={f.size} onValueChange={(v) => setF({ ...f, size: v })}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Complexity</Label>
          <Select value={f.complexity} onValueChange={(v) => setF({ ...f, complexity: v })}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPLEXITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <Label className="text-xs">Confidence</Label>
          <Select value={f.confidence} onValueChange={(v) => setF({ ...f, confidence: v })}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONFIDENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Input
            className="h-8 text-xs mt-1"
            placeholder="Block notes"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>

        <div className="col-span-2 flex gap-2 justify-end">
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

      <div className="text-xs text-muted-foreground">
        {(() => {
          const d = Number(f.durationWeeks) || 0;
          const u = Number(f.utilizationPercent) || 100;
          const h = d * (u / 100) * 40;
          const adj = calcAdjustedHours(d, u, f.size, f.complexity, f.confidence, estimate);
          const total = adj * (Number(f.billingRate) || 0);
          return `Preview: ${h} base hrs → ${adj.toFixed(1)} adjusted hrs with contingency → $${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
        })()}
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

  const programBlocks = useMemo(
    () => lineItems.filter((li) => li.durationWeeks != null),
    [lineItems]
  );

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
    mutationFn: (data: any) => apiRequest("POST", `/api/estimates/${estimateId}/line-items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      setForm(defaultForm());
      toast({ title: "Block added" });
    },
    onError: () => toast({ title: "Failed to add block", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/estimates/${estimateId}/line-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      setEditingId(null);
      toast({ title: "Block updated" });
    },
    onError: () => toast({ title: "Failed to update block", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/estimates/${estimateId}/line-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "line-items"] });
      toast({ title: "Block removed" });
    },
    onError: () => toast({ title: "Failed to remove block", variant: "destructive" }),
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
    setEditingForm({
      description: block.description || "",
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {programBlocks.length} block{programBlocks.length !== 1 ? "s" : ""} ·{" "}
            {totalHours.toFixed(0)} adjusted hours ·{" "}
            <span className="font-semibold text-foreground">
              ${totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })} total
            </span>
          </p>
        </div>
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

      {isEditable && (
        <FormRow
          f={form}
          setF={setForm}
          onSubmit={handleAdd}
          submitLabel="Add Block"
          epics={epics}
          stages={stages}
          roles={roles}
          users={users}
          estimate={estimate}
        />
      )}

      {view === "table" ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
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
                {isEditable && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {programBlocks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isEditable ? 11 : 10} className="text-center text-muted-foreground text-sm py-8">
                    No blocks yet. Add a block above.
                  </TableCell>
                </TableRow>
              )}
              {programBlocks.map((block) => {
                const isEditing = editingId === block.id;
                const hoursPerWeek = ((block.utilizationPercent || 100) / 100) * 40;
                const epic = epics.find((e) => e.id === block.epicId);
                const stage = stages.find((s) => s.id === block.stageId);
                const epicColor = epic ? epicColorMap.get(epic.id) : undefined;

                if (isEditing) {
                  return (
                    <TableRow key={block.id}>
                      <TableCell colSpan={isEditable ? 11 : 10} className="p-2">
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
                  );
                }

                return (
                  <TableRow key={block.id}>
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        {epicColor && <span className={`w-2 h-2 rounded-full ${epicColor} flex-shrink-0`} />}
                        {block.resourceName || block.description}
                      </div>
                      {block.workstream && (
                        <div className="text-muted-foreground mt-0.5">{block.workstream}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {epic?.name || "—"}
                      {stage && <div className="text-muted-foreground">{stage.name}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{block.week ?? "—"}</TableCell>
                    <TableCell className="text-xs">{block.durationWeeks}w</TableCell>
                    <TableCell className="text-xs">{block.utilizationPercent}%</TableCell>
                    <TableCell className="text-xs">{hoursPerWeek}h</TableCell>
                    <TableCell className="text-xs">{Number(block.adjustedHours || 0).toFixed(1)}</TableCell>
                    <TableCell className="text-xs">${Number(block.rate || 0).toFixed(0)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      ${Number(block.totalAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{block.size?.charAt(0).toUpperCase()}</Badge>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 ml-0.5">{block.complexity?.charAt(0).toUpperCase()}</Badge>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 ml-0.5">{block.confidence?.charAt(0).toUpperCase()}</Badge>
                    </TableCell>
                    {isEditable && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(block)}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMutation.mutate(block.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <GanttView
          blocks={programBlocks}
          epics={epics}
          stages={stages}
          epicColorMap={epicColorMap}
          ganttWeeks={ganttWeeks}
        />
      )}

      {programBlocks.length > 0 && (
        <div className="flex justify-end gap-8 p-3 border rounded-lg bg-muted/20 text-sm">
          <div>
            <span className="text-muted-foreground">Total Adjusted Hours: </span>
            <span className="font-semibold">{totalHours.toFixed(1)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Fees: </span>
            <span className="font-semibold text-lg">
              ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function GanttView({
  blocks,
  epics,
  stages,
  epicColorMap,
  ganttWeeks,
}: {
  blocks: EstimateLineItem[];
  epics: EstimateEpic[];
  stages: EstimateStage[];
  epicColorMap: Map<string, string>;
  ganttWeeks: number[];
}) {
  if (blocks.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
        Add blocks to see the timeline.
      </div>
    );
  }

  const totalWeeks = ganttWeeks.length;

  return (
    <div className="border rounded-lg overflow-x-auto">
      <div style={{ minWidth: Math.max(600, totalWeeks * 32 + 200) }}>
        <div className="flex border-b bg-muted/40">
          <div className="w-48 flex-shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r">
            Role / Resource
          </div>
          <div className="flex flex-1">
            {ganttWeeks.map((w) => (
              <div
                key={w}
                className="flex-1 text-center text-[10px] text-muted-foreground py-2 border-r last:border-r-0 min-w-[28px]"
              >
                W{w}
              </div>
            ))}
          </div>
        </div>

        {blocks.map((block) => {
          const start = (block.week || 1) - 1;
          const dur = block.durationWeeks || 1;
          const epic = epics.find((e) => e.id === block.epicId);
          const stage = stages.find((s) => s.id === block.stageId);
          const colorClass = epic ? epicColorMap.get(epic.id) : "bg-slate-400";

          return (
            <div key={block.id} className="flex border-b last:border-b-0 hover:bg-muted/10">
              <div className="w-48 flex-shrink-0 px-3 py-2 border-r">
                <div className="text-xs font-medium truncate">{block.resourceName || block.description}</div>
                {(epic || stage) && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    {epic?.name}{stage ? ` / ${stage.name}` : ""}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {block.durationWeeks}w · {block.utilizationPercent}% · ${Number(block.totalAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="flex flex-1 relative py-1.5">
                {ganttWeeks.map((w) => (
                  <div key={w} className="flex-1 border-r last:border-r-0 min-w-[28px]" />
                ))}
                <div
                  className={`absolute top-1.5 bottom-1.5 ${colorClass} rounded opacity-85 flex items-center justify-center overflow-hidden`}
                  style={{
                    left: `calc(${(start / totalWeeks) * 100}% + 2px)`,
                    width: `calc(${(dur / totalWeeks) * 100}% - 4px)`,
                  }}
                >
                  <span className="text-white text-[10px] font-medium px-1 truncate">
                    {block.resourceName || block.description}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
