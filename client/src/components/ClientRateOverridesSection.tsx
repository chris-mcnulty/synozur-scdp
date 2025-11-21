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
import { AlertCircle, Plus, Trash2, Calendar, DollarSign, Users, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ClientRateOverride {
  id: string;
  clientId: string;
  subjectType: 'role' | 'person';
  subjectId: string;
  subjectName: string;
  billingRate: string | null;
  costRate: string | null;
  effectiveStart: string;
  effectiveEnd: string | null;
  notes: string | null;
}

interface ClientRateOverridesSectionProps {
  clientId: string;
}

export function ClientRateOverridesSection({ clientId }: ClientRateOverridesSectionProps) {
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
  const { data: overrides = [], isLoading, error: fetchError } = useQuery<ClientRateOverride[]>({
    queryKey: ['/api/clients', clientId, 'rate-overrides'],
    enabled: !!clientId,
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
      const response = await apiRequest(`/api/clients/${clientId}/rate-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients', clientId, 'rate-overrides'] });
      toast({
        title: "Rate override created",
        description: "This rate will be used as the default for new estimates created after the effective start date.",
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
      await apiRequest(`/api/clients/${clientId}/rate-overrides/${overrideId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients', clientId, 'rate-overrides'] });
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Client Rate Overrides</CardTitle>
              <CardDescription>
                Set default billing and cost rates for specific roles or individuals. These rates will apply to all new estimates created after the effective start date.
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowAddDialog(true)}
              data-testid="button-add-client-rate-override"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Override
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading rate overrides...</div>
          ) : fetchError ? (
            <div className="text-center py-8 text-destructive">Error loading rate overrides</div>
          ) : overrides.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No rate overrides configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add rate overrides to set default rates for this client
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Billing Rate</TableHead>
                  <TableHead>Cost Rate</TableHead>
                  <TableHead>Effective Period</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((override) => (
                  <TableRow key={override.id} data-testid={`row-rate-override-${override.id}`}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {override.subjectType === 'person' ? (
                          <User className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Users className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{override.subjectName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={override.subjectType === 'person' ? 'default' : 'secondary'}>
                        {override.subjectType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {override.billingRate ? (
                        <div className="flex items-center space-x-1">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          <span>{parseFloat(override.billingRate).toFixed(2)}/hr</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {override.costRate ? (
                        <div className="flex items-center space-x-1">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          <span>{parseFloat(override.costRate).toFixed(2)}/hr</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>
                          {format(new Date(override.effectiveStart), 'MMM d, yyyy')}
                          {override.effectiveEnd && (
                            <> - {format(new Date(override.effectiveEnd), 'MMM d, yyyy')}</>
                          )}
                          {!override.effectiveEnd && <> - Ongoing</>}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {override.notes ? (
                        <span className="text-sm text-muted-foreground line-clamp-2">
                          {override.notes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Override Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-add-rate-override">
          <DialogHeader>
            <DialogTitle>Add Client Rate Override</DialogTitle>
            <DialogDescription>
              Set a default billing and cost rate for a specific role or person. This override will apply to all new estimates created after the effective start date.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Subject Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject-type" className="text-right">
                Subject Type
              </Label>
              <Select
                value={newOverride.subjectType}
                onValueChange={(value: 'role' | 'person') => {
                  setNewOverride({ ...newOverride, subjectType: value, subjectId: '' });
                }}
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
                {newOverride.subjectType === 'role' ? 'Role' : 'Person'}
              </Label>
              <Select
                value={newOverride.subjectId}
                onValueChange={(value) => setNewOverride({ ...newOverride, subjectId: value })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-subject">
                  <SelectValue placeholder={`Select a ${newOverride.subjectType}`} />
                </SelectTrigger>
                <SelectContent>
                  {newOverride.subjectType === 'role'
                    ? roles
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((role: any) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))
                    : users
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((user: any) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))
                  }
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
                placeholder="e.g., 150.00"
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
                placeholder="e.g., 75.00"
                value={newOverride.costRate}
                onChange={(e) => setNewOverride({ ...newOverride, costRate: e.target.value })}
                className="col-span-3"
                data-testid="input-cost-rate"
              />
            </div>

            {/* Effective Start */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="effective-start" className="text-right">
                Effective Start
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
                placeholder="Leave blank for ongoing"
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
                placeholder="Optional notes about this rate override"
                value={newOverride.notes}
                onChange={(e) => setNewOverride({ ...newOverride, notes: e.target.value })}
                className="col-span-3"
                rows={3}
                data-testid="textarea-notes"
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
              data-testid="button-create-override"
            >
              {createOverrideMutation.isPending ? 'Creating...' : 'Create Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
