import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Calendar, DollarSign, User, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ProjectRateOverride {
  id: string;
  projectId: string;
  userId: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  billingRate: string | null;
  costRate: string | null;
  notes: string | null;
  createdAt: string;
}

interface RecalcPreview {
  dryRun: boolean;
  totalEntries: number;
  lockedEntries: number;
  wouldChange: number;
  unchanged: number;
}

interface ProjectRateOverridesSectionProps {
  projectId: string;
  isEditable: boolean;
}

export function ProjectRateOverridesSection({ projectId, isEditable }: ProjectRateOverridesSectionProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRecalcDialog, setShowRecalcDialog] = useState(false);
  const [recalcPreview, setRecalcPreview] = useState<RecalcPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [newOverride, setNewOverride] = useState({
    userId: '',
    billingRate: '',
    costRate: '',
    effectiveStart: new Date().toISOString().split('T')[0],
    effectiveEnd: '',
    notes: '',
  });

  const { data: overrides = [], isLoading, error: fetchError } = useQuery<ProjectRateOverride[]>({
    queryKey: ['/api/projects', projectId, 'rate-overrides'],
    enabled: !!projectId,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const userMap = new Map(users.map((u: any) => [u.id, u.name || u.email]));

  const createOverrideMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/projects/${projectId}/rate-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'rate-overrides'] });
      toast({
        title: "Rate override created",
        description: "The project rate override has been saved.",
      });
      setShowAddDialog(false);
      setNewOverride({
        userId: '',
        billingRate: '',
        costRate: '',
        effectiveStart: new Date().toISOString().split('T')[0],
        effectiveEnd: '',
        notes: '',
      });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to create rate override";
      if (error.errors && Array.isArray(error.errors)) {
        errorMessage = `Validation error: ${error.errors.map((e: any) => `${e.path?.join('.') || 'field'}: ${e.message}`).join(', ')}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({
        title: "Error creating override",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      await apiRequest(`/api/projects/${projectId}/rate-overrides/${overrideId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'rate-overrides'] });
      toast({
        title: "Override deleted",
        description: "The rate override has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting override",
        description: error.message || "Failed to delete rate override",
        variant: "destructive",
      });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/recalculate-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({
        title: "Rates recalculated",
        description: `Updated ${result.updated} time entries. ${result.skipped > 0 ? `${result.skipped} locked entries were skipped.` : ''}`,
      });
      setShowRecalcDialog(false);
      setRecalcPreview(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error recalculating rates",
        description: error.message || "Failed to recalculate rates",
        variant: "destructive",
      });
    },
  });

  const handleOpenRecalcDialog = async () => {
    setShowRecalcDialog(true);
    setPreviewLoading(true);
    setRecalcPreview(null);
    try {
      const preview = await apiRequest(`/api/projects/${projectId}/recalculate-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      setRecalcPreview(preview as RecalcPreview);
    } catch (error: any) {
      toast({
        title: "Error loading preview",
        description: error.message || "Could not preview rate changes",
        variant: "destructive",
      });
      setShowRecalcDialog(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateOverride = () => {
    const data: any = {
      userId: newOverride.userId,
      effectiveStart: newOverride.effectiveStart,
    };

    if (newOverride.billingRate) {
      data.billingRate = newOverride.billingRate;
    }
    if (newOverride.costRate) {
      data.costRate = newOverride.costRate;
    }
    if (newOverride.effectiveEnd) {
      data.effectiveEnd = newOverride.effectiveEnd;
    }
    if (newOverride.notes) {
      data.notes = newOverride.notes;
    }

    createOverrideMutation.mutate(data);
  };

  const isFormValid = newOverride.userId && newOverride.effectiveStart && (newOverride.billingRate || newOverride.costRate);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Project Rate Overrides
              </CardTitle>
              <CardDescription>
                Set custom billing and cost rates for team members on this project
              </CardDescription>
            </div>
            {isEditable && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleOpenRecalcDialog}
                  variant="outline"
                  size="sm"
                  data-testid="button-recalculate-rates"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recalculate Rates
                </Button>
                <Button
                  onClick={() => setShowAddDialog(true)}
                  size="sm"
                  data-testid="button-add-project-rate-override"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Override
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            <div className="text-center py-8 text-destructive">
              <p className="font-medium">Failed to load rate overrides</p>
              <p className="text-sm mt-1">{(fetchError as Error).message || "An error occurred"}</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading overrides...</div>
          ) : overrides.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No project rate overrides configured</p>
              <p className="text-sm mt-1">Add overrides to customize rates for team members on this project</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Member</TableHead>
                    <TableHead className="text-right">Billing Rate</TableHead>
                    <TableHead className="text-right">Cost Rate</TableHead>
                    <TableHead>Effective Period</TableHead>
                    <TableHead>Notes</TableHead>
                    {isEditable && <TableHead className="w-12">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrides.map((override) => (
                    <TableRow key={override.id} data-testid={`row-project-rate-override-${override.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {userMap.get(override.userId) || override.userId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {override.billingRate ? (
                          <span className="font-medium">${Number(override.billingRate).toFixed(0)}/hr</span>
                        ) : (
                          <span className="text-muted-foreground">{'\u2014'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {override.costRate ? (
                          <span className="font-medium">${Number(override.costRate).toFixed(0)}/hr</span>
                        ) : (
                          <span className="text-muted-foreground">{'\u2014'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{format(new Date(override.effectiveStart), 'MMM d, yyyy')}</span>
                          {override.effectiveEnd && (
                            <>
                              <span className="text-muted-foreground">to</span>
                              <span>{format(new Date(override.effectiveEnd), 'MMM d, yyyy')}</span>
                            </>
                          )}
                          {!override.effectiveEnd && (
                            <span className="text-muted-foreground italic ml-1">(ongoing)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {override.notes ? (
                          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{override.notes}</span>
                        ) : (
                          <span className="text-muted-foreground">{'\u2014'}</span>
                        )}
                      </TableCell>
                      {isEditable && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteOverrideMutation.mutate(override.id)}
                            disabled={deleteOverrideMutation.isPending}
                            data-testid={`button-delete-project-override-${override.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {overrides.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="font-medium mb-1">Rate Precedence:</p>
              <p className="text-xs">Project overrides {'\u2192'} User rate schedule {'\u2192'} Role defaults {'\u2192'} System defaults</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Override Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Project Rate Override</DialogTitle>
            <DialogDescription>
              Set a custom billing or cost rate for a team member on this project
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="override-user" className="text-right">
                Person *
              </Label>
              <Select
                value={newOverride.userId}
                onValueChange={(value) => setNewOverride({ ...newOverride, userId: value })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-project-override-user">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u: any) => u.isAssignable)
                    .map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="override-billing-rate" className="text-right">
                Billing Rate
              </Label>
              <Input
                id="override-billing-rate"
                type="number"
                step="0.01"
                placeholder="e.g., 200"
                value={newOverride.billingRate}
                onChange={(e) => setNewOverride({ ...newOverride, billingRate: e.target.value })}
                className="col-span-3"
                data-testid="input-project-override-billing-rate"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="override-cost-rate" className="text-right">
                Cost Rate
              </Label>
              <Input
                id="override-cost-rate"
                type="number"
                step="0.01"
                placeholder="e.g., 120"
                value={newOverride.costRate}
                onChange={(e) => setNewOverride({ ...newOverride, costRate: e.target.value })}
                className="col-span-3"
                data-testid="input-project-override-cost-rate"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="override-effective-start" className="text-right">
                Start Date *
              </Label>
              <Input
                id="override-effective-start"
                type="date"
                value={newOverride.effectiveStart}
                onChange={(e) => setNewOverride({ ...newOverride, effectiveStart: e.target.value })}
                className="col-span-3"
                data-testid="input-project-override-start-date"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="override-effective-end" className="text-right">
                End Date
              </Label>
              <Input
                id="override-effective-end"
                type="date"
                value={newOverride.effectiveEnd}
                onChange={(e) => setNewOverride({ ...newOverride, effectiveEnd: e.target.value })}
                className="col-span-3"
                data-testid="input-project-override-end-date"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="override-notes" className="text-right">
                Notes
              </Label>
              <Textarea
                id="override-notes"
                placeholder="Optional notes about this rate override"
                value={newOverride.notes}
                onChange={(e) => setNewOverride({ ...newOverride, notes: e.target.value })}
                className="col-span-3"
                rows={2}
                data-testid="input-project-override-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOverride}
              disabled={!isFormValid || createOverrideMutation.isPending}
              data-testid="button-save-project-rate-override"
            >
              {createOverrideMutation.isPending ? "Saving..." : "Save Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recalculate Rates Confirmation Dialog */}
      <Dialog open={showRecalcDialog} onOpenChange={(open) => { setShowRecalcDialog(open); if (!open) setRecalcPreview(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Recalculate Time Entry Rates
            </DialogTitle>
            <DialogDescription>
              Re-apply the current rate precedence to all time entries on this project. This will update billing and cost rates based on the latest overrides, schedules, and defaults.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {previewLoading ? (
              <div className="text-center py-6 text-muted-foreground">
                <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin" />
                <p>Analyzing time entries...</p>
              </div>
            ) : recalcPreview ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{recalcPreview.totalEntries}</p>
                    <p className="text-xs text-muted-foreground">Total entries</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{recalcPreview.wouldChange}</p>
                    <p className="text-xs text-muted-foreground">Would be updated</p>
                  </div>
                </div>

                {recalcPreview.lockedEntries > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {recalcPreview.lockedEntries} locked {recalcPreview.lockedEntries === 1 ? 'entry' : 'entries'} will be skipped (already invoiced or approved).
                    </AlertDescription>
                  </Alert>
                )}

                {recalcPreview.wouldChange === 0 && (
                  <div className="text-center py-2 text-muted-foreground text-sm">
                    All time entries already have the correct rates. No changes needed.
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Rate precedence applied:</p>
                  <p>Project overrides {'\u2192'} User rate schedules {'\u2192'} Role defaults {'\u2192'} System defaults</p>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRecalcDialog(false); setRecalcPreview(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending || previewLoading || (recalcPreview?.wouldChange === 0)}
              variant={recalcPreview && recalcPreview.wouldChange > 0 ? "default" : "secondary"}
              data-testid="button-confirm-recalculate"
            >
              {recalculateMutation.isPending ? "Recalculating..." : `Recalculate ${recalcPreview?.wouldChange || 0} Entries`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
