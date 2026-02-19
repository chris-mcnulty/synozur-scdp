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
  ExternalLink,
  Wrench,
  Upload,
  Archive
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
  taxRate?: string;
  taxAmount?: string;
  taxAmountOverride?: string | null;
  glInvoiceNumber?: string | null;
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
  clientPaymentTerms?: string | null;
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
  taxable?: boolean;
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
  // GL Invoice Number and Tax Override editing state
  const [isEditingGlNumber, setIsEditingGlNumber] = useState(false);
  const [glInvoiceNumber, setGlInvoiceNumber] = useState("");
  const [isEditingTaxOverride, setIsEditingTaxOverride] = useState(false);
  const [taxOverrideValue, setTaxOverrideValue] = useState("");
  const [showRepairDialog, setShowRepairDialog] = useState(false);
  const [repairPreview, setRepairPreview] = useState<any>(null);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showJsonRepairDialog, setShowJsonRepairDialog] = useState(false);
  const [jsonRepairPreview, setJsonRepairPreview] = useState<any>(null);
  const [jsonTimeEntries, setJsonTimeEntries] = useState<any[]>([]);
  
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
        return 'Payment due upon receipt';
      }
      const data = await response.json();
      return data.value || 'Payment due upon receipt';
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

  // GL Invoice Number Update Mutation
  const updateGlNumberMutation = useMutation({
    mutationFn: async (glInvoiceNumber: string | null) => {
      return await apiRequest(`/api/invoice-batches/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ glInvoiceNumber })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      toast({ 
        title: "Success",
        description: "GL invoice number updated successfully" 
      });
      setIsEditingGlNumber(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update GL invoice number",
        variant: "destructive" 
      });
    }
  });

  // Tax Override Update Mutation
  const updateTaxOverrideMutation = useMutation({
    mutationFn: async (taxAmountOverride: number | null) => {
      // Send as string for consistent backend handling, or null to clear
      return await apiRequest(`/api/invoice-batches/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          taxAmountOverride: taxAmountOverride === null ? null : taxAmountOverride.toFixed(2)
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      toast({ 
        title: "Success",
        description: "Tax override updated successfully" 
      });
      setIsEditingTaxOverride(false);
      setTaxOverrideValue("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error",
        description: error.message || "Failed to update tax override",
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

  const handleExportCSV = async (exportType: 'all' | 'expense' | 'time' = 'all') => {
    if (!batchId) return;

    try {
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        toast({
          title: "Authentication required",
          description: "Please log in to export CSV",
          variant: "destructive"
        });
        return;
      }

      const typeParam = exportType !== 'all' ? `?type=${exportType}` : '';
      const response = await fetch(`/api/invoice-batches/${batchId}/lines/export-csv${typeParam}`, {
        credentials: 'include',
        headers: {
          'X-Session-Id': sessionId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const typeLabel = exportType === 'expense' ? '_expenses' : exportType === 'time' ? '_time' : '';
      a.download = `invoice-batch-${batchId}${typeLabel}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const typeDescription = exportType === 'expense' ? 'Expenses' : exportType === 'time' ? 'Time entries' : 'All line items';
      toast({
        title: "Export successful",
        description: `${typeDescription} have been exported to CSV.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export CSV. Please try again.",
        variant: "destructive"
      });
    }
  };

  const [isPDFGenerating, setIsPDFGenerating] = useState(false);
  const [isReceiptsDownloading, setIsReceiptsDownloading] = useState(false);
  const [isExpandAll, setIsExpandAll] = useState(false);

  // Check if receipts bundle is available
  const { data: receiptsBundleData } = useQuery<{ available: boolean; count: number }>({
    queryKey: ["/api/invoice-batches", batchId, "receipts-bundle", "check"],
    enabled: !!batchId,
  });

  const handleToggleExpand = () => {
    if (isExpandAll) {
      collapseAll();
    } else {
      expandAll();
    }
    setIsExpandAll(!isExpandAll);
  };

  const handleDownloadReceiptsBundle = async () => {
    if (!batchId) return;
    
    try {
      setIsReceiptsDownloading(true);
      
      toast({
        title: "Preparing receipts bundle",
        description: "Please wait while we gather all receipts...",
      });
      
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        toast({
          title: "Authentication required",
          description: "Please log in to download receipts.",
          variant: "destructive"
        });
        setIsReceiptsDownloading(false);
        return;
      }

      const response = await fetch(`/api/invoice-batches/${batchId}/receipts-bundle`, {
        method: 'GET',
        headers: {
          'X-Session-Id': sessionId,
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipts-bundle-${batchId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download complete",
        description: "The receipts bundle has been downloaded.",
      });
    } catch (error: any) {
      console.error("Receipts bundle download error:", error);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download receipts bundle.",
        variant: "destructive"
      });
    } finally {
      setIsReceiptsDownloading(false);
    }
  };

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
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches"] });
      
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
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches"] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches"] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/unbilled-items'] });
      toast({ 
        title: "Batch deleted",
        description: "The invoice batch has been successfully deleted"
      });
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
    if (!groupedLines || Object.keys(groupedLines).length === 0) {
      // Fall back to stored totalAmount when no line items exist (legacy batches)
      return parseFloat(batchDetails?.totalAmount || '0');
    }
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
  const subtotalAfterDiscount = grandTotal - discountAmount;
  const taxRate = parseFloat(batchDetails.taxRate || "0");
  // Use manual override if set, otherwise calculate from rate
  const taxAmountOverride = batchDetails.taxAmountOverride ? parseFloat(batchDetails.taxAmountOverride) : null;
  const isManualTaxOverride = taxAmountOverride !== null && !isNaN(taxAmountOverride);
  const taxAmount = isManualTaxOverride ? taxAmountOverride : (subtotalAfterDiscount * (taxRate / 100));
  // Calculate effective percentage for display
  const effectiveTaxPercent = subtotalAfterDiscount > 0 ? (taxAmount / subtotalAfterDiscount) * 100 : 0;
  const netTotal = subtotalAfterDiscount + taxAmount;

  return (
    <Layout>
      <div className="container mx-auto py-6">
        {/* Compact Header & Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate("/billing")}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-batch-id">
                Batch: {batchId}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex bg-muted p-1 rounded-md">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs px-2"
                onClick={() => handleExportCSV()}
              >
                <Download className="mr-1 h-3 w-3" />
                CSV
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs px-2"
                onClick={handleExportToQBO}
              >
                <Upload className="mr-1 h-3 w-3" />
                QuickBooks
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs px-2"
                onClick={handleDownloadPDF}
                disabled={isPDFGenerating}
              >
                <FileText className="mr-1 h-3 w-3" />
                {isPDFGenerating ? "Generating..." : "Generate PDF"}
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs px-2"
                onClick={handleDownloadReceiptsBundle}
                disabled={isReceiptsDownloading || !receiptsBundleData?.available}
              >
                <Archive className="mr-1 h-3 w-3" />
                Receipts
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />

            {batchDetails?.status === 'draft' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs"
                onClick={handleReviewBatch}
                disabled={reviewMutation.isPending}
              >
                <CheckSquare className="mr-1 h-3 w-3" />
                Review
              </Button>
            )}

            {canFinalize() && (
              <Button 
                size="sm" 
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleFinalizeBatch}
              >
                <Lock className="mr-1 h-3 w-3" />
                Finalize
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowAdjustmentHistory(!showAdjustmentHistory)}>
                  <History className="mr-2 h-4 w-4" /> {showAdjustmentHistory ? "Hide" : "View"} History
                </DropdownMenuItem>
                {canEditLines() && (
                  <DropdownMenuItem onClick={() => setShowAggregateAdjustmentDialog(true)}>
                    <Calculator className="mr-2 h-4 w-4" /> Contract Adjustment
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleToggleExpand}>
                  {isExpandAll ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}
                  {isExpandAll ? "Collapse All" : "Expand All"}
                </DropdownMenuItem>
                {canUnfinalize() && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleUnfinalizeBatch} className="text-orange-600">
                      <FileText className="mr-2 h-4 w-4" /> Revert to Draft
                    </DropdownMenuItem>
                  </>
                )}
                {batchDetails.status === 'finalized' && !batchDetails.exportedToQBO && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportToQBO}>
                      <Building className="mr-2 h-4 w-4" /> Export to QBO
                    </DropdownMenuItem>
                  </>
                )}
                {batchDetails.exportedToQBO && (
                  <DropdownMenuItem disabled>
                    <CheckCircle className="mr-2 h-4 w-4" /> Exported to QBO
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive"
                  onClick={handleDeleteBatch}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Batch
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card className="border-none shadow-none bg-accent/5 mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Status</p>
                {getStatusBadge()}
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Date Range</p>
                <p className="text-sm font-medium" data-testid="text-date-range">{batchDetails ? `${formatBusinessDate(batchDetails.startDate, 'MMM d')} - ${formatBusinessDate(batchDetails.endDate, 'MMM d, yyyy')}` : '-'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 flex items-center">
                  As-Of Date
                  {user?.role === 'admin' && !isEditingAsOfDate && (
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-1" onClick={handleStartAsOfDateEdit} data-testid="button-edit-as-of-date">
                      <Edit className="h-3 w-3" />
                    </Button>
                  )}
                </p>
                {isEditingAsOfDate ? (
                  <div className="space-y-1">
                    <Input type="date" value={newAsOfDate} onChange={(e) => setNewAsOfDate(e.target.value)} data-testid="input-as-of-date" className="text-xs h-7" />
                    <div className="flex space-x-1">
                      <Button size="sm" className="h-6 text-xs px-2" onClick={handleSaveAsOfDate} disabled={updateAsOfDateMutation.isPending} data-testid="button-save-as-of-date">
                        {updateAsOfDateMutation.isPending ? '...' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleCancelAsOfDateEdit} data-testid="button-cancel-as-of-date">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-medium" data-testid="text-as-of-date">
                    {batchDetails?.asOfDate ? formatBusinessDate(batchDetails.asOfDate, 'MMM d, yyyy') : formatTimestamp(batchDetails.createdAt, "MMM d, yyyy")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Created By</p>
                <p className="text-sm font-medium" data-testid="text-created-by">{batchDetails?.creator?.name || "System"}</p>
              </div>
              <div className="col-span-1 lg:col-span-2 flex justify-end items-center space-x-4">
                <div className="text-right">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Subtotal</p>
                  <p className="text-sm font-medium" data-testid="text-subtotal">${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                {discountAmount > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Discount</p>
                    <p className="text-sm font-medium text-red-600" data-testid="text-discount">-${discountAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 flex items-center justify-end gap-1">
                      Tax ({effectiveTaxPercent.toFixed(1)}%)
                      {isManualTaxOverride && <Badge variant="secondary" className="text-[8px] h-3 px-1">Override</Badge>}
                    </p>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400" data-testid="text-tax">${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Total</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="text-net-total">${netTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            {batchDetails.paymentMilestone && (
              <>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Payment Milestone</p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium" data-testid="text-milestone-name">{batchDetails.paymentMilestone.name}</p>
                      <Badge
                        variant={
                          batchDetails.paymentMilestone.status === 'invoiced' || batchDetails.paymentMilestone.status === 'paid' ? 'default' :
                          batchDetails.paymentMilestone.status === 'planned' ? 'secondary' :
                          batchDetails.paymentMilestone.status === 'cancelled' || batchDetails.paymentMilestone.status === 'canceled' ? 'destructive' : 'outline'
                        }
                        className="text-[9px] h-4 px-1"
                        data-testid="badge-milestone-status"
                      >
                        {batchDetails.paymentMilestone.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Project</p>
                    <Link href={`/projects/${batchDetails.paymentMilestone.projectId}`} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400" data-testid="link-milestone-project">
                      {batchDetails.paymentMilestone.projectName}
                    </Link>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Target Amount</p>
                    <p className="text-sm font-medium" data-testid="text-milestone-amount">
                      ${Number(batchDetails.paymentMilestone.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </>
            )}

            {batchDetails.status === 'finalized' && batchDetails.finalizedAt && (
              <>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Finalized By</p>
                    <p className="text-sm font-medium" data-testid="text-finalized-by">{batchDetails.finalizer?.name || 'System'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Finalized At</p>
                    <p className="text-sm font-medium" data-testid="text-finalized-at">{format(new Date(batchDetails.finalizedAt), "MMM d, yyyy h:mm a")}</p>
                  </div>
                  {batchDetails.exportedAt && (
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Exported</p>
                      <p className="text-sm font-medium">{format(new Date(batchDetails.exportedAt), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {batchDetails.notes && (
              <>
                <Separator className="my-3" />
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Review Notes</p>
                  <p className="text-sm" data-testid="text-review-notes">{batchDetails.notes}</p>
                </div>
              </>
            )}

            <Separator className="my-3" />
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Payment Terms</p>
              <p className="text-sm font-medium" data-testid="text-payment-terms">
                {batchDetails.paymentTerms || batchDetails.clientPaymentTerms || defaultPaymentTerms || 'Payment due upon receipt'}
              </p>
              {batchDetails.paymentTerms ? (
                <Badge variant="secondary" className="text-[9px] h-4 px-1">Custom</Badge>
              ) : batchDetails.clientPaymentTerms ? (
                <Badge variant="outline" className="text-[9px] h-4 px-1">Client</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1">Default</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Adjustment History (conditionally shown) */}
        {showAdjustmentHistory && (
          <div className="mb-4">
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

        {/* Sticky Action Bar for Selected Lines */}
        {selectedLines.size > 0 && (
          <div className="sticky top-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center justify-between mb-4">
            <span className="text-sm font-medium">{selectedLines.size} items selected</span>
            <div className="flex items-center space-x-2">
              <Button size="sm" variant="secondary" className="h-8" onClick={handleBulkEdit}>
                <Calculator className="mr-2 h-4 w-4" /> Bulk Adjust
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setSelectedLines(new Set())}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Consolidated Invoice Settings Card - Payment Terms, GL#, Tax Override side by side */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Invoice Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Payment Terms Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Payment Terms</Label>
                  {batchDetails.paymentTerms ? (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">Custom</Badge>
                  ) : batchDetails.clientPaymentTerms ? (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Client</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Default</Badge>
                  )}
                </div>
                {!isEditingPaymentTerms ? (
                  <div className="space-y-2">
                    <p className="text-sm" data-testid={batchDetails.status === 'finalized' ? 'text-finalized-payment-terms' : 'text-current-payment-terms'}>
                      {batchDetails.paymentTerms || batchDetails.clientPaymentTerms || defaultPaymentTerms || 'Payment due upon receipt'}
                    </p>
                    {batchDetails.status !== 'finalized' && canEditLines() && (
                      <Button
                        onClick={() => {
                          setIsEditingPaymentTerms(true);
                          setUseCustomPaymentTerms(!!batchDetails.paymentTerms);
                          setCustomPaymentTerms(batchDetails.paymentTerms || '');
                        }}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-edit-payment-terms"
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                    )}
                    {batchDetails.status === 'finalized' && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Lock className="h-2.5 w-2.5" />
                        <span>Cannot modify for finalized batches</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="custom-payment-terms"
                        checked={useCustomPaymentTerms}
                        onCheckedChange={(checked) => {
                          setUseCustomPaymentTerms(checked);
                          if (!checked) setCustomPaymentTerms('');
                        }}
                        data-testid="switch-custom-payment-terms"
                        className="scale-75"
                      />
                      <Label htmlFor="custom-payment-terms" className="cursor-pointer text-xs">
                        Custom terms
                      </Label>
                    </div>
                    {useCustomPaymentTerms ? (
                      <Textarea
                        id="payment-terms-input"
                        value={customPaymentTerms}
                        onChange={(e) => setCustomPaymentTerms(e.target.value)}
                        placeholder={defaultPaymentTerms || 'Payment due upon receipt'}
                        className="min-h-[60px] text-xs"
                        data-testid="textarea-payment-terms"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Using {batchDetails.clientPaymentTerms ? 'client' : 'default'}: {batchDetails.clientPaymentTerms || defaultPaymentTerms || 'Payment due upon receipt'}
                      </p>
                    )}
                    <div className="flex gap-1">
                      <Button
                        onClick={() => {
                          const newPaymentTerms = useCustomPaymentTerms ? customPaymentTerms.trim() : null;
                          updatePaymentTermsMutation.mutate(newPaymentTerms);
                        }}
                        disabled={updatePaymentTermsMutation.isPending || (useCustomPaymentTerms && !customPaymentTerms.trim())}
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-save-payment-terms"
                      >
                        {updatePaymentTermsMutation.isPending ? '...' : 'Save'}
                      </Button>
                      <Button
                        onClick={() => { setIsEditingPaymentTerms(false); setUseCustomPaymentTerms(false); setCustomPaymentTerms(''); }}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={updatePaymentTermsMutation.isPending}
                        data-testid="button-cancel-payment-terms"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* GL Invoice Number Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">GL Invoice #</Label>
                  {batchDetails.glInvoiceNumber && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">Set</Badge>
                  )}
                </div>
                {!isEditingGlNumber ? (
                  <div className="space-y-2">
                    <p className="text-sm font-mono" data-testid="text-gl-invoice-number">
                      {batchDetails.glInvoiceNumber || <span className="text-muted-foreground italic font-sans">Not set</span>}
                    </p>
                    {batchDetails.status !== 'finalized' && canEditLines() && (
                      <Button
                        onClick={() => { setIsEditingGlNumber(true); setGlInvoiceNumber(batchDetails.glInvoiceNumber || ''); }}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-edit-gl-number"
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        {batchDetails.glInvoiceNumber ? 'Edit' : 'Add'}
                      </Button>
                    )}
                    {batchDetails.status === 'finalized' && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Lock className="h-2.5 w-2.5" />
                        <span>Locked</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={glInvoiceNumber}
                      onChange={(e) => setGlInvoiceNumber(e.target.value)}
                      placeholder="e.g., INV-2024-001"
                      className="h-8 text-xs"
                      data-testid="input-gl-invoice-number"
                    />
                    <div className="flex gap-1">
                      <Button
                        onClick={() => updateGlNumberMutation.mutate(glInvoiceNumber.trim() || null)}
                        disabled={updateGlNumberMutation.isPending}
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-save-gl-number"
                      >
                        {updateGlNumberMutation.isPending ? '...' : 'Save'}
                      </Button>
                      <Button
                        onClick={() => { setIsEditingGlNumber(false); setGlInvoiceNumber(''); }}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={updateGlNumberMutation.isPending}
                        data-testid="button-cancel-gl-number"
                      >
                        Cancel
                      </Button>
                      {batchDetails.glInvoiceNumber && (
                        <Button
                          onClick={() => updateGlNumberMutation.mutate(null)}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive"
                          disabled={updateGlNumberMutation.isPending}
                          data-testid="button-clear-gl-number"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tax Override Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Tax</Label>
                  {isManualTaxOverride && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">Override</Badge>
                  )}
                </div>
                {!isEditingTaxOverride ? (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Rate:</span> <span className="font-medium">{taxRate.toFixed(1)}%</span>
                      <span className="text-muted-foreground ml-2">= </span>
                      <span className="font-medium">${(subtotalAfterDiscount * (taxRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {isManualTaxOverride && (
                      <div className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                        <Info className="h-3 w-3" />
                        <span>Override: <strong>${taxAmountOverride?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ({effectiveTaxPercent.toFixed(1)}%)</span>
                      </div>
                    )}
                    {batchDetails.status !== 'finalized' && canEditLines() && (
                      <Button
                        onClick={() => {
                          setIsEditingTaxOverride(true);
                          setTaxOverrideValue(batchDetails.taxAmountOverride ? String(batchDetails.taxAmountOverride) : '');
                        }}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-edit-tax-override"
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        {isManualTaxOverride ? 'Edit' : 'Set Override'}
                      </Button>
                    )}
                    {batchDetails.status === 'finalized' && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Lock className="h-2.5 w-2.5" />
                        <span>Locked</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={taxOverrideValue}
                        onChange={(e) => setTaxOverrideValue(e.target.value)}
                        placeholder="Exact tax amount"
                        className="h-8 text-xs max-w-32"
                        data-testid="input-tax-override"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Calculated: ${(subtotalAfterDiscount * (taxRate / 100)).toFixed(2)}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        onClick={() => {
                          const value = parseFloat(taxOverrideValue);
                          updateTaxOverrideMutation.mutate(isNaN(value) ? null : value);
                        }}
                        disabled={updateTaxOverrideMutation.isPending || taxOverrideValue === ''}
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-save-tax-override"
                      >
                        {updateTaxOverrideMutation.isPending ? '...' : 'Save'}
                      </Button>
                      <Button
                        onClick={() => { setIsEditingTaxOverride(false); setTaxOverrideValue(''); }}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={updateTaxOverrideMutation.isPending}
                        data-testid="button-cancel-tax-override"
                      >
                        Cancel
                      </Button>
                      {isManualTaxOverride && (
                        <Button
                          onClick={() => updateTaxOverrideMutation.mutate(null)}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive"
                          disabled={updateTaxOverrideMutation.isPending}
                          data-testid="button-clear-tax-override"
                        >
                          <Undo className="mr-1 h-3 w-3" />
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

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
                                                  {line.taxable === false && (
                                                    <TooltipProvider>
                                                      <Tooltip>
                                                        <TooltipTrigger>
                                                          <Badge variant="outline" className="text-xs px-1 py-0 text-muted-foreground">
                                                            No Tax
                                                          </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                          <p className="text-sm">This line is not subject to tax</p>
                                                        </TooltipContent>
                                                      </Tooltip>
                                                    </TooltipProvider>
                                                  )}
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
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-4">
                  No invoice lines found for this batch.
                </div>
                {batchDetails && (
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 max-w-lg mx-auto">
                    {parseFloat(batchDetails.totalAmount || '0') > 0 ? (
                      <p className="text-amber-800 dark:text-amber-200 text-sm mb-3">
                        <strong>Legacy Invoice:</strong> This batch has a stored total of{' '}
                        <span className="font-semibold">
                          ${parseFloat(batchDetails.totalAmount || '0').toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>{' '}
                        but the itemized line details were not saved when it was created.
                      </p>
                    ) : (
                      <p className="text-amber-800 dark:text-amber-200 text-sm mb-3">
                        <strong>Empty Batch:</strong> This batch has no line items and a $0.00 total.
                        You can check if there are any time entries linked to this batch that could be recovered.
                      </p>
                    )}
                    {user?.role === 'admin' && (
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            setIsRepairing(true);
                            try {
                              const data = await apiRequest(`/api/invoice-batches/${batchId}/repair?dryRun=true`, { method: 'POST' });
                              setRepairPreview(data);
                              setShowRepairDialog(true);
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to check repair options",
                                variant: "destructive"
                              });
                            } finally {
                              setIsRepairing(false);
                            }
                          }}
                          disabled={isRepairing}
                          data-testid="button-repair-batch"
                        >
                          <Wrench className="mr-2 h-4 w-4" />
                          {isRepairing ? "Checking..." : "Repair from DB"}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowJsonRepairDialog(true)}
                          disabled={isRepairing}
                          data-testid="button-repair-from-json"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Repair from JSON
                        </Button>
                      </div>
                    )}
                  </div>
                )}
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

      {/* Repair Batch Dialog */}
      <AlertDialog open={showRepairDialog} onOpenChange={setShowRepairDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Repair Invoice Line Items</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {repairPreview?.timeEntriesFound === 0 ? (
                  <p className="text-amber-600">
                    No time entries found linked to this batch. Unable to reconstruct line items.
                  </p>
                ) : (
                  <>
                    <p>
                      Found <strong>{repairPreview?.timeEntriesFound || 0}</strong> time entries linked to this batch.
                    </p>
                    <div className="bg-muted p-3 rounded text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <span>Lines to create:</span>
                        <span className="font-medium">{repairPreview?.linesToCreate || 0}</span>
                        <span>Calculated total:</span>
                        <span className="font-medium">${repairPreview?.totalAmount || '0.00'}</span>
                        <span>Stored batch total:</span>
                        <span className="font-medium">${parseFloat(batchDetails?.totalAmount || '0').toFixed(2)}</span>
                        <span>Clients:</span>
                        <span className="font-medium">{repairPreview?.uniqueClients || 0}</span>
                        <span>Projects:</span>
                        <span className="font-medium">{repairPreview?.uniqueProjects || 0}</span>
                      </div>
                    </div>
                    {repairPreview?.totalAmount !== batchDetails?.totalAmount && (
                      <p className="text-amber-600 text-sm">
                        Note: The reconstructed total may differ from the stored amount due to rate changes or adjustments made at the time of invoicing.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {repairPreview?.timeEntriesFound > 0 && (
              <AlertDialogAction 
                onClick={async () => {
                  setIsRepairing(true);
                  try {
                    const response = await apiRequest(`/api/invoice-batches/${batchId}/repair`, {
                      method: 'POST'
                    });
                    toast({
                      title: "Repair Complete",
                      description: `Created ${response.linesCreated} invoice lines from ${response.timeEntriesProcessed} time entries.`
                    });
                    queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
                    queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
                    queryClient.invalidateQueries({ queryKey: ['/api/invoice-batches'] });
                  } catch (error: any) {
                    toast({
                      title: "Repair Failed",
                      description: error.message || "Failed to repair invoice batch",
                      variant: "destructive"
                    });
                  } finally {
                    setIsRepairing(false);
                    setShowRepairDialog(false);
                  }
                }}
                disabled={isRepairing}
              >
                {isRepairing ? "Repairing..." : "Repair Now"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Repair from JSON Dialog */}
      <AlertDialog open={showJsonRepairDialog} onOpenChange={(open) => {
        setShowJsonRepairDialog(open);
        if (!open) {
          setJsonRepairPreview(null);
          setJsonTimeEntries([]);
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Repair from JSON Export</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Upload a time_entries JSON export file to reconstruct missing invoice lines.
                </p>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select time_entries JSON file:</label>
                  <Input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        
                        if (!Array.isArray(data)) {
                          toast({
                            title: "Invalid File",
                            description: "Expected a JSON array of time entries",
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        setJsonTimeEntries(data);
                        
                        // Preview what would be created
                        setIsRepairing(true);
                        const preview = await apiRequest(`/api/invoice-batches/${batchId}/repair-from-json?dryRun=true`, {
                          method: 'POST',
                          body: JSON.stringify({ timeEntries: data })
                        });
                        setJsonRepairPreview(preview);
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to parse JSON file",
                          variant: "destructive"
                        });
                      } finally {
                        setIsRepairing(false);
                      }
                    }}
                    data-testid="input-json-file"
                  />
                </div>
                
                {jsonRepairPreview && (
                  <div className="bg-muted p-3 rounded text-sm">
                    {jsonRepairPreview.timeEntriesFound === 0 ? (
                      <p className="text-amber-600">
                        No time entries found for batch {batchId} in the uploaded file.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <span>Time entries found:</span>
                        <span className="font-medium">{jsonRepairPreview.timeEntriesFound}</span>
                        <span>Lines to create:</span>
                        <span className="font-medium">{jsonRepairPreview.linesToCreate}</span>
                        <span>Calculated total:</span>
                        <span className="font-medium">${jsonRepairPreview.totalAmount}</span>
                        <span>Stored batch total:</span>
                        <span className="font-medium">${parseFloat(batchDetails?.totalAmount || '0').toFixed(2)}</span>
                        <span>Clients:</span>
                        <span className="font-medium">{jsonRepairPreview.uniqueClients}</span>
                        <span>Projects:</span>
                        <span className="font-medium">{jsonRepairPreview.uniqueProjects}</span>
                      </div>
                    )}
                    {jsonRepairPreview.totalAmount !== batchDetails?.totalAmount && jsonRepairPreview.timeEntriesFound > 0 && (
                      <p className="text-amber-600 text-sm mt-2">
                        Note: The difference may be due to aggregate adjustments or rate changes at the time of invoicing.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {jsonRepairPreview?.timeEntriesFound > 0 && (
              <AlertDialogAction 
                onClick={async () => {
                  setIsRepairing(true);
                  try {
                    const response = await apiRequest(`/api/invoice-batches/${batchId}/repair-from-json`, {
                      method: 'POST',
                      body: JSON.stringify({ timeEntries: jsonTimeEntries })
                    });
                    toast({
                      title: "Repair Complete",
                      description: `Created ${response.linesCreated} invoice lines from ${response.timeEntriesProcessed} time entries.`
                    });
                    queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] });
                    queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] });
                    queryClient.invalidateQueries({ queryKey: ['/api/invoice-batches'] });
                  } catch (error: any) {
                    toast({
                      title: "Repair Failed",
                      description: error.message || "Failed to repair invoice batch",
                      variant: "destructive"
                    });
                  } finally {
                    setIsRepairing(false);
                    setShowJsonRepairDialog(false);
                    setJsonRepairPreview(null);
                    setJsonTimeEntries([]);
                  }
                }}
                disabled={isRepairing}
              >
                {isRepairing ? "Repairing..." : "Repair Now"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}