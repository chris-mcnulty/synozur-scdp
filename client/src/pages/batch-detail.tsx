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
  exportedToQBO: boolean;
  exportedAt?: string;
  createdAt: string;
  totalLinesCount: number;
  clientCount: number;
  projectCount: number;
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
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  
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

  const handleFinalizeBatch = async () => {
    // Will be implemented in next step
    toast({
      title: "Coming soon",
      description: "Batch finalization will be implemented in the next phase.",
    });
  };

  const calculateGrandTotal = () => {
    if (!groupedLines) return 0;
    return Object.values(groupedLines).reduce((total, client) => total + client.subtotal, 0);
  };

  const getStatusBadge = () => {
    if (!batchDetails) return null;
    
    if (batchDetails.exportedToQBO) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
          <CheckCircle className="mr-1 h-3 w-3" />
          Exported
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary">
        <FileText className="mr-1 h-3 w-3" />
        Draft
      </Badge>
    );
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
          <Button
            onClick={handleFinalizeBatch}
            variant="default"
            disabled={batchDetails.exportedToQBO}
            data-testid="button-finalize"
          >
            <Lock className="mr-2 h-4 w-4" />
            Finalize Batch
          </Button>
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
    </Layout>
  );
}