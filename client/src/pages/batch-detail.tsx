import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Download, 
  FileText,
  ChevronRight,
  ChevronDown,
  DollarSign,
  Calendar,
  Building,
  FolderOpen,
  Lock,
  CheckCircle,
  Edit,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  CheckSquare,
  Square,
  MinusSquare,
  Info,
  Calculator,
  Undo
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { InvoiceLineEditDialog } from "@/components/billing/invoice-line-edit-dialog";
import { InvoiceLineBulkEditDialog } from "@/components/billing/invoice-line-bulk-edit-dialog";
import { AggregateAdjustmentDialog } from "@/components/billing/aggregate-adjustment-dialog";
import { AdjustmentHistory } from "@/components/billing/adjustment-history";

interface InvoiceBatchDetails {
  id: string;
  batchId: string;
  startDate: string;
  endDate: string;
  month?: string;
  pricingSnapshotDate: string;
  discountPercent?: string;
  discountAmount?: string;
  totalAmount?: string;
  invoicingMode: string;
  status: string;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  notes?: string | null;
  exportedToQBO: boolean;
  exportedAt?: string;
  createdAt: string;
  totalLinesCount: number;
  clientCount: number;
  projectCount: number;
  finalizer?: { id: string; name: string; email: string } | null;
}

interface InvoiceLine {
  id: string;
  batchId: string;
  projectId: string;
  clientId: string;
  type: string;
  quantity?: string;
  rate?: string;
  amount: string;
  description?: string;
  originalAmount?: string;
  originalQuantity?: string;
  originalRate?: string;
  billedAmount?: string;
  varianceAmount?: string;
  adjustmentType?: string;
  adjustmentReason?: string;
  editedBy?: { id: string; name: string; email: string };
  editedAt?: string;
  isAdjustment?: boolean;
  project: {
    id: string;
    name: string;
    code: string;
  };
  client: {
    id: string;
    name: string;
  };
}

interface GroupedInvoiceLines {
  [clientId: string]: {
    client: { id: string; name: string };
    projects: {
      [projectId: string]: {
        project: { id: string; name: string; code: string };
        lines: InvoiceLine[];
        subtotal: number;
      };
    };
    subtotal: number;
  };
}

export default function BatchDetail() {
  const { batchId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showUnfinalizeDialog, setShowUnfinalizeDialog] = useState(false);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAggregateAdjustmentDialog, setShowAggregateAdjustmentDialog] = useState(false);
  const [showAdjustmentHistory, setShowAdjustmentHistory] = useState(false);
  
  // Fetch batch details
  const { data: batchDetails, isLoading: isLoadingDetails, error: detailsError } = useQuery<InvoiceBatchDetails>({
    queryKey: [`/api/invoice-batches/${batchId}/details`],
    enabled: !!batchId,
  });

  // Fetch invoice lines grouped by client and project
  const { data: groupedLines, isLoading: isLoadingLines, error: linesError } = useQuery<GroupedInvoiceLines>({
    queryKey: [`/api/invoice-batches/${batchId}/lines`],
    enabled: !!batchId,
  });

  // Helper function to get all lines as flat array
  const getAllLines = (): InvoiceLine[] => {
    if (!groupedLines) return [];
    const lines: InvoiceLine[] = [];
    Object.values(groupedLines).forEach(clientData => {
      Object.values(clientData.projects).forEach(projectData => {
        lines.push(...projectData.lines);
      });
    });
    return lines;
  };

  // Edit Line Mutation
  const editLineMutation = useMutation({
    mutationFn: async (data: {
      lineId: string;
      quantity?: number;
      rate?: number;
      billedAmount: number;
      description?: string;
      adjustmentReason: string;
    }) => {
      const { lineId, ...body } = data;
      return await apiRequest(`/api/invoice-lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Success",
        description: "Invoice line updated successfully" 
      });
      setShowEditDialog(false);
      setEditingLine(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update invoice line",
        variant: "destructive" 
      });
    }
  });

  // Bulk Edit Mutation
  const bulkEditMutation = useMutation({
    mutationFn: async (data: {
      adjustmentType: string;
      adjustmentValue: number;
      adjustmentMode: string;
      adjustmentReason: string;
    }) => {
      const lines = getAllLines().filter(line => selectedLines.has(line.id));
      const updates: Array<{id: string; billedAmount: number; adjustmentReason: string}> = [];

      lines.forEach(line => {
        const originalAmount = parseFloat(line.billedAmount || line.amount);
        let newAmount = originalAmount;

        switch (data.adjustmentType) {
          case "percentage":
            const percentChange = (originalAmount * data.adjustmentValue) / 100;
            const multiplier = data.adjustmentMode === "discount" ? -1 : 1;
            newAmount = originalAmount + (percentChange * multiplier);
            break;
          case "fixed_amount":
            const amountMultiplier = data.adjustmentMode === "discount" ? -1 : 1;
            newAmount = originalAmount + (data.adjustmentValue * amountMultiplier);
            break;
          case "fixed_rate":
            if (line.quantity && line.type !== "expense" && line.type !== "milestone") {
              const qty = parseFloat(line.quantity);
              newAmount = qty * data.adjustmentValue;
            }
            break;
        }

        updates.push({
          id: line.id,
          billedAmount: Math.max(0, newAmount),
          adjustmentReason: data.adjustmentReason
        });
      });

      return await apiRequest(`/api/invoice-batches/${batchId}/bulk-update`, {
        method: 'POST',
        body: JSON.stringify({ updates })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Success",
        description: `${selectedLines.size} lines updated successfully` 
      });
      setShowBulkEditDialog(false);
      setSelectedLines(new Set());
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update invoice lines",
        variant: "destructive" 
      });
    }
  });

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // Selection handlers
  const toggleLineSelection = (lineId: string) => {
    setSelectedLines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lineId)) {
        newSet.delete(lineId);
      } else {
        newSet.add(lineId);
      }
      return newSet;
    });
  };

  const selectAllInProject = (projectLines: InvoiceLine[]) => {
    const lineIds = projectLines.map(l => l.id);
    const allSelected = lineIds.every(id => selectedLines.has(id));
    
    setSelectedLines(prev => {
      const newSet = new Set(prev);
      lineIds.forEach(id => {
        if (allSelected) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      });
      return newSet;
    });
  };

  const selectAllLines = () => {
    const allLines = getAllLines();
    const allSelected = allLines.every(line => selectedLines.has(line.id));
    
    if (allSelected) {
      setSelectedLines(new Set());
    } else {
      setSelectedLines(new Set(allLines.map(l => l.id)));
    }
  };

  // Edit handlers
  const handleEditLine = (line: InvoiceLine) => {
    if (canEditLines()) {
      setEditingLine(line);
      setShowEditDialog(true);
    }
  };

  const handleBulkEdit = () => {
    if (selectedLines.size === 0) {
      toast({
        title: "No lines selected",
        description: "Please select lines to edit",
        variant: "destructive"
      });
      return;
    }
    setShowBulkEditDialog(true);
  };

  const expandAll = () => {
    if (groupedLines) {
      const allClients = new Set(Object.keys(groupedLines));
      const allProjects = new Set<string>();
      Object.values(groupedLines).forEach(clientData => {
        Object.keys(clientData.projects).forEach(projectId => {
          allProjects.add(projectId);
        });
      });
      setExpandedClients(allClients);
      setExpandedProjects(allProjects);
    }
  };

  const collapseAll = () => {
    setExpandedClients(new Set());
    setExpandedProjects(new Set());
  };

  const handleExportCSV = async () => {
    if (!groupedLines || !batchDetails) return;

    let csv = "Client,Project,Type,Description,Quantity,Rate,Amount\n";
    
    Object.values(groupedLines).forEach(clientData => {
      Object.values(clientData.projects).forEach(projectData => {
        projectData.lines.forEach(line => {
          csv += `"${line.client.name}","${line.project.name}","${line.type}","${line.description || ''}","${line.quantity || ''}","${line.rate || ''}","${line.amount}"\n`;
        });
      });
    });

    // Create blob and download
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-batch-${batchId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Invoice batch details have been exported to CSV.",
    });
  };

  // Finalization mutations
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/invoice-batches/${batchId}/finalize`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches", batchId] });
      toast({
        title: "Batch finalized",
        description: "The invoice batch has been finalized and locked.",
      });
      setShowFinalizeDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize batch",
        variant: "destructive",
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (notes?: string) => {
      return apiRequest(`/api/invoice-batches/${batchId}/review`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches", batchId] });
      toast({
        title: "Batch reviewed",
        description: "The batch has been marked as reviewed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to review batch",
        variant: "destructive",
      });
    },
  });

  const unfinalizeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/invoice-batches/${batchId}/unfinalize`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches", batchId] });
      toast({
        title: "Batch reverted",
        description: "The batch has been reverted to draft status.",
      });
      setShowUnfinalizeDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unfinalize batch",
        variant: "destructive",
      });
    },
  });

  const handleFinalizeBatch = async () => {
    setShowFinalizeDialog(true);
  };

  const handleUnfinalizeBatch = async () => {
    setShowUnfinalizeDialog(true);
  };

  const handleReviewBatch = async () => {
    reviewMutation.mutate(undefined);
  };

  const calculateGrandTotal = () => {
    if (!groupedLines) return 0;
    return Object.values(groupedLines).reduce((total, client) => total + client.subtotal, 0);
  };

  const getStatusBadge = () => {
    if (!batchDetails) return null;
    
    if (batchDetails.exportedToQBO) {
      return (
        <Badge variant="default" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">
          <CheckCircle className="mr-1 h-3 w-3" />
          Exported
        </Badge>
      );
    }
    
    switch (batchDetails.status) {
      case 'finalized':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <Lock className="mr-1 h-3 w-3" />
            Finalized
          </Badge>
        );
      case 'reviewed':
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            <FileText className="mr-1 h-3 w-3" />
            Reviewed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <FileText className="mr-1 h-3 w-3" />
            Draft
          </Badge>
        );
    }
  };

  const canFinalize = () => {
    if (!batchDetails || !groupedLines) return false;
    return (batchDetails.status === 'draft' || batchDetails.status === 'reviewed') && 
           Object.keys(groupedLines).length > 0 &&
           !batchDetails.exportedToQBO;
  };

  const canReview = () => {
    if (!batchDetails) return false;
    return batchDetails.status === 'draft' && !batchDetails.exportedToQBO;
  };

  const canUnfinalize = () => {
    if (!batchDetails || !user) return false;
    return batchDetails.status === 'finalized' && 
           !batchDetails.exportedToQBO &&
           user.role === 'admin';
  };

  const canEditLines = () => {
    if (!batchDetails || !user) return false;
    return batchDetails.status !== 'finalized' && 
           !batchDetails.exportedToQBO &&
           (user.role === 'admin' || user.role === 'billing-admin');
  };

  const getVarianceIcon = (variance: number) => {
    if (variance > 0) {
      return <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />;
    } else if (variance < 0) {
      return <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />;
    }
    return null;
  };

  if (isLoadingDetails || isLoadingLines) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <div className="mb-6">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="grid gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (detailsError || linesError || !batchDetails) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400">
              {detailsError?.toString() || linesError?.toString() || "Failed to load batch details"}
            </p>
            <Button
              onClick={() => navigate("/billing")}
              variant="outline"
              className="mt-4"
              data-testid="button-back-to-billing"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Billing
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const grandTotal = calculateGrandTotal();
  const discountAmount = parseFloat(batchDetails.discountAmount || "0");
  const netTotal = grandTotal - discountAmount;

  return (
    <Layout>
      <div className="container mx-auto py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-batch-id">
              Invoice Batch: {batchId}
            </h1>
            <p className="text-muted-foreground mt-1">
              Review invoice details and line items
            </p>
          </div>
          <Button
            onClick={() => navigate("/billing")}
            variant="outline"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Billing
          </Button>
        </div>

        {/* Actions Bar */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            data-testid="button-export-csv"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          
          {canEditLines() && selectedLines.size > 0 && (
            <>
              <Button
                onClick={handleBulkEdit}
                variant="outline"
                data-testid="button-bulk-edit"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit {selectedLines.size} Selected
              </Button>
              <Button
                onClick={() => setSelectedLines(new Set())}
                variant="ghost"
                size="sm"
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
            </>
          )}
          {canEditLines() && (
            <>
              <Button
                onClick={() => setShowAggregateAdjustmentDialog(true)}
                variant="outline"
                data-testid="button-aggregate-adjustment"
              >
                <Calculator className="mr-2 h-4 w-4" />
                Apply Contract Adjustment
              </Button>
              <Button
                onClick={() => setShowAdjustmentHistory(!showAdjustmentHistory)}
                variant="outline"
                data-testid="button-adjustment-history"
              >
                <History className="mr-2 h-4 w-4" />
                {showAdjustmentHistory ? "Hide" : "View"} History
              </Button>
            </>
          )}
          {canReview() && (
            <Button
              onClick={handleReviewBatch}
              variant="outline"
              disabled={reviewMutation.isPending}
              data-testid="button-review"
            >
              <FileText className="mr-2 h-4 w-4" />
              Mark as Reviewed
            </Button>
          )}
          {canFinalize() && (
            <Button
              onClick={handleFinalizeBatch}
              variant="default"
              disabled={finalizeMutation.isPending}
              data-testid="button-finalize"
            >
              <Lock className="mr-2 h-4 w-4" />
              Finalize Invoice
            </Button>
          )}
          {canUnfinalize() && (
            <Button
              onClick={handleUnfinalizeBatch}
              variant="destructive"
              disabled={unfinalizeMutation.isPending}
              data-testid="button-unfinalize"
            >
              <FileText className="mr-2 h-4 w-4" />
              Revert to Draft
            </Button>
          )}
          {batchDetails.status === 'finalized' && batchDetails.exportedToQBO && (
            <Badge variant="outline" className="px-3 py-2">
              <CheckCircle className="mr-2 h-4 w-4" />
              Exported to QuickBooks
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              onClick={expandAll}
              variant="ghost"
              size="sm"
              data-testid="button-expand-all"
            >
              Expand All
            </Button>
            <Button
              onClick={collapseAll}
              variant="ghost"
              size="sm"
              data-testid="button-collapse-all"
            >
              Collapse All
            </Button>
          </div>
        </div>

        {/* Adjustment History (conditionally shown) */}
        {showAdjustmentHistory && (
          <div className="mb-6">
            <AdjustmentHistory 
              batchId={batchId || ''} 
              canReverse={canEditLines() && batchDetails?.status !== 'finalized'}
              onReverse={(adjustmentId) => {
                // TODO: Implement adjustment reversal
                console.log('Reversing adjustment:', adjustmentId);
              }}
            />
          </div>
        )}

        {/* Batch Summary Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Batch Summary</CardTitle>
              {getStatusBadge()}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="mr-1 h-3 w-3" />
                  Date Range
                </div>
                <p className="font-medium" data-testid="text-date-range">
                  {format(new Date(batchDetails.startDate), "MMM d, yyyy")} - {format(new Date(batchDetails.endDate), "MMM d, yyyy")}
                </p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Building className="mr-1 h-3 w-3" />
                  Clients
                </div>
                <p className="font-medium" data-testid="text-client-count">{batchDetails.clientCount}</p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <FolderOpen className="mr-1 h-3 w-3" />
                  Projects
                </div>
                <p className="font-medium" data-testid="text-project-count">{batchDetails.projectCount}</p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <FileText className="mr-1 h-3 w-3" />
                  Line Items
                </div>
                <p className="font-medium" data-testid="text-line-count">{batchDetails.totalLinesCount}</p>
              </div>
            </div>
            
            {/* Finalization Info */}
            {batchDetails.status === 'finalized' && batchDetails.finalizedAt && (
              <>
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Finalized By</div>
                    <p className="font-medium" data-testid="text-finalized-by">
                      {batchDetails.finalizer?.name || 'System'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Finalized At</div>
                    <p className="font-medium" data-testid="text-finalized-at">
                      {format(new Date(batchDetails.finalizedAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>
              </>
            )}
            
            {/* Review Notes */}
            {batchDetails.notes && (
              <>
                <Separator className="my-4" />
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Review Notes</div>
                  <p className="text-sm" data-testid="text-review-notes">{batchDetails.notes}</p>
                </div>
              </>
            )}

            <Separator className="my-4" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <DollarSign className="mr-1 h-3 w-3" />
                  Subtotal
                </div>
                <p className="text-xl font-semibold" data-testid="text-subtotal">
                  ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              
              {discountAmount > 0 && (
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Discount</div>
                  <p className="text-xl font-semibold text-red-600 dark:text-red-400" data-testid="text-discount">
                    -${discountAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Net Total</div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-net-total">
                  ${netTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {batchDetails.exportedAt && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Exported on {format(new Date(batchDetails.exportedAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoice Lines */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Invoice Lines
                {canEditLines() && selectedLines.size > 0 && (
                  <Badge variant="secondary">
                    {selectedLines.size} selected
                  </Badge>
                )}
              </CardTitle>
              {canEditLines() && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllLines}
                    data-testid="button-select-all-lines"
                  >
                    {getAllLines().every(line => selectedLines.has(line.id)) ? (
                      <><MinusSquare className="mr-2 h-4 w-4" /> Deselect All</>
                    ) : (
                      <><CheckSquare className="mr-2 h-4 w-4" /> Select All</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {groupedLines && Object.keys(groupedLines).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupedLines).map(([clientId, clientData]) => (
                  <div key={clientId} className="border rounded-lg">
                    <Collapsible
                      open={expandedClients.has(clientId)}
                      onOpenChange={() => toggleClient(clientId)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer">
                          <div className="flex items-center gap-2">
                            {expandedClients.has(clientId) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold" data-testid={`text-client-${clientId}`}>
                              {clientData.client.name}
                            </span>
                            <Badge variant="outline" className="ml-2">
                              {Object.keys(clientData.projects).length} project(s)
                            </Badge>
                          </div>
                          <span className="font-semibold" data-testid={`text-client-total-${clientId}`}>
                            ${clientData.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-4 pb-4">
                          {Object.entries(clientData.projects).map(([projectId, projectData]) => (
                            <div key={projectId} className="mt-2 border rounded">
                              <Collapsible
                                open={expandedProjects.has(projectId)}
                                onOpenChange={() => toggleProject(projectId)}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer">
                                    <div className="flex items-center gap-2">
                                      {expandedProjects.has(projectId) ? (
                                        <ChevronDown className="h-3 w-3" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3" />
                                      )}
                                      <FolderOpen className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-sm font-medium" data-testid={`text-project-${projectId}`}>
                                        {projectData.project.name} ({projectData.project.code})
                                      </span>
                                      <Badge variant="secondary" className="ml-2 text-xs">
                                        {projectData.lines.length} item(s)
                                      </Badge>
                                    </div>
                                    <span className="text-sm font-medium" data-testid={`text-project-total-${projectId}`}>
                                      ${projectData.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </CollapsibleTrigger>
                                
                                <CollapsibleContent>
                                  <div className="px-3 pb-3">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          {canEditLines() && (
                                            <TableHead className="w-12">
                                              <Checkbox
                                                checked={projectData.lines.every(l => selectedLines.has(l.id))}
                                                onCheckedChange={() => selectAllInProject(projectData.lines)}
                                                data-testid={`checkbox-select-all-project-${projectId}`}
                                              />
                                            </TableHead>
                                          )}
                                          <TableHead>Type</TableHead>
                                          <TableHead>Description</TableHead>
                                          <TableHead className="text-right">Quantity</TableHead>
                                          <TableHead className="text-right">Rate</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                          <TableHead className="text-right">Billed</TableHead>
                                          <TableHead className="text-right">Variance</TableHead>
                                          {canEditLines() && <TableHead className="w-12"></TableHead>}
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {projectData.lines.map((line) => {
                                          const originalAmount = parseFloat(line.originalAmount || line.amount);
                                          const billedAmount = parseFloat(line.billedAmount || line.amount);
                                          const variance = billedAmount - originalAmount;
                                          const hasVariance = Math.abs(variance) > 0.01;
                                          const isEdited = line.editedAt && line.editedBy;

                                          return (
                                            <TableRow key={line.id} data-testid={`row-line-${line.id}`} className={isEdited ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}>
                                              {canEditLines() && (
                                                <TableCell>
                                                  <Checkbox
                                                    checked={selectedLines.has(line.id)}
                                                    onCheckedChange={() => toggleLineSelection(line.id)}
                                                    data-testid={`checkbox-line-${line.id}`}
                                                  />
                                                </TableCell>
                                              )}
                                              <TableCell>
                                                <div className="flex items-center gap-2">
                                                  <Badge variant={line.type === "time" ? "default" : "secondary"}>
                                                    {line.type}
                                                  </Badge>
                                                  {isEdited && (
                                                    <TooltipProvider>
                                                      <Tooltip>
                                                        <TooltipTrigger>
                                                          <History className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                          <div className="text-sm">
                                                            <p className="font-medium">Edited by {line.editedBy?.name || 'Unknown'}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                              {line.editedAt ? format(new Date(line.editedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                                                            </p>
                                                            {line.adjustmentReason && (
                                                              <p className="mt-1 italic">"{line.adjustmentReason}"</p>
                                                            )}
                                                          </div>
                                                        </TooltipContent>
                                                      </Tooltip>
                                                    </TooltipProvider>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell className="max-w-md">
                                                <div className="truncate">
                                                  {line.description || "-"}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div>
                                                  {line.quantity ? parseFloat(line.quantity).toFixed(2) : "-"}
                                                  {line.originalQuantity && line.quantity !== line.originalQuantity && (
                                                    <div className="text-xs text-muted-foreground line-through">
                                                      {parseFloat(line.originalQuantity).toFixed(2)}
                                                    </div>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div>
                                                  {line.rate ? `$${parseFloat(line.rate).toFixed(2)}` : "-"}
                                                  {line.originalRate && line.rate !== line.originalRate && (
                                                    <div className="text-xs text-muted-foreground line-through">
                                                      ${parseFloat(line.originalRate).toFixed(2)}
                                                    </div>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div className="text-muted-foreground">
                                                  ${originalAmount.toFixed(2)}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right font-medium">
                                                ${billedAmount.toFixed(2)}
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {hasVariance && (
                                                  <div className={`flex items-center justify-end gap-1 font-medium ${
                                                    variance > 0 
                                                      ? "text-green-600 dark:text-green-400" 
                                                      : "text-red-600 dark:text-red-400"
                                                  }`}>
                                                    {getVarianceIcon(variance)}
                                                    <span data-testid={`text-variance-${line.id}`}>
                                                      {variance > 0 ? "+" : ""}${variance.toFixed(2)}
                                                    </span>
                                                  </div>
                                                )}
                                                {!hasVariance && "-"}
                                              </TableCell>
                                              {canEditLines() && (
                                                <TableCell>
                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        data-testid={`button-edit-line-${line.id}`}
                                                      >
                                                        <MoreVertical className="h-4 w-4" />
                                                      </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                      <DropdownMenuItem
                                                        onClick={() => handleEditLine(line)}
                                                      >
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Edit Line
                                                      </DropdownMenuItem>
                                                      {hasVariance && (
                                                        <DropdownMenuItem
                                                          onClick={() => {
                                                            // Reset line to original values
                                                            editLineMutation.mutate({
                                                              lineId: line.id,
                                                              billedAmount: originalAmount,
                                                              adjustmentReason: "Reset to original amount"
                                                            });
                                                          }}
                                                        >
                                                          <History className="mr-2 h-4 w-4" />
                                                          Reset to Original
                                                        </DropdownMenuItem>
                                                      )}
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                </TableCell>
                                              )}
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No invoice lines found for this batch.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Finalize Confirmation Dialog */}
      <AlertDialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize Invoice Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will lock the batch and all associated time entries. 
              Once finalized, the invoice lines cannot be edited.
              {batchDetails.status === 'draft' && (
                <div className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                  Note: This batch has not been reviewed yet. Consider marking it as reviewed first.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => finalizeMutation.mutate()}>
              Finalize Batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Unfinalize Confirmation Dialog */}
      <AlertDialog open={showUnfinalizeDialog} onOpenChange={setShowUnfinalizeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlock the batch and allow editing of invoice lines and time entries again.
              This action should only be used for corrections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => unfinalizeMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revert to Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Line Edit Dialog */}
      {editingLine && (
        <InvoiceLineEditDialog
          open={showEditDialog}
          onClose={() => {
            setShowEditDialog(false);
            setEditingLine(null);
          }}
          line={editingLine}
          onSave={(data) => editLineMutation.mutate(data)}
          isSaving={editLineMutation.isPending}
        />
      )}

      {/* Bulk Edit Dialog */}
      {showBulkEditDialog && (
        <InvoiceLineBulkEditDialog
          open={showBulkEditDialog}
          onClose={() => setShowBulkEditDialog(false)}
          selectedLines={getAllLines().filter(line => selectedLines.has(line.id))}
          onApply={(data) => bulkEditMutation.mutate(data)}
          isApplying={bulkEditMutation.isPending}
        />
      )}

      {/* Aggregate Adjustment Dialog */}
      {showAggregateAdjustmentDialog && (
        <AggregateAdjustmentDialog
          open={showAggregateAdjustmentDialog}
          onOpenChange={setShowAggregateAdjustmentDialog}
          batchId={batchId || ''}
          currentTotal={parseFloat(batchDetails?.totalAmount || '0')}
          lineCount={batchDetails?.totalLinesCount || 0}
          lines={getAllLines()}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
            queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
          }}
        />
      )}
    </Layout>
  );
}