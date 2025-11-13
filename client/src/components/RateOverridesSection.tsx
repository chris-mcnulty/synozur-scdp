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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Calendar, DollarSign, Users, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface RateOverride {
  id: string;
  estimateId: string;
  subjectType: 'role' | 'person';
  subjectId: string;
  subjectName: string;
  billingRate: string | null;
  costRate: string | null;
  effectiveStart: string;
  effectiveEnd: string | null;
  lineItemIds: string[] | null;
  notes: string | null;
  appliesTo: string;
}

interface RateOverridesSectionProps {
  estimateId: string;
  isEditable: boolean;
}

export function RateOverridesSection({ estimateId, isEditable }: RateOverridesSectionProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newOverride, setNewOverride] = useState({
    subjectType: 'role' as 'role' | 'person',
    subjectId: '',
    billingRate: '',
    costRate: '',
    effectiveStart: new Date().toISOString().split('T')[0],
    effectiveEnd: '',
    notes: '',
  });

  // Fetch rate overrides
  const { data: overrides = [], isLoading, error: fetchError } = useQuery<RateOverride[]>({
    queryKey: ['/api/estimates', estimateId, 'rate-overrides'],
    enabled: !!estimateId,
  });

  // Fetch users and roles for dropdowns
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ['/api/roles'],
  });

  // Create override mutation
  const createOverrideMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/estimates/${estimateId}/rate-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', estimateId, 'rate-overrides'] });
      toast({
        title: "Rate override created",
        description: "The rate override has been successfully created.",
      });
      setShowAddDialog(false);
      setNewOverride({
        subjectType: 'role',
        subjectId: '',
        billingRate: '',
        costRate: '',
        effectiveStart: new Date().toISOString().split('T')[0],
        effectiveEnd: '',
        notes: '',
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating override",
        description: error.message || "Failed to create rate override",
        variant: "destructive",
      });
    },
  });

  // Delete override mutation
  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      await apiRequest(`/api/estimates/${estimateId}/rate-overrides/${overrideId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', estimateId, 'rate-overrides'] });
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

  const handleCreateOverride = () => {
    const data: any = {
      subjectType: newOverride.subjectType,
      subjectId: newOverride.subjectId,
      effectiveStart: newOverride.effectiveStart,
    };

    if (newOverride.billingRate) {
      data.billingRate = parseFloat(newOverride.billingRate);
    }
    if (newOverride.costRate) {
      data.costRate = parseFloat(newOverride.costRate);
    }
    if (newOverride.effectiveEnd) {
      data.effectiveEnd = newOverride.effectiveEnd;
    }
    if (newOverride.notes) {
      data.notes = newOverride.notes;
    }

    createOverrideMutation.mutate(data);
  };

  const isFormValid = newOverride.subjectId && (newOverride.billingRate || newOverride.costRate);

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Rate Overrides</CardTitle>
              <CardDescription>
                Set custom billing and cost rates for specific roles or individuals
              </CardDescription>
            </div>
            {isEditable && (
              <Button
                onClick={() => setShowAddDialog(true)}
                size="sm"
                data-testid="button-add-rate-override"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Override
              </Button>
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
              <p>No rate overrides configured</p>
              <p className="text-sm mt-1">Add overrides to customize rates for specific roles or people</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Billing Rate</TableHead>
                    <TableHead className="text-right">Cost Rate</TableHead>
                    <TableHead>Effective Period</TableHead>
                    <TableHead>Applies To</TableHead>
                    {isEditable && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrides.map((override) => (
                    <TableRow key={override.id} data-testid={`row-rate-override-${override.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {override.subjectType === 'role' ? (
                            <Users className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium" data-testid={`text-subject-name-${override.id}`}>
                              {override.subjectName}
                            </div>
                            <div className="text-xs text-muted-foreground capitalize" data-testid={`text-subject-type-${override.id}`}>
                              {override.subjectType}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {override.billingRate ? (
                          <span className="font-medium" data-testid={`text-billing-rate-${override.id}`}>
                            ${Number(override.billingRate).toFixed(0)}/hr
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {override.costRate ? (
                          <span className="font-medium" data-testid={`text-cost-rate-${override.id}`}>
                            ${Number(override.costRate).toFixed(0)}/hr
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm" data-testid={`text-effective-period-${override.id}`}>
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{format(new Date(override.effectiveStart), 'MMM d, yyyy')}</span>
                          {override.effectiveEnd && (
                            <>
                              <span className="text-muted-foreground">to</span>
                              <span>{format(new Date(override.effectiveEnd), 'MMM d, yyyy')}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-applies-to-${override.id}`}>
                          {override.appliesTo}
                        </Badge>
                      </TableCell>
                      {isEditable && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteOverrideMutation.mutate(override.id)}
                            disabled={deleteOverrideMutation.isPending}
                            data-testid={`button-delete-override-${override.id}`}
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
              <p className="text-xs">Manual inline edits → Estimate overrides → User defaults → Role defaults</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Override Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Rate Override</DialogTitle>
            <DialogDescription>
              Create a custom billing or cost rate for a specific role or person
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Subject Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject-type" className="text-right">
                Type
              </Label>
              <Select
                value={newOverride.subjectType}
                onValueChange={(value: 'role' | 'person') => 
                  setNewOverride({ ...newOverride, subjectType: value, subjectId: '' })
                }
              >
                <SelectTrigger className="col-span-3" data-testid="select-subject-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Role</SelectItem>
                  <SelectItem value="person">Person</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subject Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                {newOverride.subjectType === 'role' ? 'Role' : 'Person'} *
              </Label>
              <Select
                value={newOverride.subjectId}
                onValueChange={(value) => setNewOverride({ ...newOverride, subjectId: value })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-subject">
                  <SelectValue placeholder={`Select ${newOverride.subjectType}`} />
                </SelectTrigger>
                <SelectContent>
                  {newOverride.subjectType === 'role' ? (
                    roles.map((role: any) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))
                  ) : (
                    users
                      .filter((u: any) => u.isAssignable)
                      .map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Billing Rate */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="billing-rate" className="text-right">
                Billing Rate
              </Label>
              <Input
                id="billing-rate"
                type="number"
                step="0.01"
                placeholder="e.g., 150"
                value={newOverride.billingRate}
                onChange={(e) => setNewOverride({ ...newOverride, billingRate: e.target.value })}
                className="col-span-3"
                data-testid="input-billing-rate"
              />
            </div>

            {/* Cost Rate */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cost-rate" className="text-right">
                Cost Rate
              </Label>
              <Input
                id="cost-rate"
                type="number"
                step="0.01"
                placeholder="e.g., 100"
                value={newOverride.costRate}
                onChange={(e) => setNewOverride({ ...newOverride, costRate: e.target.value })}
                className="col-span-3"
                data-testid="input-cost-rate"
              />
            </div>

            {/* Effective Start */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="effective-start" className="text-right">
                Effective Start *
              </Label>
              <Input
                id="effective-start"
                type="date"
                value={newOverride.effectiveStart}
                onChange={(e) => setNewOverride({ ...newOverride, effectiveStart: e.target.value })}
                className="col-span-3"
                data-testid="input-effective-start"
              />
            </div>

            {/* Effective End */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="effective-end" className="text-right">
                Effective End
              </Label>
              <Input
                id="effective-end"
                type="date"
                value={newOverride.effectiveEnd}
                onChange={(e) => setNewOverride({ ...newOverride, effectiveEnd: e.target.value })}
                className="col-span-3"
                data-testid="input-effective-end"
              />
            </div>

            {/* Notes */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="notes" className="text-right pt-2">
                Notes
              </Label>
              <Textarea
                id="notes"
                placeholder="Optional notes about this override..."
                value={newOverride.notes}
                onChange={(e) => setNewOverride({ ...newOverride, notes: e.target.value })}
                className="col-span-3"
                rows={3}
                data-testid="input-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              data-testid="button-cancel-override"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateOverride}
              disabled={!isFormValid || createOverrideMutation.isPending}
              data-testid="button-save-override"
            >
              {createOverrideMutation.isPending ? "Creating..." : "Create Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
