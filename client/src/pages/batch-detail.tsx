import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
import { formatBusinessDate, formatTimestamp } from "@/lib/date-utils";
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
  Undo,
  Milestone,
  Target,
  Trash2,
  User as UserIcon,
  ExternalLink
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { InvoiceLineEditDialog } from "@/components/billing/invoice-line-edit-dialog";
import { InvoiceLineBulkEditDialog } from "@/components/billing/invoice-line-bulk-edit-dialog";
import { AggregateAdjustmentDialog } from "@/components/billing/aggregate-adjustment-dialog";
import { AdjustmentHistory } from "@/components/billing/adjustment-history";
import { ProjectMilestonesDialog } from "@/components/billing/project-milestones-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  paymentTerms?: string | null;
  finalizer?: { id: string; name: string; email: string } | null;
  creator?: { id: string; name: string; email: string } | null;
  asOfDate?: string | null;
  asOfDateUpdatedBy?: string | null;
  asOfDateUpdatedAt?: string | null;
  paymentMilestone?: { id: string; name: string; amount: string; status: string; projectId: string; projectName: string } | null;
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
  projectMilestoneId?: string;
  milestone?: {
    id: string;
    name: string;
    status: 'not-started' | 'in-progress' | 'completed';
    targetAmount?: string;
  };
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
  const [showDeleteBatchDialog, setShowDeleteBatchDialog] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAggregateAdjustmentDialog, setShowAggregateAdjustmentDialog] = useState(false);
  const [showAdjustmentHistory, setShowAdjustmentHistory] = useState(false);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [selectedProjectForMilestone, setSelectedProjectForMilestone] = useState<string | null>(null);
  const [selectedLineForMilestone, setSelectedLineForMilestone] = useState<InvoiceLine | null>(null);
  const [useCustomPaymentTerms, setUseCustomPaymentTerms] = useState(false);
  const [customPaymentTerms, setCustomPaymentTerms] = useState("");
  const [isEditingPaymentTerms, setIsEditingPaymentTerms] = useState(false);
  const [isEditingAsOfDate, setIsEditingAsOfDate] = useState(false);
  const [newAsOfDate, setNewAsOfDate] = useState("");
  
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

  // Fetch default payment terms from system settings
  const { data: defaultPaymentTerms } = useQuery<string>({
    queryKey: ['/api/system-settings/PAYMENT_TERMS'],
    queryFn: async () => {
      const response = await fetch('/api/system-settings/PAYMENT_TERMS');
      if (!response.ok) {
        // Return default if not found
        return 'Payment due within 30 days';
      }
      const data = await response.json();
      return data.value || 'Payment due within 30 days';
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
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

  // Milestone Mapping Mutation
  const mapToMilestoneMutation = useMutation({
    mutationFn: async ({ lineId, milestoneId }: { 
      lineId: string; 
      milestoneId: string | null 
    }) => {
      return await apiRequest(`/api/invoice-lines/${lineId}/milestone`, {
        method: 'POST',
        body: JSON.stringify({ milestoneId })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Success",
        description: selectedLineForMilestone?.milestone 
          ? "Milestone mapping updated" 
          : "Line mapped to milestone"
      });
      setSelectedLineForMilestone(null);
      setSelectedProjectForMilestone(null);
      setShowMilestoneDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to map line to milestone",
        variant: "destructive" 
      });
    }
  });

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

  // Payment Terms Update Mutation
  const updatePaymentTermsMutation = useMutation({
    mutationFn: async (paymentTerms: string | null) => {
      return await apiRequest(`/api/invoice-batches/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentTerms })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Success",
        description: "Payment terms updated successfully" 
      });
      setIsEditingPaymentTerms(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update payment terms",
        variant: "destructive" 
      });
    }
  });

  // As-Of Date Update Mutation
  const updateAsOfDateMutation = useMutation({
    mutationFn: async (asOfDate: string) => {
      return await apiRequest(`/api/invoice-batches/${batchId}/as-of-date`, {
        method: 'PATCH',
        body: JSON.stringify({ asOfDate })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Success",
        description: "As-of date updated successfully" 
      });
      setIsEditingAsOfDate(false);
      setNewAsOfDate("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update as-of date",
        variant: "destructive" 
      });
    }
  });

  // Export to QuickBooks Mutation
  const exportToQBOMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return await apiRequest(`/api/invoice-batches/${batchId}/export`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      toast({
        title: "Export successful",
        description: "Invoice batch has been exported to QuickBooks Online.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export to QuickBooks Online.",
        variant: "destructive",
      });
    }
  });

  // Helper function for exporting to QuickBooks
  const handleExportToQBO = async () => {
    if (!batchDetails?.id) return;
    exportToQBOMutation.mutate(batchDetails.id);
  };

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
        const originalAmount = parseFloat(line.billedAmount || line.amount || '0') || 0;
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

  const [isPDFGenerating, setIsPDFGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    if (!batchId) return;
    
    try {
      setIsPDFGenerating(true);
      
      // Show loading message
      toast({
        title: "Generating PDF",
        description: "Please wait, this may take a few seconds...",
      });
      
      // Get session ID from localStorage for authenticated request
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        toast({
          title: "Authentication required",
          description: "Please log in to download PDFs.",
          variant: "destructive"
        });
        setIsPDFGenerating(false);
        return;
      }

      // Make authenticated request to PDF endpoint
      const response = await fetch(`/api/invoice-batches/${batchId}/pdf`, {
        method: 'GET',
        headers: {
          'X-Session-Id': sessionId,
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast({
            title: "Authentication failed",
            description: "Session expired. Please log in again.",
            variant: "destructive"
          });
          setIsPDFGenerating(false);
          return;
        }
        
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      // Get the PDF blob
      const pdfBlob = await response.blob();
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${batchId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "PDF download complete",
        description: "The invoice PDF has been downloaded.",
      });
    } catch (error: any) {
      console.error("PDF download error:", error);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsPDFGenerating(false);
    }
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
      
      // If this batch is linked to a payment milestone, invalidate milestone caches
      if (batchDetails?.paymentMilestone) {
        queryClient.invalidateQueries({ queryKey: ['/api/payment-milestones/all'] });
        if (batchDetails.paymentMilestone.projectId) {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${batchDetails.paymentMilestone.projectId}/payment-milestones`] });
        }
      }
      
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

  // Remove Adjustment Mutation
  const removeAdjustmentMutation = useMutation({
    mutationFn: async (adjustmentId: string) => {
      return await apiRequest(`/api/invoice-adjustments/${adjustmentId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      // Refresh the invoice lines and adjustments
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/adjustments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/adjustments/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Adjustment reversed",
        description: "The adjustment has been removed and amounts have been restored to original values"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reverse adjustment",
        description: error.message || "Could not reverse the adjustment",
        variant: "destructive"
      });
    }
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/invoice-batches/${batchId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Batch deleted",
        description: "The invoice batch has been successfully deleted"
      });
      // Navigate back to billing page
      navigate('/billing');
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete batch",
        description: error.message || "Could not delete the batch",
        variant: "destructive"
      });
    }
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

  const handleSaveAsOfDate = () => {
    if (!newAsOfDate) {
      toast({
        title: "Invalid date",
        description: "Please enter a valid as-of date",
        variant: "destructive"
      });
      return;
    }
    updateAsOfDateMutation.mutate(newAsOfDate);
  };

  const handleCancelAsOfDateEdit = () => {
    setIsEditingAsOfDate(false);
    setNewAsOfDate("");
  };

  const handleStartAsOfDateEdit = () => {
    setIsEditingAsOfDate(true);
    // Pre-populate with current as-of date or finalized date (business date format)
    setNewAsOfDate(batchDetails?.asOfDate || (batchDetails?.finalizedAt ? batchDetails.finalizedAt.split('T')[0] : ""));
  };

  const handleDeleteBatch = () => {
    const confirmMessage = `Are you sure you want to delete batch ${batchId}?\n\nThis will permanently remove:\n• All invoice lines\n• All adjustments\n• The batch itself\n\nThis action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
      // Double confirmation for safety
      const secondConfirm = prompt(`To confirm deletion, type the batch ID: ${batchId}`);
      
      if (secondConfirm === batchId) {
        deleteBatchMutation.mutate();
      } else if (secondConfirm !== null) {
        toast({
          title: "Deletion cancelled",
          description: "Batch ID did not match",
          variant: "destructive"
        });
      }
    }
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
          
          {/* QuickBooks CSV Export - only for admins/billing-admins, enabled when finalized */}
          {['admin', 'billing-admin'].includes(user?.role || '') && (
            <Button
              onClick={async () => {
                if (!batchId) return;
                
                try {
                  // Get session ID from localStorage for authenticated request
                  const sessionId = localStorage.getItem('sessionId');
                  
                  if (!sessionId) {
                    toast({
                      title: "Authentication required",
                      description: "Please log in to export to QuickBooks CSV",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  const response = await fetch(`/api/invoice-batches/${batchId}/export-qbo-csv`, {
                    credentials: 'include',
                    headers: {
                      'X-Session-Id': sessionId
                    }
                  });
                  
                  if (!response.ok) {
                    let errorMessage = 'Failed to export to QuickBooks CSV';
                    
                    // Try to parse JSON error, fallback to text
                    try {
                      const errorData = await response.json();
                      errorMessage = errorData.message || errorMessage;
                    } catch {
                      const errorText = await response.text();
                      if (errorText) errorMessage = errorText;
                    }
                    
                    // Special handling for auth errors
                    if (response.status === 401 || response.status === 403) {
                      errorMessage = 'Authentication required. Please log in again.';
                    }
                    
                    throw new Error(errorMessage);
                  }
                  
                  // Download the CSV file
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `invoice-${batchId}-qbo.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                  
                  toast({
                    title: "Export successful",
                    description: "QuickBooks CSV has been downloaded.",
                  });
                } catch (error: any) {
                  toast({
                    title: "Export failed",
                    description: error.message || "Failed to export to QuickBooks CSV",
                    variant: "destructive"
                  });
                }
              }}
              variant="outline"
              disabled={batchDetails?.status !== 'finalized'}
              data-testid="button-export-qbo-csv"
            >
              <Download className="mr-2 h-4 w-4" />
              Export to QuickBooks CSV
            </Button>
          )}
          
          <Button
            onClick={handleDownloadPDF}
            variant="outline"
            disabled={isPDFGenerating}
            data-testid="button-download-pdf"
          >
            <FileText className="mr-2 h-4 w-4" />
            {isPDFGenerating ? "Generating PDF..." : "Download PDF"}
          </Button>
          
          <Button
            onClick={() => window.open(`/api/invoice-batches/${batchId}/pdf/view`, '_blank')}
            variant="outline"
            data-testid="button-view-pdf-sharepoint"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View PDF (SharePoint)
          </Button>

          {batchDetails?.status === 'finalized' && (
            <Button
              onClick={handleExportToQBO}
              variant="outline"
              disabled={batchDetails.exportedToQBO || exportToQBOMutation.isPending}
              data-testid="button-export-qbo"
            >
              {batchDetails.exportedToQBO ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Exported to QBO
                </>
              ) : (
                <>
                  <Building className="mr-2 h-4 w-4" />
                  {exportToQBOMutation.isPending ? 'Exporting...' : 'Export to QBO'}
                </>
              )}
            </Button>
          )}
          
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
          
          {canEditLines() && batchDetails?.status !== 'finalized' && (
            <Button
              onClick={handleDeleteBatch}
              variant="destructive"
              disabled={deleteBatchMutation.isPending}
              data-testid="button-delete-batch"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteBatchMutation.isPending ? 'Deleting...' : 'Delete Batch'}
            </Button>
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
                if (confirm('Are you sure you want to reverse this adjustment? Invoice amounts will be restored to their original values.')) {
                  removeAdjustmentMutation.mutate(adjustmentId);
                }
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="mr-1 h-3 w-3" />
                  Date Range
                </div>
                <p className="font-medium" data-testid="text-date-range">
                  {formatBusinessDate(batchDetails.startDate)} - {formatBusinessDate(batchDetails.endDate)}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="mr-1 h-3 w-3" />
                    As Of Date
                  </div>
                  {user?.role === 'admin' && !isEditingAsOfDate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleStartAsOfDateEdit}
                      data-testid="button-edit-as-of-date"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {isEditingAsOfDate ? (
                  <div className="space-y-2">
                    <Input
                      type="date"
                      value={newAsOfDate}
                      onChange={(e) => setNewAsOfDate(e.target.value)}
                      data-testid="input-as-of-date"
                      className="text-sm"
                    />
                    <div className="flex space-x-1">
                      <Button
                        size="sm"
                        onClick={handleSaveAsOfDate}
                        disabled={updateAsOfDateMutation.isPending}
                        data-testid="button-save-as-of-date"
                      >
                        {updateAsOfDateMutation.isPending ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelAsOfDateEdit}
                        data-testid="button-cancel-as-of-date"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="font-medium" data-testid="text-as-of-date">
                    {batchDetails.asOfDate 
                      ? formatBusinessDate(batchDetails.asOfDate)
                      : formatTimestamp(batchDetails.createdAt, "MMM d, yyyy")}
                  </p>
                )}
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
              
              <div className="space-y-1">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="mr-1 h-3 w-3" />
                  Created Date
                </div>
                <p className="font-medium" data-testid="text-created-date">
                  {formatTimestamp(batchDetails.createdAt, "MMM d, yyyy")}
                </p>
              </div>
            </div>

            {/* Creator Row */}
            <Separator className="my-4" />
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <UserIcon className="mr-1 h-3 w-3" />
                Created By
              </div>
              <p className="font-medium" data-testid="text-created-by">
                {batchDetails.creator?.name || 'System'}
              </p>
            </div>
            
            {/* Payment Milestone Info */}
            {batchDetails.paymentMilestone && (
              <>
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Target className="mr-1 h-3 w-3" />
                      Payment Milestone
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium" data-testid="text-milestone-name">
                        {batchDetails.paymentMilestone.name}
                      </p>
                      <Badge 
                        variant={batchDetails.paymentMilestone.status === 'invoiced' ? 'default' : batchDetails.paymentMilestone.status === 'planned' ? 'secondary' : 'destructive'}
                        data-testid="badge-milestone-status"
                      >
                        {batchDetails.paymentMilestone.status === 'invoiced' ? 'Invoiced' : batchDetails.paymentMilestone.status === 'planned' ? 'Planned' : 'Canceled'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <FolderOpen className="mr-1 h-3 w-3" />
                      Project
                    </div>
                    <Link 
                      href={`/projects/${batchDetails.paymentMilestone.projectId}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400" 
                      data-testid="link-milestone-project"
                    >
                      {batchDetails.paymentMilestone.projectName}
                    </Link>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <DollarSign className="mr-1 h-3 w-3" />
                      Target Amount
                    </div>
                    <p className="font-medium" data-testid="text-milestone-amount">
                      ${Number(batchDetails.paymentMilestone.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </>
            )}
            
            {/* Finalization Info */}
            {batchDetails.status === 'finalized' && batchDetails.finalizedAt && (
              <>
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">As Of Date</div>
                      {user?.role === 'admin' && !isEditingAsOfDate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleStartAsOfDateEdit}
                          data-testid="button-edit-as-of-date"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {isEditingAsOfDate ? (
                      <div className="space-y-2">
                        <Input
                          type="date"
                          value={newAsOfDate}
                          onChange={(e) => setNewAsOfDate(e.target.value)}
                          data-testid="input-as-of-date"
                        />
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={handleSaveAsOfDate}
                            disabled={updateAsOfDateMutation.isPending}
                            data-testid="button-save-as-of-date"
                          >
                            {updateAsOfDateMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelAsOfDateEdit}
                            data-testid="button-cancel-as-of-date"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="font-medium" data-testid="text-as-of-date">
                        {batchDetails.asOfDate 
                          ? formatBusinessDate(batchDetails.asOfDate)
                          : formatTimestamp(batchDetails.finalizedAt, "MMM d, yyyy")}
                      </p>
                    )}
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

            {/* Payment Terms Display */}
            <Separator className="my-4" />
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Payment Terms</div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium" data-testid="text-payment-terms">
                  {batchDetails.paymentTerms || defaultPaymentTerms || 'Payment due within 30 days'}
                </p>
                {batchDetails.paymentTerms && (
                  <Badge variant="secondary" className="text-xs">
                    Custom
                  </Badge>
                )}
                {!batchDetails.paymentTerms && (
                  <Badge variant="outline" className="text-xs">
                    Default
                  </Badge>
                )}
              </div>
            </div>

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

        {/* Payment Terms Card - Only show if not finalized */}
        {batchDetails.status !== 'finalized' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Payment Terms</CardTitle>
              <CardDescription>
                Configure payment terms for this invoice batch
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditingPaymentTerms ? (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Current Payment Terms
                      </Label>
                      {batchDetails.paymentTerms && (
                        <Badge variant="secondary" className="text-xs">
                          Custom
                        </Badge>
                      )}
                      {!batchDetails.paymentTerms && (
                        <Badge variant="outline" className="text-xs">
                          Using Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid="text-current-payment-terms">
                      {batchDetails.paymentTerms || defaultPaymentTerms || 'Payment due within 30 days'}
                    </p>
                  </div>
                  {canEditLines() && (
                    <Button
                      onClick={() => {
                        setIsEditingPaymentTerms(true);
                        setUseCustomPaymentTerms(!!batchDetails.paymentTerms);
                        setCustomPaymentTerms(batchDetails.paymentTerms || '');
                      }}
                      variant="outline"
                      data-testid="button-edit-payment-terms"
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Payment Terms
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Switch
                      id="custom-payment-terms"
                      checked={useCustomPaymentTerms}
                      onCheckedChange={(checked) => {
                        setUseCustomPaymentTerms(checked);
                        if (!checked) {
                          setCustomPaymentTerms('');
                        }
                      }}
                      data-testid="switch-custom-payment-terms"
                    />
                    <Label htmlFor="custom-payment-terms" className="cursor-pointer">
                      Use custom payment terms for this batch
                    </Label>
                  </div>
                  
                  {useCustomPaymentTerms && (
                    <div className="space-y-2">
                      <Label htmlFor="payment-terms-input">
                        Custom Payment Terms
                      </Label>
                      <Textarea
                        id="payment-terms-input"
                        value={customPaymentTerms}
                        onChange={(e) => setCustomPaymentTerms(e.target.value)}
                        placeholder={defaultPaymentTerms || 'Payment due within 30 days'}
                        className="min-h-[80px]"
                        data-testid="textarea-payment-terms"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the payment terms that will appear on invoices for this batch.
                      </p>
                    </div>
                  )}
                  
                  {!useCustomPaymentTerms && (
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-muted-foreground">
                        This batch will use the default payment terms:
                      </p>
                      <p className="text-sm font-medium mt-1">
                        {defaultPaymentTerms || 'Payment due within 30 days'}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const newPaymentTerms = useCustomPaymentTerms ? customPaymentTerms.trim() : null;
                        updatePaymentTermsMutation.mutate(newPaymentTerms);
                      }}
                      disabled={updatePaymentTermsMutation.isPending || (useCustomPaymentTerms && !customPaymentTerms.trim())}
                      data-testid="button-save-payment-terms"
                    >
                      {updatePaymentTermsMutation.isPending ? 'Saving...' : 'Save Payment Terms'}
                    </Button>
                    <Button
                      onClick={() => {
                        setIsEditingPaymentTerms(false);
                        setUseCustomPaymentTerms(false);
                        setCustomPaymentTerms('');
                      }}
                      variant="outline"
                      disabled={updatePaymentTermsMutation.isPending}
                      data-testid="button-cancel-payment-terms"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Payment Terms Read-Only for Finalized Batches */}
        {batchDetails.status === 'finalized' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Payment Terms</CardTitle>
              <CardDescription>
                Payment terms for this finalized invoice batch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">
                    Payment Terms (Locked)
                  </Label>
                  {batchDetails.paymentTerms ? (
                    <Badge variant="secondary" className="text-xs">
                      Custom
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="text-sm" data-testid="text-finalized-payment-terms">
                  {batchDetails.paymentTerms || defaultPaymentTerms || 'Payment due within 30 days'}
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  <span>Payment terms cannot be modified for finalized batches</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Milestone Summary Section */}
        {groupedLines && (() => {
          const milestoneSummary = new Map<string, {
            milestone: { id: string; name: string; status: string; targetAmount?: string };
            lines: InvoiceLine[];
            totalAmount: number;
          }>();
          
          // Group lines by milestone
          getAllLines().forEach(line => {
            if (line.milestone) {
              const existing = milestoneSummary.get(line.milestone.id) || {
                milestone: line.milestone,
                lines: [],
                totalAmount: 0
              };
              existing.lines.push(line);
              existing.totalAmount += parseFloat(line.billedAmount || line.amount || '0') || 0;
              milestoneSummary.set(line.milestone.id, existing);
            }
          });

          const unmappedLines = getAllLines().filter(line => !line.milestone);
          const unmappedTotal = unmappedLines.reduce((sum, line) => 
            sum + parseFloat(line.billedAmount || line.amount || '0') || 0, 0
          );

          return milestoneSummary.size > 0 || unmappedLines.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Milestone Allocation Summary
                </CardTitle>
                <CardDescription>
                  Distribution of invoice lines across project milestones
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(milestoneSummary.entries()).map(([id, data]) => {
                    const percentage = (data.totalAmount / calculateGrandTotal()) * 100;
                    
                    return (
                      <div key={id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Milestone className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{data.milestone.name}</span>
                            <Badge 
                              variant={
                                data.milestone.status === 'completed' ? 'default' :
                                data.milestone.status === 'in-progress' ? 'secondary' :
                                'outline'
                              }
                              className="text-xs"
                            >
                              {data.milestone.status}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {data.lines.length} lines
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              ${data.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {percentage.toFixed(1)}% of total
                            </p>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                        {data.milestone.targetAmount && (
                          <div className="text-xs text-muted-foreground">
                            Target: ${parseFloat(data.milestone.targetAmount).toLocaleString()} 
                            ({(data.totalAmount / parseFloat(data.milestone.targetAmount) * 100).toFixed(0)}% achieved)
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {unmappedLines.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <span className="font-medium text-muted-foreground">Unmapped Lines</span>
                          <Badge variant="outline" className="text-xs">
                            {unmappedLines.length} lines
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-muted-foreground">
                            ${unmappedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {((unmappedTotal / calculateGrandTotal()) * 100).toFixed(1)}% of total
                          </p>
                        </div>
                      </div>
                      <Progress value={(unmappedTotal / calculateGrandTotal()) * 100} className="h-2 bg-yellow-100" />
                    </div>
                  )}
                </div>
                
                {milestoneSummary.size === 0 && unmappedLines.length > 0 && (
                  <div className="text-center py-6">
                    <Milestone className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">No lines mapped to milestones yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Map invoice lines to milestones for better tracking
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null;
        })()}

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
                                          <TableHead>Milestone</TableHead>
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
                                          const originalAmount = parseFloat(line.originalAmount || line.amount || '0') || 0;
                                          const billedAmount = parseFloat(line.billedAmount || line.amount || '0') || 0;
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
                                              <TableCell>
                                                {line.milestone ? (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger>
                                                        <Badge 
                                                          variant={
                                                            line.milestone.status === 'completed' ? 'default' :
                                                            line.milestone.status === 'in-progress' ? 'secondary' :
                                                            'outline'
                                                          }
                                                          className="cursor-pointer"
                                                          data-testid={`badge-milestone-${line.id}`}
                                                        >
                                                          <Milestone className="h-3 w-3 mr-1" />
                                                          {line.milestone.name}
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <div className="text-sm">
                                                          <p className="font-medium mb-1">{line.milestone.name}</p>
                                                          <p className="text-xs">Status: {line.milestone.status}</p>
                                                          {line.milestone.targetAmount && (
                                                            <p className="text-xs">Target: ${parseFloat(line.milestone.targetAmount).toLocaleString()}</p>
                                                          )}
                                                        </div>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                ) : (
                                                  <span className="text-muted-foreground text-sm">-</span>
                                                )}
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
                                                  ${originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right font-medium">
                                                ${billedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                                      {variance > 0 ? "+" : ""}${variance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                                      <DropdownMenuItem
                                                        onClick={() => {
                                                          setSelectedLineForMilestone(line);
                                                          setSelectedProjectForMilestone(line.projectId);
                                                          setShowMilestoneDialog(true);
                                                        }}
                                                      >
                                                        <Milestone className="mr-2 h-4 w-4" />
                                                        {line.milestone ? 'Change Milestone' : 'Map to Milestone'}
                                                      </DropdownMenuItem>
                                                      {line.milestone && (
                                                        <DropdownMenuItem
                                                          onClick={() => {
                                                            mapToMilestoneMutation.mutate({ 
                                                              lineId: line.id, 
                                                              milestoneId: null 
                                                            });
                                                          }}
                                                          className="text-red-600"
                                                        >
                                                          <Undo className="mr-2 h-4 w-4" />
                                                          Remove Milestone
                                                        </DropdownMenuItem>
                                                      )}
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
      
      {/* Finalize Review Dialog */}
      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Invoice Before Finalizing</DialogTitle>
            <DialogDescription>
              Review and edit line items before finalizing. Once finalized, the batch will be locked and time entries cannot be modified.
              {batchDetails.status === 'draft' && (
                <div className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                  Note: This batch has not been reviewed yet. Consider marking it as reviewed first.
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {groupedLines && Object.entries(groupedLines).map(([clientId, clientData]) => (
              <Card key={clientId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{clientData.client.name}</CardTitle>
                    <Badge variant="secondary">
                      ${clientData.subtotal.toFixed(2)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {Object.entries(clientData.projects).map(([projectId, projectData]) => (
                    <div key={projectId} className="mb-4">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <h4 className="font-semibold">{projectData.project.name}</h4>
                        <span className="text-sm text-muted-foreground">
                          ${projectData.subtotal.toFixed(2)}
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">Description</TableHead>
                            <TableHead className="w-[15%]">Quantity</TableHead>
                            <TableHead className="w-[15%]">Rate</TableHead>
                            <TableHead className="w-[15%]">Amount</TableHead>
                            <TableHead className="w-[15%]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {projectData.lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="font-medium">{line.description || line.type}</TableCell>
                              <TableCell>{line.quantity || '-'}</TableCell>
                              <TableCell>{line.rate ? `$${parseFloat(line.rate).toFixed(2)}` : '-'}</TableCell>
                              <TableCell>${parseFloat(line.billedAmount || line.amount).toFixed(2)}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingLine(line);
                                    setShowEditDialog(true);
                                  }}
                                  data-testid={`button-edit-line-${line.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFinalizeDialog(false)}
              data-testid="button-cancel-finalize"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowFinalizeDialog(false);
                finalizeMutation.mutate();
              }}
              disabled={finalizeMutation.isPending}
              data-testid="button-confirm-finalize"
            >
              <Lock className="mr-2 h-4 w-4" />
              Finalize Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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

      {/* Project Milestones Dialog */}
      {showMilestoneDialog && selectedProjectForMilestone && (
        <ProjectMilestonesDialog
          open={showMilestoneDialog}
          onOpenChange={setShowMilestoneDialog}
          projectId={selectedProjectForMilestone}
          projectName={selectedLineForMilestone?.project.name}
          selectionMode={true}
          onMilestoneSelect={(milestone) => {
            if (selectedLineForMilestone) {
              mapToMilestoneMutation.mutate({
                lineId: selectedLineForMilestone.id,
                milestoneId: milestone.id
              });
            }
          }}
        />
      )}
    </Layout>
  );
}