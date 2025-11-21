import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Target,
  TrendingUp
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "not-started" as 'not-started' | 'in-progress' | 'completed',
    startDate: "",
    endDate: "",
    budgetHours: "",
    targetAmount: ""
  });

  // Fetch milestones for the project
  const { data: milestones = [], isLoading } = useQuery<ProjectMilestone[]>({
    queryKey: [`/api/projects/${projectId}/milestones`],
    enabled: !!projectId && open
  });

  // Create milestone mutation
  const createMilestoneMutation = useMutation({
    mutationFn: async (data: Partial<ProjectMilestone>) => {
      return await apiRequest(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ 
        title: "Success",
        description: "Milestone created successfully" 
      });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to create milestone",
        variant: "destructive" 
      });
    }
  });

  // Update milestone mutation
  const updateMilestoneMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ProjectMilestone> & { id: string }) => {
      return await apiRequest(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ 
        title: "Success",
        description: "Milestone updated successfully" 
      });
      setEditingMilestone(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update milestone",
        variant: "destructive" 
      });
    }
  });

  // Delete milestone mutation
  const deleteMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/milestones/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ 
        title: "Success",
        description: "Milestone deleted successfully" 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to delete milestone",
        variant: "destructive" 
      });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      status: "not-started" as 'not-started' | 'in-progress' | 'completed',
      startDate: "",
      endDate: "",
      budgetHours: "",
      targetAmount: ""
    });
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
      targetAmount: milestone.targetAmount || ""
    });
    setShowCreateDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Milestone name is required",
        variant: "destructive"
      });
      return;
    }

    const data = {
      ...formData,
      budgetHours: formData.budgetHours || undefined,
      targetAmount: formData.targetAmount || undefined
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
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>;
      case 'in-progress':
        return <Badge className="bg-blue-100 text-blue-800" data-testid={`badge-status-${status}`}>
          <Clock className="w-3 h-3 mr-1" />
          In Progress
        </Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800" data-testid={`badge-status-${status}`}>
          <AlertCircle className="w-3 h-3 mr-1" />
          Not Started
        </Badge>;
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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    size="sm"
                    data-testid="button-create-milestone"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                  </Button>
                </div>
              )}

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading milestones...
                </div>
              ) : milestones.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <Milestone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">No milestones found for this project</p>
                    {!selectionMode && (
                      <Button
                        onClick={() => setShowCreateDialog(true)}
                        variant="outline"
                        data-testid="button-create-first-milestone"
                      >
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
                      <TableHead>Status</TableHead>
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
                          <TableCell>{getStatusBadge(milestone.status)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {milestone.startDate && milestone.endDate ? (
                                <>
                                  {format(new Date(milestone.startDate), 'MMM d')} - 
                                  {format(new Date(milestone.endDate), 'MMM d, yyyy')}
                                </>
                              ) : milestone.endDate ? (
                                <>Due: {format(new Date(milestone.endDate), 'MMM d, yyyy')}</>
                              ) : (
                                <span className="text-muted-foreground">No dates set</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {milestone.targetAmount ? (
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
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {progress.toFixed(0)}%
                                      </p>
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMilestoneSelect?.(milestone);
                                }}
                                data-testid={`button-select-${milestone.id}`}
                              >
                                Select
                              </Button>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    data-testid={`button-menu-${milestone.id}`}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem 
                                    onClick={() => handleEdit(milestone)}
                                    data-testid={`menu-edit-${milestone.id}`}
                                  >
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

                <div className="space-y-2">
                  <Label htmlFor="targetAmount">Target Amount</Label>
                  <Input
                    id="targetAmount"
                    type="number"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    data-testid="input-target-amount"
                  />
                </div>
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