import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Clock, Edit, ChevronRight, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface RateTier {
  name: string;
  rate: number;
  maxHours: number;
}

interface RetainerStage {
  id: string;
  epicId: string;
  name: string;
  order: number;
  retainerMonthIndex: number | null;
  retainerMonthLabel: string | null;
  retainerMaxHours: string | null;
  retainerRateTiers: RateTier[] | null;
  retainerStartDate: string | null;
  retainerEndDate: string | null;
}

interface ProjectRetainerManagementProps {
  projectId: string;
  isEditable: boolean;
  commercialScheme?: string;
}

const EMPTY_TIER: RateTier = { name: '', rate: 0, maxHours: 0 };

function RateTierEditor({ tiers, onChange }: { tiers: RateTier[]; onChange: (tiers: RateTier[]) => void }) {
  const addTier = () => onChange([...tiers, { ...EMPTY_TIER }]);
  const removeTier = (index: number) => onChange(tiers.filter((_, i) => i !== index));
  const updateTier = (index: number, field: keyof RateTier, value: string) => {
    const updated = [...tiers];
    if (field === 'name') {
      updated[index] = { ...updated[index], name: value };
    } else {
      updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
    }
    onChange(updated);
  };

  const totalHours = tiers.reduce((sum, t) => sum + (t.maxHours || 0), 0);
  const totalAmount = tiers.reduce((sum, t) => sum + (t.rate || 0) * (t.maxHours || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Rate Tiers</Label>
        <Button type="button" variant="outline" size="sm" onClick={addTier}>
          <Plus className="h-3 w-3 mr-1" /> Add Tier
        </Button>
      </div>
      {tiers.map((tier, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="Role name"
            value={tier.name}
            onChange={(e) => updateTier(i, 'name', e.target.value)}
            className="flex-1"
          />
          <div className="relative w-24">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              step="0.01"
              placeholder="Rate"
              value={tier.rate || ''}
              onChange={(e) => updateTier(i, 'rate', e.target.value)}
              className="pl-6"
            />
          </div>
          <div className="relative w-20">
            <Input
              type="number"
              step="0.5"
              placeholder="Hours"
              value={tier.maxHours || ''}
              onChange={(e) => updateTier(i, 'maxHours', e.target.value)}
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeTier(i)} className="px-2">
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
      {tiers.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-2 text-sm text-muted-foreground">
          {totalHours} total hours · ${totalAmount.toLocaleString()} total value
        </div>
      )}
    </div>
  );
}

export function ProjectRetainerManagement({ projectId, isEditable, commercialScheme }: ProjectRetainerManagementProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingStage, setEditingStage] = useState<RetainerStage | null>(null);

  const [newMonth, setNewMonth] = useState({
    monthLabel: '',
    maxHours: '',
    startDate: '',
    endDate: '',
  });
  const [addMultiRate, setAddMultiRate] = useState(false);
  const [addRateTiers, setAddRateTiers] = useState<RateTier[]>([{ ...EMPTY_TIER }]);

  const [extendConfig, setExtendConfig] = useState({
    monthCount: '3',
    startMonth: new Date().toISOString().slice(0, 7),
    hoursPerMonth: '',
  });
  const [extendMultiRate, setExtendMultiRate] = useState(false);
  const [extendRateTiers, setExtendRateTiers] = useState<RateTier[]>([{ ...EMPTY_TIER }]);

  const [editMonth, setEditMonth] = useState({
    monthLabel: '',
    maxHours: '',
    startDate: '',
    endDate: '',
  });
  const [editMultiRate, setEditMultiRate] = useState(false);
  const [editRateTiers, setEditRateTiers] = useState<RateTier[]>([]);

  const { data: stages = [], isLoading } = useQuery<RetainerStage[]>({
    queryKey: ['/api/projects', projectId, 'retainer-stages'],
    enabled: !!projectId,
  });

  const invalidateRetainerQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'retainer-stages'] });
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/retainer-utilization`] });
    queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'milestones'] });
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/payment-milestones`] });
  };

  const createStageMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/projects/${projectId}/retainer-stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      invalidateRetainerQueries();
      toast({ title: "Retainer month added", description: "A payment milestone has been auto-generated for end-of-month billing." });
      setShowAddDialog(false);
      setNewMonth({ monthLabel: '', maxHours: '', startDate: '', endDate: '' });
      setAddMultiRate(false);
      setAddRateTiers([{ ...EMPTY_TIER }]);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add retainer month", variant: "destructive" });
    },
  });

  const extendMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/projects/${projectId}/retainer-stages/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      invalidateRetainerQueries();
      toast({ title: "Retainer extended", description: "Payment milestones have been auto-generated for each new month." });
      setShowExtendDialog(false);
      setExtendConfig({ monthCount: '3', startMonth: new Date().toISOString().slice(0, 7), hoursPerMonth: '' });
      setExtendMultiRate(false);
      setExtendRateTiers([{ ...EMPTY_TIER }]);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to extend retainer", variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ stageId, data }: { stageId: string; data: any }) => {
      return await apiRequest(`/api/projects/${projectId}/retainer-stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      invalidateRetainerQueries();
      toast({ title: "Retainer month updated", description: "The retainer month has been updated." });
      setShowEditDialog(false);
      setEditingStage(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update retainer month", variant: "destructive" });
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      await apiRequest(`/api/projects/${projectId}/retainer-stages/${stageId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      invalidateRetainerQueries();
      toast({ title: "Retainer month removed", description: "The retainer month has been deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete retainer month", variant: "destructive" });
    },
  });

  const handleAddMonth = () => {
    const payload: any = {
      monthLabel: newMonth.monthLabel,
      startDate: newMonth.startDate,
      endDate: newMonth.endDate,
    };
    if (addMultiRate && addRateTiers.some(t => t.rate > 0 && t.maxHours > 0)) {
      payload.rateTiers = addRateTiers.filter(t => t.rate > 0 && t.maxHours > 0);
    } else {
      payload.maxHours = parseFloat(newMonth.maxHours);
    }
    createStageMutation.mutate(payload);
  };

  const handleExtend = () => {
    const payload: any = {
      monthCount: parseInt(extendConfig.monthCount),
      startMonth: extendConfig.startMonth,
    };
    if (extendMultiRate && extendRateTiers.some(t => t.rate > 0 && t.maxHours > 0)) {
      payload.rateTiers = extendRateTiers.filter(t => t.rate > 0 && t.maxHours > 0);
    } else {
      payload.hoursPerMonth = parseFloat(extendConfig.hoursPerMonth);
    }
    extendMutation.mutate(payload);
  };

  const handleEditClick = (stage: RetainerStage) => {
    setEditingStage(stage);
    setEditMonth({
      monthLabel: stage.retainerMonthLabel || '',
      maxHours: stage.retainerMaxHours || '',
      startDate: stage.retainerStartDate || '',
      endDate: stage.retainerEndDate || '',
    });
    const hasTiers = Array.isArray(stage.retainerRateTiers) && stage.retainerRateTiers.length > 0;
    setEditMultiRate(hasTiers);
    setEditRateTiers(hasTiers ? [...stage.retainerRateTiers!] : [{ ...EMPTY_TIER }]);
    setShowEditDialog(true);
  };

  const handleUpdateMonth = () => {
    if (!editingStage) return;
    const payload: any = {
      monthLabel: editMonth.monthLabel,
      startDate: editMonth.startDate,
      endDate: editMonth.endDate,
    };
    if (editMultiRate && editRateTiers.some(t => t.rate > 0 && t.maxHours > 0)) {
      payload.rateTiers = editRateTiers.filter(t => t.rate > 0 && t.maxHours > 0);
    } else {
      payload.maxHours = parseFloat(editMonth.maxHours);
      payload.rateTiers = null;
    }
    updateStageMutation.mutate({ stageId: editingStage.id, data: payload });
  };

  const handleAutoFillDates = () => {
    if (!newMonth.startDate) return;
    const start = new Date(newMonth.startDate + 'T00:00:00');
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    setNewMonth({
      ...newMonth,
      endDate: end.toISOString().split('T')[0],
      monthLabel: newMonth.monthLabel || label,
    });
  };

  const totalHours = stages.reduce((sum, s) => sum + parseFloat(s.retainerMaxHours || '0'), 0);

  const isAddValid = newMonth.monthLabel && newMonth.startDate && newMonth.endDate && 
    (addMultiRate ? addRateTiers.some(t => t.rate > 0 && t.maxHours > 0) : !!newMonth.maxHours);
  const isExtendValid = extendConfig.monthCount && extendConfig.startMonth && 
    (extendMultiRate ? extendRateTiers.some(t => t.rate > 0 && t.maxHours > 0) : !!extendConfig.hoursPerMonth);
  const isEditValid = editMonth.monthLabel && editMonth.startDate && editMonth.endDate &&
    (editMultiRate ? editRateTiers.some(t => t.rate > 0 && t.maxHours > 0) : !!editMonth.maxHours);
  const isRetainer = commercialScheme === 'retainer' || stages.length > 0;

  const formatRateTierSummary = (tiers: RateTier[]) => {
    return tiers.map(t => `${t.name}: ${t.maxHours}hrs @ $${t.rate}/hr`).join(', ');
  };

  const extendTotalHours = extendMultiRate 
    ? extendRateTiers.reduce((sum, t) => sum + (t.maxHours || 0), 0)
    : parseFloat(extendConfig.hoursPerMonth) || 0;

  return (
    <>
      <Card data-testid="retainer-management-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Retainer Configuration
              </CardTitle>
              <CardDescription>
                {isRetainer
                  ? `${stages.length} month${stages.length !== 1 ? 's' : ''} configured · ${totalHours} total hours`
                  : 'Configure retainer drawdown months for this project'}
              </CardDescription>
            </div>
            {isEditable && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowExtendDialog(true)}
                  variant="outline"
                  size="sm"
                  data-testid="button-extend-retainer"
                >
                  <ChevronRight className="h-4 w-4 mr-1" />
                  {stages.length > 0 ? 'Extend' : 'Set Up Retainer'}
                </Button>
                <Button
                  onClick={() => setShowAddDialog(true)}
                  size="sm"
                  data-testid="button-add-retainer-month"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Month
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading retainer configuration...</div>
          ) : stages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No retainer months configured</p>
              <p className="text-sm mt-1">
                {isEditable 
                  ? 'Use "Set Up Retainer" to add months in bulk, or "Add Month" to add individual months'
                  : 'No retainer drawdown structure has been set up for this project'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Hour Cap</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    {isEditable && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map((stage) => {
                    const now = new Date().toISOString().split('T')[0];
                    const isPast = stage.retainerEndDate && now > stage.retainerEndDate;
                    const isCurrent = stage.retainerStartDate && stage.retainerEndDate && 
                      now >= stage.retainerStartDate && now <= stage.retainerEndDate;
                    const isFuture = stage.retainerStartDate && now < stage.retainerStartDate;
                    const hasTiers = Array.isArray(stage.retainerRateTiers) && stage.retainerRateTiers.length > 0;

                    return (
                      <TableRow key={stage.id} data-testid={`row-retainer-stage-${stage.id}`}
                        className={isCurrent ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''}
                      >
                        <TableCell className="text-muted-foreground text-sm">
                          {(stage.retainerMonthIndex || 0) + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{stage.retainerMonthLabel || stage.name}</span>
                            {isCurrent && (
                              <Badge variant="default" className="text-xs">Current</Badge>
                            )}
                            {hasTiers && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-xs gap-1 cursor-help">
                                      <Layers className="h-3 w-3" />
                                      {stage.retainerRateTiers!.length} rates
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <div className="space-y-1">
                                      {stage.retainerRateTiers!.map((tier, i) => (
                                        <div key={i} className="text-xs">
                                          <span className="font-medium">{tier.name}:</span> {tier.maxHours} hrs @ ${tier.rate}/hr
                                        </div>
                                      ))}
                                      <div className="text-xs font-medium border-t pt-1 mt-1">
                                        Total: ${stage.retainerRateTiers!.reduce((s, t) => s + t.rate * t.maxHours, 0).toLocaleString()}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {parseFloat(stage.retainerMaxHours || '0')} hrs
                        </TableCell>
                        <TableCell className="text-sm">
                          {stage.retainerStartDate 
                            ? format(new Date(stage.retainerStartDate + 'T00:00:00'), 'MMM d, yyyy') 
                            : '\u2014'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {stage.retainerEndDate 
                            ? format(new Date(stage.retainerEndDate + 'T00:00:00'), 'MMM d, yyyy') 
                            : '\u2014'}
                        </TableCell>
                        <TableCell>
                          {isPast && <Badge variant="secondary" className="text-xs">Completed</Badge>}
                          {isCurrent && <Badge variant="default" className="text-xs bg-blue-600">Active</Badge>}
                          {isFuture && <Badge variant="outline" className="text-xs">Upcoming</Badge>}
                        </TableCell>
                        {isEditable && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditClick(stage)}
                                data-testid={`button-edit-retainer-stage-${stage.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteStageMutation.mutate(stage.id)}
                                disabled={deleteStageMutation.isPending}
                                data-testid={`button-delete-retainer-stage-${stage.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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
          )}
        </CardContent>
      </Card>

      {/* Add Single Month Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Retainer Month</DialogTitle>
            <DialogDescription>
              Add a single retainer month with its hour cap and date range
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Start Date *</Label>
              <Input
                type="date"
                value={newMonth.startDate}
                onChange={(e) => setNewMonth({ ...newMonth, startDate: e.target.value })}
                onBlur={handleAutoFillDates}
                className="col-span-3"
                data-testid="input-retainer-start-date"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">End Date *</Label>
              <Input
                type="date"
                value={newMonth.endDate}
                onChange={(e) => setNewMonth({ ...newMonth, endDate: e.target.value })}
                className="col-span-3"
                data-testid="input-retainer-end-date"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Label *</Label>
              <Input
                placeholder="e.g., March 2026"
                value={newMonth.monthLabel}
                onChange={(e) => setNewMonth({ ...newMonth, monthLabel: e.target.value })}
                className="col-span-3"
                data-testid="input-retainer-month-label"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Rate Mode</Label>
              <div className="col-span-3 flex gap-2">
                <Button
                  type="button"
                  variant={addMultiRate ? "outline" : "default"}
                  size="sm"
                  onClick={() => setAddMultiRate(false)}
                >
                  Single Rate
                </Button>
                <Button
                  type="button"
                  variant={addMultiRate ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAddMultiRate(true)}
                  data-testid="button-add-multi-rate"
                >
                  <Layers className="h-3 w-3 mr-1" />
                  Multi-Rate
                </Button>
              </div>
            </div>

            {!addMultiRate ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Hour Cap *</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="e.g., 100"
                  value={newMonth.maxHours}
                  onChange={(e) => setNewMonth({ ...newMonth, maxHours: e.target.value })}
                  className="col-span-3"
                  data-testid="input-retainer-max-hours"
                />
              </div>
            ) : (
              <div className="col-span-4">
                <RateTierEditor tiers={addRateTiers} onChange={setAddRateTiers} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAddMonth}
              disabled={!isAddValid || createStageMutation.isPending}
              data-testid="button-save-retainer-month"
            >
              {createStageMutation.isPending ? "Adding..." : "Add Month"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Retainer Dialog (bulk add months) */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{stages.length > 0 ? 'Extend Retainer' : 'Set Up Retainer'}</DialogTitle>
            <DialogDescription>
              {stages.length > 0 
                ? 'Add additional months to extend the retainer engagement'
                : 'Configure the initial retainer months for this project'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Starting Month *</Label>
              <Input
                type="month"
                value={extendConfig.startMonth}
                onChange={(e) => setExtendConfig({ ...extendConfig, startMonth: e.target.value })}
                className="col-span-3"
                data-testid="input-extend-start-month"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Months *</Label>
              <Input
                type="number"
                min="1"
                max="36"
                value={extendConfig.monthCount}
                onChange={(e) => setExtendConfig({ ...extendConfig, monthCount: e.target.value })}
                className="col-span-3"
                data-testid="input-extend-month-count"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Rate Mode</Label>
              <div className="col-span-3 flex gap-2">
                <Button
                  type="button"
                  variant={extendMultiRate ? "outline" : "default"}
                  size="sm"
                  onClick={() => setExtendMultiRate(false)}
                >
                  Single Rate
                </Button>
                <Button
                  type="button"
                  variant={extendMultiRate ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExtendMultiRate(true)}
                  data-testid="button-extend-multi-rate"
                >
                  <Layers className="h-3 w-3 mr-1" />
                  Multi-Rate
                </Button>
              </div>
            </div>

            {!extendMultiRate ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Hours/Month *</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="e.g., 100"
                  value={extendConfig.hoursPerMonth}
                  onChange={(e) => setExtendConfig({ ...extendConfig, hoursPerMonth: e.target.value })}
                  className="col-span-3"
                  data-testid="input-extend-hours-per-month"
                />
              </div>
            ) : (
              <div className="col-span-4">
                <RateTierEditor tiers={extendRateTiers} onChange={setExtendRateTiers} />
                <p className="text-xs text-muted-foreground mt-2">
                  These rate tiers will be applied to each new month. Actual hour mix may vary month to month.
                </p>
              </div>
            )}

            {extendConfig.startMonth && extendConfig.monthCount && extendTotalHours > 0 && (
              <div className="col-span-4 bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium mb-1">Preview:</p>
                <p className="text-muted-foreground">
                  {extendConfig.monthCount} months starting {extendConfig.startMonth} · {extendTotalHours} hrs/month · {parseInt(extendConfig.monthCount) * extendTotalHours} total hours
                  {extendMultiRate && extendRateTiers.filter(t => t.rate > 0 && t.maxHours > 0).length > 0 && (
                    <> · ${(parseInt(extendConfig.monthCount) * extendRateTiers.reduce((s, t) => s + t.rate * t.maxHours, 0)).toLocaleString()} total value</>
                  )}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)}>Cancel</Button>
            <Button
              onClick={handleExtend}
              disabled={!isExtendValid || extendMutation.isPending}
              data-testid="button-extend-retainer-submit"
            >
              {extendMutation.isPending ? "Adding..." : stages.length > 0 ? 'Extend Retainer' : 'Set Up Retainer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Month Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Retainer Month</DialogTitle>
            <DialogDescription>
              Update the hour cap, rate tiers, or date range for this retainer month
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Label *</Label>
              <Input
                value={editMonth.monthLabel}
                onChange={(e) => setEditMonth({ ...editMonth, monthLabel: e.target.value })}
                className="col-span-3"
                data-testid="input-edit-retainer-label"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Rate Mode</Label>
              <div className="col-span-3 flex gap-2">
                <Button
                  type="button"
                  variant={editMultiRate ? "outline" : "default"}
                  size="sm"
                  onClick={() => setEditMultiRate(false)}
                >
                  Single Rate
                </Button>
                <Button
                  type="button"
                  variant={editMultiRate ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditMultiRate(true)}
                  data-testid="button-edit-multi-rate"
                >
                  <Layers className="h-3 w-3 mr-1" />
                  Multi-Rate
                </Button>
              </div>
            </div>

            {!editMultiRate ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Hour Cap *</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={editMonth.maxHours}
                  onChange={(e) => setEditMonth({ ...editMonth, maxHours: e.target.value })}
                  className="col-span-3"
                  data-testid="input-edit-retainer-hours"
                />
              </div>
            ) : (
              <div className="col-span-4">
                <RateTierEditor tiers={editRateTiers} onChange={setEditRateTiers} />
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Start Date *</Label>
              <Input
                type="date"
                value={editMonth.startDate}
                onChange={(e) => setEditMonth({ ...editMonth, startDate: e.target.value })}
                className="col-span-3"
                data-testid="input-edit-retainer-start"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">End Date *</Label>
              <Input
                type="date"
                value={editMonth.endDate}
                onChange={(e) => setEditMonth({ ...editMonth, endDate: e.target.value })}
                className="col-span-3"
                data-testid="input-edit-retainer-end"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button
              onClick={handleUpdateMonth}
              disabled={!isEditValid || updateStageMutation.isPending}
              data-testid="button-save-edit-retainer"
            >
              {updateStageMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
