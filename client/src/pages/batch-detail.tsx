import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  CheckCircle
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
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

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
  
  // Fetch batch details
  const { data: batchDetails, isLoading: isLoadingDetails, error: detailsError } = useQuery<InvoiceBatchDetails>({
    queryKey: ["/api/invoice-batches", batchId, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/invoice-batches/${batchId}/details`);
      if (!response.ok) {
        throw new Error("Failed to fetch batch details");
      }
      return response.json();
    },
    enabled: !!batchId,
  });

  // Fetch invoice lines grouped by client and project
  const { data: groupedLines, isLoading: isLoadingLines, error: linesError } = useQuery<GroupedInvoiceLines>({
    queryKey: ["/api/invoice-batches", batchId, "lines"],
    queryFn: async () => {
      const response = await fetch(`/api/invoice-batches/${batchId}/lines`);
      if (!response.ok) {
        throw new Error("Failed to fetch invoice lines");
      }
      return response.json();
    },
    enabled: !!batchId,
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
        <div className="flex gap-2 mb-6">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            data-testid="button-export-csv"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
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
            <CardTitle>Invoice Lines</CardTitle>
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
                                          <TableHead>Type</TableHead>
                                          <TableHead>Description</TableHead>
                                          <TableHead className="text-right">Quantity</TableHead>
                                          <TableHead className="text-right">Rate</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {projectData.lines.map((line) => (
                                          <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                                            <TableCell>
                                              <Badge variant={line.type === "time" ? "default" : "secondary"}>
                                                {line.type}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-md truncate">
                                              {line.description || "-"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {line.quantity ? parseFloat(line.quantity).toFixed(2) : "-"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {line.rate ? `$${parseFloat(line.rate).toFixed(2)}` : "-"}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                              ${parseFloat(line.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                          </TableRow>
                                        ))}
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
    </Layout>
  );
}