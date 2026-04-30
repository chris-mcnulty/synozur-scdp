import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Milestone,
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  MoreVertical,
  Edit,
  Trash,
  Plus,
  ExternalLink,
} from "lucide-react";

interface ProjectMilestone {
  id: string;
  projectId?: string;
  projectEpicId?: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  budgetHours?: string;
  actualHours?: string;
  status: 'not-started' | 'in-progress' | 'completed';
  order: number;
  targetAmount?: string;
  billedAmount?: string;
  isPaymentMilestone?: boolean;
  invoiceStatus?: 'planned' | 'invoiced' | 'paid' | null;
  amount?: string;
  createdAt: string;
}

interface ProjectMilestonesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
  onMilestoneSelect?: (milestone: ProjectMilestone) => void;
  selectionMode?: boolean;
}

export function ProjectMilestonesDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onMilestoneSelect,
  selectionMode = false
}: ProjectMilestonesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "not-started" as 'not-started' | 'in-progress' | 'completed',
    startDate: "",
    endDate: "",
    budgetHours: "",
    targetAmount: "",
    isPaymentMilestone: false,
    amount: "",
  });

  const isBillingAdmin = ['admin', 'billing-admin'].includes(user?.role || '');

  const { data: milestones = [], isLoading } = useQuery<ProjectMilestone[]>({
    queryKey: [`/api/projects/${projectId}/milestones`],
    enabled: !!projectId && open
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (data: Partial<ProjectMilestone> & { isPaymentMilestone: boolean; amount?: string }) => {
      return await apiRequest(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ title: "Success", description: "Milestone created successfully" });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create milestone", variant: "destructive" });
    }
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ProjectMilestone> & { id: string }) => {
      return await apiRequest(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ title: "Success", description: "Milestone updated successfully" });
      setEditingMilestone(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update milestone", variant: "destructive" });
    }
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: async ({ id, invoiceStatus }: { id: string; invoiceStatus: string }) => {
      return await apiRequest(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ invoiceStatus })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ title: "Billing status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update billing status", variant: "destructive" });
    }
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/milestones/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ title: "Success", description: "Milestone deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete milestone", variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      status: "not-started",
      startDate: "",
      endDate: "",
      budgetHours: "",
      targetAmount: "",
      isPaymentMilestone: false,
      amount: "",
    });
    setShowCreateDialog(false);
  };

  const handleEdit = (milestone: ProjectMilestone) => {
    setEditingMilestone(milestone);
    setFormData({
      name: milestone.name,
      description: milestone.description || "",
      status: milestone.status,
      startDate: milestone.startDate || "",
      endDate: milestone.endDate || "",
      budgetHours: milestone.budgetHours || "",
      targetAmount: milestone.targetAmount || "",
      isPaymentMilestone: milestone.isPaymentMilestone ?? false,
      amount: milestone.amount || "",
    });
    setShowCreateDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({ title: "Validation Error", description: "Milestone name is required", variant: "destructive" });
      return;
    }

    const data = {
      ...formData,
      budgetHours: !formData.isPaymentMilestone ? (formData.budgetHours || undefined) : undefined,
      amount: formData.isPaymentMilestone ? (formData.amount || undefined) : undefined,
      targetAmount: formData.targetAmount || undefined,
    };

    if (editingMilestone) {
      updateMilestoneMutation.mutate({ id: editingMilestone.id, ...data });
    } else {
      createMilestoneMutation.mutate(data);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800" data-testid={`badge-status-${status}`}>
          <CheckCircle className="w-3 h-3 mr-1" />Completed
        </Badge>;
      case 'in-progress':
        return <Badge className="bg-blue-100 text-blue-800" data-testid={`badge-status-${status}`}>
          <Clock className="w-3 h-3 mr-1" />In Progress
        </Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800" data-testid={`badge-status-${status}`}>
          <AlertCircle className="w-3 h-3 mr-1" />Not Started
        </Badge>;
    }
  };

  const getTypeBadge = (milestone: ProjectMilestone) => {
    if (milestone.isPaymentMilestone) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200">
          <DollarSign className="w-3 h-3 mr-1" />Payment
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200">
        <CheckCircle className="w-3 h-3 mr-1" />Delivery
      </Badge>
    );
  };

  const getInvoiceStatusBadge = (invoiceStatus?: string | null) => {
    switch (invoiceStatus) {
      case 'paid':
        return <Badge variant="default">Paid</Badge>;
      case 'invoiced':
        return <Badge variant="secondary">Invoiced</Badge>;
      default:
        return <Badge variant="outline">Planned</Badge>;
    }
  };

  const calculateProgress = (milestone: ProjectMilestone) => {
    if (!milestone.targetAmount || !milestone.billedAmount) return 0;
    const target = parseFloat(milestone.targetAmount);
    const billed = parseFloat(milestone.billedAmount);
    return target > 0 ? Math.min((billed / target) * 100, 100) : 0;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Milestone className="w-5 h-5" />
              Project Milestones
              {projectName && <span className="text-muted-foreground">- {projectName}</span>}
            </DialogTitle>
            <DialogDescription>
              {selectionMode
                ? "Select a milestone to map invoice lines to"
                : "Manage project milestones and track their progress"
              }
            </DialogDescription>
          </DialogHeader>

          {!showCreateDialog ? (
            <div className="space-y-4">
              {!selectionMode && (
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} found
                  </div>
                  <Button onClick={() => setShowCreateDialog(true)} size="sm" data-testid="button-create-milestone">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                  </Button>
                </div>
              )}

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading milestones...</div>
              ) : milestones.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <Milestone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">No milestones found for this project</p>
                    {!selectionMode && (
                      <Button onClick={() => setShowCreateDialog(true)} variant="outline" data-testid="button-create-first-milestone">
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Milestone
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Milestone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Billing Status</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones.map((milestone) => {
                      const progress = calculateProgress(milestone);

                      return (
                        <TableRow
                          key={milestone.id}
                          className={selectionMode ? "cursor-pointer hover:bg-muted/50" : ""}
                          onClick={selectionMode ? () => onMilestoneSelect?.(milestone) : undefined}
                          data-testid={`row-milestone-${milestone.id}`}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{milestone.name}</p>
                              {milestone.description && (
                                <p className="text-sm text-muted-foreground">{milestone.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(milestone)}</TableCell>
                          <TableCell>{getStatusBadge(milestone.status)}</TableCell>
                          <TableCell>
                            {milestone.isPaymentMilestone ? (
                              isBillingAdmin && !selectionMode ? (
                                <Select
                                  value={milestone.invoiceStatus || 'planned'}
                                  onValueChange={(value) => updateInvoiceStatusMutation.mutate({ id: milestone.id, invoiceStatus: value })}
                                >
                                  <SelectTrigger className="h-7 text-xs w-28" onClick={(e) => e.stopPropagation()}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="planned">Planned</SelectItem>
                                    <SelectItem value="invoiced">Invoiced</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                getInvoiceStatusBadge(milestone.invoiceStatus)
                              )
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {milestone.startDate && milestone.endDate ? (
                                <>{format(new Date(milestone.startDate), 'MMM d')} - {format(new Date(milestone.endDate), 'MMM d, yyyy')}</>
                              ) : milestone.endDate ? (
                                <>Due: {format(new Date(milestone.endDate), 'MMM d, yyyy')}</>
                              ) : (
                                <span className="text-muted-foreground">No dates set</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {milestone.isPaymentMilestone && milestone.amount ? (
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {parseFloat(milestone.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            ) : milestone.targetAmount ? (
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {parseFloat(milestone.targetAmount).toLocaleString()}
                              </div>
                            ) : milestone.budgetHours ? (
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {milestone.budgetHours} hrs
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {milestone.targetAmount && milestone.billedAmount ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <div className="w-24">
                                      <Progress value={progress} className="h-2" />
                                      <p className="text-xs text-muted-foreground mt-1">{progress.toFixed(0)}%</p>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>${parseFloat(milestone.billedAmount).toLocaleString()} billed</p>
                                    <p>of ${parseFloat(milestone.targetAmount).toLocaleString()} target</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {selectionMode ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); onMilestoneSelect?.(milestone); }}
                                data-testid={`button-select-${milestone.id}`}
                              >
                                Select
                              </Button>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {milestone.isPaymentMilestone && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { onOpenChange(false); setLocation(`/billing?milestoneId=${milestone.id}`); }}
                                    title="View in Billing"
                                    data-testid={`button-billing-link-${milestone.id}`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" data-testid={`button-menu-${milestone.id}`}>
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleEdit(milestone)} data-testid={`menu-edit-${milestone.id}`}>
                                      <Edit className="w-4 h-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (confirm(`Delete milestone "${milestone.name}"?`)) {
                                          deleteMilestoneMutation.mutate(milestone.id);
                                        }
                                      }}
                                      className="text-red-600"
                                      data-testid={`menu-delete-${milestone.id}`}
                                    >
                                      <Trash className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            <form name="project-milestone-manage-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Milestone Type</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isPaymentMilestone: false })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${!formData.isPaymentMilestone ? 'bg-blue-600 text-white border-blue-600' : 'bg-background text-muted-foreground border-border hover:bg-muted/50'}`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Delivery Gate
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isPaymentMilestone: true })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${formData.isPaymentMilestone ? 'bg-green-600 text-white border-green-600' : 'bg-background text-muted-foreground border-border hover:bg-muted/50'}`}
                  >
                    <DollarSign className="w-4 h-4" />
                    Payment Trigger
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Phase 1 Delivery"
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Milestone description..."
                  rows={3}
                  data-testid="input-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                  >
                    <SelectTrigger id="status" data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-started">Not Started</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.isPaymentMilestone ? (
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount ($)</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      step="0.01"
                      data-testid="input-amount"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="budgetHours">Budget Hours</Label>
                    <Input
                      id="budgetHours"
                      type="number"
                      value={formData.budgetHours}
                      onChange={(e) => setFormData({ ...formData, budgetHours: e.target.value })}
                      placeholder="0"
                      step="0.5"
                      data-testid="input-budget-hours"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    data-testid="input-start-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setEditingMilestone(null);
                    resetForm();
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMilestoneMutation.isPending || updateMilestoneMutation.isPending}
                  data-testid="button-save"
                >
                  {editingMilestone ? 'Update' : 'Create'} Milestone
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
