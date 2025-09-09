import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Trash2, Download, Upload, Save, FileDown, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EstimateLineItem, Estimate, EstimateEpic, EstimateStage, EstimateMilestone } from "@shared/schema";

export default function EstimateDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [showEpicDialog, setShowEpicDialog] = useState(false);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [selectedEpicForStage, setSelectedEpicForStage] = useState("");
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [newMilestone, setNewMilestone] = useState({
    name: "",
    description: "",
    amount: "",
    percentage: "",
    dueDate: ""
  });
  const [editingMilestone, setEditingMilestone] = useState<any>(null);
  const [showMilestoneEditDialog, setShowMilestoneEditDialog] = useState(false);
  const [presentedTotal, setPresentedTotal] = useState("");
  const [margin, setMargin] = useState("");
  const [editingEstimateName, setEditingEstimateName] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkEditDialog, setBulkEditDialog] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    epicId: "",
    stageId: "",
    workstream: "",
    week: "",
    size: "",
    complexity: "",
    confidence: "",
    rate: "",
    category: ""
  });
  const [applyStaffRatesDialog, setApplyStaffRatesDialog] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [filterText, setFilterText] = useState("");
  const [filterEpic, setFilterEpic] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [filterWorkstream, setFilterWorkstream] = useState("");
  const [filterWeek, setFilterWeek] = useState("all");
  const [filterUnresourced, setFilterUnresourced] = useState(false);
  const [showResourceSummary, setShowResourceSummary] = useState(false);
  const [showEpicManagement, setShowEpicManagement] = useState(false);
  const [showStageManagement, setShowStageManagement] = useState(false);
  const [newItem, setNewItem] = useState({
    description: "",
    epicId: "none",
    stageId: "none",
    workstream: "",
    week: "",
    baseHours: "",
    factor: "1",
    rate: "0",
    costRate: "0",
    size: "small",
    complexity: "small",
    confidence: "high",
    comments: "",
    staffId: "",
    resourceName: ""
  });

  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ['/api/estimates', id],
    enabled: !!id,
    retry: 1,
  });

  const { data: lineItems = [], isLoading, error: lineItemsError } = useQuery<EstimateLineItem[]>({
    queryKey: ['/api/estimates', id, 'line-items'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const assignableUsers = users.filter((u: any) => u.isAssignable && u.isActive);

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
  });

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const { data: epics = [], error: epicsError } = useQuery<EstimateEpic[]>({
    queryKey: ['/api/estimates', id, 'epics'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const { data: stages = [], error: stagesError } = useQuery<EstimateStage[]>({
    queryKey: ['/api/estimates', id, 'stages'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const { data: milestones = [] } = useQuery<EstimateMilestone[]>({
    queryKey: ['/api/estimates', id, 'milestones'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const createEpicMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest(`/api/estimates/${id}/epics`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
      setNewEpicName("");
      setShowEpicDialog(false);
      toast({ title: "Epic created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create epic", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const createStageMutation = useMutation({
    mutationFn: async (data: { epicId: string; name: string }) => {
      return apiRequest(`/api/estimates/${id}/stages`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      setNewStageName("");
      setSelectedEpicForStage("");
      setShowStageDialog(false);
      toast({ title: "Stage created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create stage", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/estimates/${id}/line-items`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setNewItem({
        description: "",
        epicId: "none",
        stageId: "none",
        workstream: "",
        week: "",
        baseHours: "",
        factor: "1",
        rate: "0",
        costRate: "0",
        size: "small",
        complexity: "small",
        confidence: "high",
        comments: "",
        staffId: "",
        resourceName: ""
      });
      toast({ title: "Input added successfully" });
    },
    onError: (error: any) => {
      console.error("Failed to create line item - Full error:", error);
      console.error("Error response:", error.response);
      console.error("Error details:", error.details);
      
      let errorMessage = "Please check your input and try again";
      
      if (error.message?.includes("session")) {
        errorMessage = "Session expired. Please refresh the page and try again.";
      } else if (error.details) {
        errorMessage = error.details;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({ 
        title: "Failed to add line item", 
        description: errorMessage,
        variant: "destructive" 
      });
    }
  });

  const updateLineItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: any }) => 
      apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setEditingItem(null);
      toast({ title: "Line item updated successfully" });
    }
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: (itemId: string) => 
      apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: "Line item deleted successfully" });
    }
  });

  const updateEstimateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/estimates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      toast({ title: "Estimate updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update estimate", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ itemIds, updates }: { itemIds: string[]; updates: any }) => {
      // Update each item individually
      const promises = itemIds.map(itemId => 
        apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setSelectedItems(new Set());
      setBulkEditDialog(false);
      setBulkEditData({ epicId: "", stageId: "", workstream: "", week: "", size: "", complexity: "", confidence: "", rate: "", category: "" });
      toast({ title: "Bulk update completed successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to bulk update", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/estimates/${id}/milestones`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'milestones'] });
      setShowMilestoneDialog(false);
      setNewMilestone({ name: "", description: "", amount: "", percentage: "", dueDate: "" });
      toast({
        title: "Success",
        description: "Milestone created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Failed to create milestone - Full error:", error);
      toast({ 
        title: "Failed to create milestone", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: ({ milestoneId, data }: { milestoneId: string; data: any }) => 
      apiRequest(`/api/estimates/${id}/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'milestones'] });
      toast({ title: "Milestone updated successfully" });
    }
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: (milestoneId: string) => 
      apiRequest(`/api/estimates/${id}/milestones/${milestoneId}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'milestones'] });
      toast({ title: "Milestone deleted successfully" });
    }
  });

  const calculateAdjustedValues = (baseHours: number, factor: number, rate: number, size: string, complexity: string, confidence: string) => {
    if (!estimate) return { adjustedHours: 0, totalAmount: 0 };
    
    let sizeMultiplier = 1.0;
    if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
    else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);
    
    let complexityMultiplier = 1.0;
    if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
    else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);
    
    let confidenceMultiplier = 1.0;
    if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
    else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);
    
    const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
    const totalAmount = adjustedHours * rate;
    
    return { adjustedHours, totalAmount };
  };

  const handleAddItem = () => {
    const baseHours = Number(newItem.baseHours);
    const factor = Number(newItem.factor) || 1;
    const rate = Number(newItem.rate);
    
    if (isNaN(baseHours) || isNaN(factor) || isNaN(rate)) {
      toast({
        title: "Invalid input",
        description: "Please enter valid numbers for hours, factor, and rate",
        variant: "destructive"
      });
      return;
    }
    
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, factor, rate, newItem.size, newItem.complexity, newItem.confidence
    );
    
    const lineItemData = {
      description: newItem.description,
      epicId: newItem.epicId === "none" ? null : newItem.epicId,
      stageId: newItem.stageId === "none" ? null : newItem.stageId,
      workstream: newItem.workstream || null,
      week: newItem.week ? Number(newItem.week) : null,
      baseHours: baseHours.toString(),
      factor: factor.toString(),
      rate: rate.toString(),
      costRate: newItem.costRate || "0",
      size: newItem.size,
      complexity: newItem.complexity,
      confidence: newItem.confidence,
      comments: newItem.comments || null,
      staffId: newItem.staffId || null,
      resourceName: newItem.resourceName || null,
      adjustedHours: adjustedHours.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      sortOrder: lineItems?.length || 0
    };
    
    createLineItemMutation.mutate(lineItemData);
  };

  const handleUpdateItem = (item: EstimateLineItem, field: string, value: any) => {
    const updatedItem = { ...item, [field]: value };
    const baseHours = Number(updatedItem.baseHours);
    const factor = Number(updatedItem.factor) || 1;
    const rate = Number(updatedItem.rate);
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
    );
    
    updateLineItemMutation.mutate({
      itemId: item.id,
      data: {
        ...updatedItem,
        adjustedHours: adjustedHours.toFixed(2),
        totalAmount: totalAmount.toFixed(2)
      }
    });
  };

  const handleExportExcel = async () => {
    try {
      const response = await fetch(`/api/estimates/${id}/export-excel`, {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimate-${id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Failed to export Excel file", variant: "destructive" });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/api/estimates/template-excel", {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "estimate-template.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Template downloaded successfully" });
    } catch (error) {
      toast({ title: "Failed to download template", variant: "destructive" });
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result?.toString().split(",")[1];
      try {
        const response = await apiRequest(`/api/estimates/${id}/import-excel`, {
          method: "POST",
          body: JSON.stringify({ file: base64 })
        });
        toast({ title: `Successfully imported ${response.itemsCreated} line items` });
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      } catch (error) {
        toast({ title: "Failed to import Excel file", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  const totalHours = (lineItems || []).reduce((sum: number, item: EstimateLineItem) => 
    sum + Number(item.adjustedHours), 0);
  const totalAmount = (lineItems || []).reduce((sum: number, item: EstimateLineItem) => 
    sum + Number(item.totalAmount), 0);

  // Show loading state
  if (estimateLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div>Loading estimate...</div>
        </div>
      </Layout>
    );
  }

  // Show error state
  if (estimateError) {
    const errorMessage = estimateError instanceof Error ? estimateError.message : "Unknown error";
    return (
      <Layout>
          <div className="container mx-auto py-8 px-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">Error loading estimate</h2>
                  <p className="text-muted-foreground mb-4">Unable to load the estimate details.</p>
                  <p className="text-sm text-red-500 mb-4">{errorMessage}</p>
                  <Button onClick={() => setLocation("/estimates")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Estimates
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </Layout>
      );
    }

    // Check if estimate exists
    if (!estimate) {
      return (
        <Layout>
          <div className="container mx-auto py-8 px-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">Estimate Not Found</h2>
                  <p className="text-muted-foreground mb-4">The requested estimate could not be found.</p>
                  <Button onClick={() => setLocation("/estimates")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Estimates
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </Layout>
      );
    }

    return (
      <Layout>
      <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/estimates")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Estimate Details</h1>
            <p className="text-muted-foreground cursor-pointer" onClick={() => {
              setEditingItem('estimate-name');
              setEditingEstimateName(estimate?.name || "");
            }}>
              {editingItem === 'estimate-name' ? (
                <Input
                  value={editingEstimateName}
                  onChange={(e) => setEditingEstimateName(e.target.value)}
                  onBlur={() => {
                    if (editingEstimateName.trim() && editingEstimateName !== estimate?.name) {
                      updateEstimateMutation.mutate({ name: editingEstimateName.trim() });
                    }
                    setEditingItem(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  className="text-base"
                  autoFocus
                />
              ) : (
                `${estimate?.name} - Version ${estimate?.version} (click to edit name)`
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDownloadTemplate} variant="outline">
            <FileDown className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <Button onClick={handleExportExcel} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />
        </div>
      </div>

      {/* Show block estimate UI for block type estimates */}
      {estimate?.estimateType === 'block' ? (
        <Card>
          <CardHeader>
            <CardTitle>Block Estimate</CardTitle>
            <CardDescription>Simple hours and dollars estimate for retainer projects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label htmlFor="block-hours">Total Hours</Label>
                <Input
                  id="block-hours"
                  type="number"
                  placeholder="Enter total hours"
                  value={estimate?.blockHours || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || !isNaN(parseFloat(value))) {
                      updateEstimateMutation.mutate({ 
                        blockHours: value === '' ? null : parseFloat(value)
                      });
                    }
                  }}
                  className="mt-1"
                  data-testid="input-block-hours"
                />
              </div>
              <div>
                <Label htmlFor="block-dollars">Total Dollars ($)</Label>
                <Input
                  id="block-dollars"
                  type="number"
                  placeholder="Enter total dollar amount"
                  value={estimate?.blockDollars || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || !isNaN(parseFloat(value))) {
                      updateEstimateMutation.mutate({ 
                        blockDollars: value === '' ? null : parseFloat(value)
                      });
                    }
                  }}
                  className="mt-1"
                  data-testid="input-block-dollars"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="block-description">Description</Label>
              <textarea
                id="block-description"
                placeholder="Describe the work to be done..."
                value={estimate?.blockDescription || ""}
                onChange={(e) => {
                  updateEstimateMutation.mutate({ 
                    blockDescription: e.target.value
                  });
                }}
                className="mt-1 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="textarea-block-description"
              />
            </div>
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-sm">
                  <span className="font-medium">Status:</span> {estimate?.status || 'draft'}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Valid Until:</span> {estimate?.validUntil ? new Date(estimate.validUntil).toLocaleDateString() : 'Not set'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
      /* Show detailed estimate UI for detailed type estimates */
      <Tabs defaultValue="outputs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="outputs">Quotes</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="factors">Factors</TabsTrigger>
        </TabsList>

        <TabsContent value="outputs" className="space-y-6">
          {/* Quotes */}
          <Card>
            <CardHeader>
              <CardTitle>Quotes</CardTitle>
              <CardDescription>Customer-facing pricing and margins</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="presented-total">Presented Total ($)</Label>
                  <Input
                    id="presented-total"
                    type="number"
                    placeholder="Enter customer-facing total"
                    value={presentedTotal || estimate?.presentedTotal || ""}
                    onChange={(e) => setPresentedTotal(e.target.value)}
                    onBlur={() => {
                      if (presentedTotal && estimate) {
                        const calculatedMargin = ((totalAmount - parseFloat(presentedTotal)) / totalAmount * 100).toFixed(2);
                        setMargin(calculatedMargin);
                        updateEstimateMutation.mutate({ 
                          presentedTotal: presentedTotal,
                          margin: calculatedMargin
                        });
                      }
                    }}
                    className="mt-1"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Internal Total: ${Math.round(totalAmount).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label htmlFor="margin">Margin (%)</Label>
                  <Input
                    id="margin"
                    type="number"
                    placeholder="Auto-calculated"
                    value={margin || (estimate?.presentedTotal ? Math.round((totalAmount - Number(estimate.presentedTotal)) / totalAmount * 100) : "")}
                    readOnly
                    className="mt-1 bg-muted"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Difference: ${presentedTotal ? Math.round(totalAmount - parseFloat(presentedTotal)).toLocaleString() : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary by Workstream and Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Summary by Workstream & Stage</CardTitle>
              <CardDescription>Effort and billing breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="workstream">
                <TabsList className="mb-4">
                  <TabsTrigger value="workstream">By Workstream</TabsTrigger>
                  <TabsTrigger value="stage">By Stage</TabsTrigger>
                </TabsList>
                
                <TabsContent value="workstream">
                  {(() => {
                    // Group by workstream
                    const workstreamTotals = lineItems?.reduce((acc: any, item) => {
                      const workstream = item.workstream || "Unassigned";
                      if (!acc[workstream]) {
                        acc[workstream] = { hours: 0, amount: 0, count: 0 };
                      }
                      acc[workstream].hours += Number(item.adjustedHours);
                      acc[workstream].amount += Number(item.totalAmount);
                      acc[workstream].count += 1;
                      return acc;
                    }, {});

                    return (
                      <div className="space-y-3">
                        {Object.entries(workstreamTotals || {}).sort(([a], [b]) => a.localeCompare(b)).map(([workstream, data]: [string, any]) => (
                          <div key={workstream} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{workstream}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6">
                              <span className="text-muted-foreground">{Math.round(data.hours)} hrs</span>
                              <span className="font-semibold">${Math.round(data.amount).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6">
                              <span>{Math.round(totalHours)} hrs</span>
                              <span>${Math.round(totalAmount).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
                
                <TabsContent value="stage">
                  {(() => {
                    // Group by stage
                    const stageTotals = lineItems?.reduce((acc: any, item) => {
                      const stage = item.stageId ? (stages?.find(s => s.id === item.stageId)?.name || "Unassigned") : "Unassigned";
                      if (!acc[stage]) {
                        acc[stage] = { hours: 0, amount: 0, count: 0 };
                      }
                      acc[stage].hours += Number(item.adjustedHours);
                      acc[stage].amount += Number(item.totalAmount);
                      acc[stage].count += 1;
                      return acc;
                    }, {});

                    return (
                      <div className="space-y-3">
                        {Object.entries(stageTotals || {}).sort(([a], [b]) => {
                          if (a === "Unassigned") return 1;
                          if (b === "Unassigned") return -1;
                          return a.localeCompare(b);
                        }).map(([stage, data]: [string, any]) => (
                          <div key={stage} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{stage}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6">
                              <span className="text-muted-foreground">{Math.round(data.hours)} hrs</span>
                              <span className="font-semibold">${Math.round(data.amount).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6">
                              <span>{Math.round(totalHours)} hrs</span>
                              <span>${Math.round(totalAmount).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Milestone Payments</CardTitle>
                  <CardDescription>Customer payment schedule</CardDescription>
                </div>
                <Button onClick={() => setShowMilestoneDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {milestones.length === 0 ? (
                <p className="text-muted-foreground text-sm">No milestones created yet</p>
              ) : (
                <div className="space-y-4">
                  {/* Milestone total indicator */}
                  {(() => {
                    const milestoneTotal = milestones.reduce((sum, m) => {
                      if (m.amount) {
                        return sum + Number(m.amount);
                      } else if (m.percentage && estimate?.presentedTotal) {
                        return sum + (Number(estimate.presentedTotal) * Number(m.percentage) / 100);
                      }
                      return sum;
                    }, 0);
                    const quoteTotal = Number(estimate?.presentedTotal || totalAmount);
                    const difference = quoteTotal - milestoneTotal;
                    const isMatching = Math.abs(difference) < 1;
                    
                    return (
                      <div className={`p-3 rounded-lg border ${isMatching ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">
                            Milestone Total: ${milestoneTotal.toLocaleString()}
                          </span>
                          <span className={`text-sm ${isMatching ? 'text-green-600' : 'text-orange-600'}`}>
                            {isMatching ? (
                              '✓ Matches quote total'
                            ) : (
                              `${difference > 0 ? 'Under' : 'Over'} by $${Math.abs(difference).toLocaleString()}`
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Milestone list */}
                  <div className="space-y-2">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{milestone.name}</div>
                        {milestone.description && (
                          <div className="text-sm text-muted-foreground">{milestone.description}</div>
                        )}
                        <div className="text-sm mt-1">
                          {milestone.amount ? (
                            <span className="font-medium">${Number(milestone.amount).toLocaleString()}</span>
                          ) : milestone.percentage ? (
                            <span className="font-medium">{milestone.percentage}% of total</span>
                          ) : null}
                          {milestone.dueDate && (
                            <span className="text-muted-foreground ml-2">
                              Due: {new Date(milestone.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setEditingMilestone(milestone);
                            setShowMilestoneEditDialog(true);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="factors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Factor Multipliers</CardTitle>
              <CardDescription>
                Configure the multipliers for size, complexity, and confidence factors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Size</h4>
                  <div className="space-y-1 text-sm">
                    <div>Small: {estimate?.sizeSmallMultiplier || "1.00"}x</div>
                    <div>Medium: {estimate?.sizeMediumMultiplier || "1.05"}x</div>
                    <div>Large: {estimate?.sizeLargeMultiplier || "1.10"}x</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Complexity</h4>
                  <div className="space-y-1 text-sm">
                    <div>Small: {estimate?.complexitySmallMultiplier || "1.00"}x</div>
                    <div>Medium: {estimate?.complexityMediumMultiplier || "1.05"}x</div>
                    <div>Large: {estimate?.complexityLargeMultiplier || "1.10"}x</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Confidence</h4>
                  <div className="space-y-1 text-sm">
                    <div>High: {estimate?.confidenceHighMultiplier || "1.00"}x</div>
                    <div>Medium: {estimate?.confidenceMediumMultiplier || "1.10"}x</div>
                    <div>Low: {estimate?.confidenceLowMultiplier || "1.20"}x</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inputs" className="space-y-6">

          {/* Epic and Stage Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Epics
                  <Button onClick={() => setShowEpicDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Epic
                  </Button>
                </CardTitle>
                <CardDescription>
                  Manage estimate epics to organize your work structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                {epics.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No epics created yet</p>
                ) : (
                  <div className="space-y-2">
                    {epics.map((epic, index) => (
                      <div key={epic.id} className="flex items-center justify-between p-2 border rounded">
                        <span className="font-medium">{epic.name}</span>
                        <span className="text-xs text-muted-foreground">#{index + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Stages
                  <Button onClick={() => setShowStageDialog(true)} size="sm" disabled={epics.length === 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </Button>
                </CardTitle>
                <CardDescription>
                  Manage stages within epics for detailed project phases
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {epics.length === 0 ? "Create an epic first to add stages" : "No stages created yet"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stages.map((stage, index) => {
                      const epic = epics.find(e => e.id === stage.epicId);
                      return (
                        <div key={stage.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className="font-medium">{stage.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              (Epic: {epic?.name || 'Unknown'})
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
        <CardHeader>
          <CardTitle>Estimate Inputs</CardTitle>
          <CardDescription>
            Add and manage estimate inputs with factor multipliers and confidence adjustments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-7 gap-2">
              <div className="flex gap-1">
                <Select
                  value={newItem.epicId}
                  onValueChange={(value) => setNewItem({ ...newItem, epicId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Epic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {epics.filter(epic => epic.id && epic.id !== "").map((epic) => (
                      <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowEpicDialog(true)}
                  title="Add new Epic"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-1">
                <Select
                  value={newItem.stageId}
                  onValueChange={(value) => setNewItem({ ...newItem, stageId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {stages.filter(stage => stage.id && stage.id !== "").map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowStageDialog(true)}
                  title="Add new Stage"
                  disabled={epics.length === 0}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Workstream"
                value={newItem.workstream}
                onChange={(e) => setNewItem({ ...newItem, workstream: e.target.value })}
              />
              <Input
                placeholder="Week #"
                type="number"
                value={newItem.week}
                onChange={(e) => setNewItem({ ...newItem, week: e.target.value })}
              />
              <Input
                placeholder="Hours"
                type="number"
                value={newItem.baseHours}
                onChange={(e) => setNewItem({ ...newItem, baseHours: e.target.value })}
              />
              <Input
                placeholder="Factor"
                type="number"
                value={newItem.factor}
                onChange={(e) => setNewItem({ ...newItem, factor: e.target.value })}
                title="Multiplier (e.g., 4 interviews × 3 hours)"
              />
              <Input
                placeholder="Rate ($)"
                type="number"
                value={newItem.rate}
                onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-6 gap-2">
              <Input
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="col-span-2"
              />
              <Select
                value={newItem.size}
                onValueChange={(value) => setNewItem({ ...newItem, size: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newItem.complexity}
                onValueChange={(value) => setNewItem({ ...newItem, complexity: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Complexity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={newItem.confidence}
              onValueChange={(value) => setNewItem({ ...newItem, confidence: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={newItem.staffId || "unassigned"}
              onValueChange={(value) => {
                const selectedStaff = users.find((s: any) => s.id === value);
                if (value === "unassigned") {
                  setNewItem({ ...newItem, staffId: "", resourceName: "", rate: "0", costRate: "0" });
                } else if (selectedStaff) {
                  setNewItem({ 
                    ...newItem, 
                    staffId: selectedStaff.id, 
                    resourceName: selectedStaff.name,
                    rate: selectedStaff.defaultChargeRate?.toString() || "0",
                    costRate: selectedStaff.defaultCostRate?.toString() || "0"
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.filter((user: any) => user.isAssignable).map((member: any) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} - ${member.defaultChargeRate}/hr
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Comments (optional)"
              value={newItem.comments}
              onChange={(e) => setNewItem({ ...newItem, comments: e.target.value })}
            />
          </div>
        </div>
          <Button
            onClick={handleAddItem}
            disabled={!newItem.description || !newItem.baseHours || !newItem.rate || createLineItemMutation.isPending}
            className="mb-4"
            variant="default"
            size="default"
          >
            <Plus className="h-4 w-4 mr-2" />
            {createLineItemMutation.isPending ? "Adding..." : "Add Input"}
          </Button>
          {!newItem.description && !newItem.baseHours && !newItem.rate && (
            <p className="text-sm text-muted-foreground mb-2">
              Fill in Description, Hours, and Rate to add a line item
            </p>
          )}

          {/* Filter Controls */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
            <h4 className="font-medium mb-3">Filter Line Items</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="filter-text">Description</Label>
                <Input
                  id="filter-text"
                  placeholder="Search descriptions..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-epic">Epic</Label>
                <Select value={filterEpic} onValueChange={setFilterEpic}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Epics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Epics</SelectItem>
                    <SelectItem value="none">No Epic</SelectItem>
                    {epics.map((epic) => (
                      <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-stage">Stage</Label>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="none">No Stage</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-workstream">Workstream</Label>
                <Input
                  id="filter-workstream"
                  placeholder="Filter by workstream..."
                  value={filterWorkstream}
                  onChange={(e) => setFilterWorkstream(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-week">Week</Label>
                <Select value={filterWeek} onValueChange={setFilterWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Weeks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Weeks</SelectItem>
                    {(() => {
                      const weeks = Array.from(new Set(lineItems.map((item: EstimateLineItem) => item.week).filter(w => w != null))).sort((a, b) => Number(a) - Number(b));
                      return weeks.map((week) => (
                        <SelectItem key={week} value={week?.toString() || ""}>
                          Week {week}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="filter-unresourced"
                  checked={filterUnresourced}
                  onChange={(e) => setFilterUnresourced(e.target.checked)}
                />
                <Label htmlFor="filter-unresourced">Show Unresourced Only</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-resource-summary"
                  checked={showResourceSummary}
                  onChange={(e) => setShowResourceSummary(e.target.checked)}
                />
                <Label htmlFor="show-resource-summary">Show Resource Summary</Label>
              </div>
            </div>
            {(filterText || filterEpic !== "all" || filterStage !== "all" || filterWorkstream || filterWeek !== "all" || filterUnresourced) && (
              <div className="mt-3">
                <Button
                  onClick={() => {
                    setFilterText("");
                    setFilterEpic("all");
                    setFilterStage("all");
                    setFilterWorkstream("");
                    setFilterWeek("all");
                    setFilterUnresourced(false);
                  }}
                  variant="outline"
                  size="sm"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>

          {showResourceSummary && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Resource Summary</CardTitle>
                <CardDescription>Total hours and costs by resource</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const resourceSummary = lineItems.reduce((acc: any, item) => {
                      const resource = item.resourceName || "Unassigned";
                      if (!acc[resource]) {
                        acc[resource] = {
                          hours: 0,
                          chargeAmount: 0,
                          costAmount: 0,
                          margin: 0,
                          count: 0
                        };
                      }
                      acc[resource].hours += Number(item.adjustedHours || 0);
                      acc[resource].chargeAmount += Number(item.totalAmount || 0);
                      acc[resource].costAmount += Number(item.totalCost || 0);
                      acc[resource].margin += Number(item.margin || 0);
                      acc[resource].count += 1;
                      return acc;
                    }, {});

                    return Object.entries(resourceSummary).map(([resource, data]: [string, any]) => (
                      <div key={resource} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">{resource}</div>
                          <div className="text-sm text-muted-foreground">{data.count} items</div>
                        </div>
                        <div className="flex gap-6 text-sm">
                          <div>
                            <div className="text-muted-foreground">Hours</div>
                            <div className="font-medium">{data.hours.toFixed(1)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Charge</div>
                            <div className="font-medium">${data.chargeAmount.toFixed(0)}</div>
                          </div>
                          {user?.role === "admin" || user?.role === "executive" ? (
                            <>
                              <div>
                                <div className="text-muted-foreground">Cost</div>
                                <div className="font-medium">${data.costAmount.toFixed(0)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Margin</div>
                                <div className="font-medium text-green-600">
                                  ${data.margin.toFixed(0)} ({data.chargeAmount > 0 ? ((data.margin / data.chargeAmount) * 100).toFixed(1) : 0}%)
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedItems.size > 0 && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="font-medium">{selectedItems.size} items selected</span>
                <div className="flex gap-2">
                  <Button onClick={() => setBulkEditDialog(true)} size="sm">
                    Bulk Edit
                  </Button>
                  <Button onClick={() => setApplyStaffRatesDialog(true)} size="sm" variant="outline">
                    Assign Roles/Staff
                  </Button>
                  <Button 
                    onClick={() => setSelectedItems(new Set())} 
                    variant="outline" 
                    size="sm"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={lineItems.length > 0 && selectedItems.size === lineItems.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems(new Set(lineItems.map(item => item.id)));
                        } else {
                          setSelectedItems(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Epic</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Workstream</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Factor</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Adjustments</TableHead>
                  <TableHead>Adj. Hours</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Margin</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (lineItems || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center">
                      No line items yet
                    </TableCell>
                  </TableRow>
                ) : (
                  // Filter line items based on current filters
                  lineItems.filter((item: EstimateLineItem) => {
                    const matchesText = !filterText || item.description.toLowerCase().includes(filterText.toLowerCase());
                    const matchesEpic = filterEpic === "all" || 
                      (filterEpic === "none" && (!item.epicId || item.epicId === "none")) ||
                      item.epicId === filterEpic;
                    const matchesStage = filterStage === "all" || 
                      (filterStage === "none" && (!item.stageId || item.stageId === "none")) ||
                      item.stageId === filterStage;
                    const matchesWorkstream = !filterWorkstream || 
                      (item.workstream && item.workstream.toLowerCase().includes(filterWorkstream.toLowerCase()));
                    const matchesWeek = filterWeek === "all" || item.week?.toString() === filterWeek;
                    const matchesUnresourced = !filterUnresourced || (!item.assignedUserId && !item.roleId);
                    
                    return matchesText && matchesEpic && matchesStage && matchesWorkstream && matchesWeek && matchesUnresourced;
                  }).map((item: EstimateLineItem) => {
                    const epic = epics.find(e => e.id === item.epicId);
                    const stage = stages.find(s => s.id === item.stageId);
                    return (
                    <TableRow key={item.id} className={selectedItems.has(item.id) ? "bg-blue-50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedItems);
                            if (e.target.checked) {
                              newSelected.add(item.id);
                            } else {
                              newSelected.delete(item.id);
                            }
                            setSelectedItems(newSelected);
                          }}
                        />
                      </TableCell>
                      <TableCell>{epic?.name || "-"}</TableCell>
                      <TableCell>{stage?.name || "-"}</TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            value={item.workstream || ""}
                            onChange={(e) => handleUpdateItem(item, "workstream", e.target.value)}
                            onBlur={() => setEditingItem(null)}
                            placeholder="Workstream"
                          />
                        ) : (
                          <span onClick={() => setEditingItem(item.id)} className="cursor-pointer">
                            {item.workstream || "-"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{item.week || "-"}</TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            value={item.description}
                            onChange={(e) => handleUpdateItem(item, "description", e.target.value)}
                            onBlur={() => setEditingItem(null)}
                          />
                        ) : (
                          <span onClick={() => setEditingItem(item.id)} className="cursor-pointer">
                            {item.description}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            type="number"
                            value={item.baseHours}
                            onChange={(e) => handleUpdateItem(item, "baseHours", e.target.value)}
                            onBlur={() => setEditingItem(null)}
                            className="w-20"
                          />
                        ) : (
                          <span onClick={() => setEditingItem(item.id)} className="cursor-pointer">
                            {Math.round(Number(item.baseHours))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            type="number"
                            value={item.factor || 1}
                            onChange={(e) => handleUpdateItem(item, "factor", e.target.value)}
                            onBlur={() => setEditingItem(null)}
                            className="w-20"
                          />
                        ) : (
                          <span onClick={() => setEditingItem(item.id)} className="cursor-pointer">
                            {Math.round(Number(item.factor || 1))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Select 
                            value={item.assignedUserId || (item.roleId ? `role-${item.roleId}` : "unassigned")} 
                            onValueChange={(value) => {
                              if (value === "unassigned") {
                                // Clear assignment
                                const updatedItem = { 
                                  ...item, 
                                  assignedUserId: null,
                                  roleId: null,
                                  resourceName: "" 
                                };
                                const baseHours = Number(updatedItem.baseHours);
                                const factor = Number(updatedItem.factor) || 1;
                                const rate = Number(updatedItem.rate);
                                const { adjustedHours, totalAmount } = calculateAdjustedValues(
                                  baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
                                );
                                
                                updateLineItemMutation.mutate({
                                  itemId: item.id,
                                  data: {
                                    assignedUserId: null,
                                    roleId: null,
                                    resourceName: "",
                                    adjustedHours: adjustedHours.toFixed(2),
                                    totalAmount: totalAmount.toFixed(2)
                                  }
                                });
                              } else if (value.startsWith("role-")) {
                                // Generic role selected
                                const roleId = value.substring(5);
                                const selectedRole = roles.find((r: any) => r.id === roleId);
                                if (selectedRole) {
                                  const updatedItem = { 
                                    ...item, 
                                    assignedUserId: null,
                                    roleId: selectedRole.id, 
                                    resourceName: selectedRole.name,
                                    rate: selectedRole.defaultRackRate
                                  };
                                  const baseHours = Number(updatedItem.baseHours);
                                  const factor = Number(updatedItem.factor) || 1;
                                  const rate = Number(selectedRole.defaultRackRate);
                                  const { adjustedHours, totalAmount } = calculateAdjustedValues(
                                    baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
                                  );
                                  
                                  updateLineItemMutation.mutate({
                                    itemId: item.id,
                                    data: {
                                      assignedUserId: null,
                                      roleId: selectedRole.id,
                                      resourceName: selectedRole.name,
                                      rate: selectedRole.defaultRackRate,
                                      adjustedHours: adjustedHours.toFixed(2),
                                      totalAmount: totalAmount.toFixed(2)
                                    }
                                  });
                                }
                              } else {
                                // Specific user selected
                                const selectedUser = assignableUsers.find((u: any) => u.id === value);
                                if (selectedUser) {
                                  const updatedItem = { 
                                    ...item, 
                                    assignedUserId: selectedUser.id,
                                    roleId: null,
                                    resourceName: selectedUser.name,
                                    rate: selectedUser.defaultChargeRate,
                                    costRate: selectedUser.defaultCostRate
                                  };
                                  const baseHours = Number(updatedItem.baseHours);
                                  const factor = Number(updatedItem.factor) || 1;
                                  const rate = Number(selectedUser.defaultChargeRate);
                                  const { adjustedHours, totalAmount } = calculateAdjustedValues(
                                    baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
                                  );
                                  
                                  updateLineItemMutation.mutate({
                                    itemId: item.id,
                                    data: {
                                      assignedUserId: selectedUser.id,
                                      roleId: null,
                                      resourceName: selectedUser.name,
                                      rate: selectedUser.defaultChargeRate,
                                      costRate: selectedUser.defaultCostRate,
                                      adjustedHours: adjustedHours.toFixed(2),
                                      totalAmount: totalAmount.toFixed(2)
                                    }
                                  });
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Generic Roles</div>
                              {roles.map((role: any) => (
                                <SelectItem key={`role-${role.id}`} value={`role-${role.id}`}>
                                  {role.name} (Role)
                                </SelectItem>
                              ))}
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Specific Staff</div>
                              {assignableUsers.map((member: any) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span 
                            className={!item.assignedUserId ? "text-orange-500 font-medium cursor-pointer" : "cursor-pointer"}
                            onClick={() => setEditingItem(item.id)}
                          >
                            {item.resourceName || "Unassigned"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            type="number"
                            value={item.rate}
                            onChange={(e) => handleUpdateItem(item, "rate", e.target.value)}
                            onBlur={() => setEditingItem(null)}
                            className="w-24"
                          />
                        ) : (
                          <span onClick={() => setEditingItem(item.id)} className="cursor-pointer">
                            ${Math.round(Number(item.rate))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(user?.role === "admin" || user?.role === "executive") && item.costRate ? (
                          <span className="text-muted-foreground">
                            ${Math.round(Number(item.costRate))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <div className="space-y-1">
                            <Select value={item.size} onValueChange={(value) => handleUpdateItem(item, "size", value)}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="small">Small</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="large">Large</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={item.complexity} onValueChange={(value) => handleUpdateItem(item, "complexity", value)}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="small">Simple</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="large">Complex</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={item.confidence} onValueChange={(value) => handleUpdateItem(item, "confidence", value)}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="text-xs cursor-pointer" onClick={() => setEditingItem(item.id)}>
                            S:{item.size[0].toUpperCase()},
                            C:{item.complexity[0].toUpperCase()},
                            Cf:{item.confidence[0].toUpperCase()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{Math.round(Number(item.adjustedHours))}</TableCell>
                      <TableCell>${Math.round(Number(item.totalAmount)).toLocaleString()}</TableCell>
                      <TableCell>
                        {(user?.role === "admin" || user?.role === "executive") && item.margin ? (
                          <span className={Number(item.marginPercent) > 0 ? "text-green-600" : "text-red-600"}>
                            ${Math.round(Number(item.margin))} ({Number(item.marginPercent).toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            value={item.comments || ""}
                            onChange={(e) => handleUpdateItem(item, "comments", e.target.value)}
                            onBlur={() => setEditingItem(null)}
                            placeholder="Comments"
                          />
                        ) : (
                          <span onClick={() => setEditingItem(item.id)} className="cursor-pointer">
                            {item.comments || "-"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLineItemMutation.mutate(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )})
                )}
              </TableBody>
            </Table>
          </div>

          {/* Week Subtotals */}
          {(() => {
            const weekTotals = lineItems.filter((item: EstimateLineItem) => {
              const matchesText = !filterText || item.description.toLowerCase().includes(filterText.toLowerCase());
              const matchesEpic = filterEpic === "all" || 
                (filterEpic === "none" && (!item.epicId || item.epicId === "none")) ||
                item.epicId === filterEpic;
              const matchesStage = filterStage === "all" || 
                (filterStage === "none" && (!item.stageId || item.stageId === "none")) ||
                item.stageId === filterStage;
              const matchesWorkstream = !filterWorkstream || 
                (item.workstream && item.workstream.toLowerCase().includes(filterWorkstream.toLowerCase()));
              const matchesWeek = filterWeek === "all" || item.week?.toString() === filterWeek;
              const matchesUnresourced = !filterUnresourced || (!item.assignedUserId && !item.roleId);
              
              return matchesText && matchesEpic && matchesStage && matchesWorkstream && matchesWeek && matchesUnresourced;
            }).reduce((acc: any, item) => {
              const week = item.week || "Unassigned";
              if (!acc[week]) {
                acc[week] = { hours: 0, amount: 0, count: 0 };
              }
              acc[week].hours += Number(item.adjustedHours);
              acc[week].amount += Number(item.totalAmount);
              acc[week].count += 1;
              return acc;
            }, {});

            const sortedWeeks = Object.entries(weekTotals)
              .sort(([a], [b]) => {
                if (a === "Unassigned") return 1;
                if (b === "Unassigned") return -1;
                return Number(a) - Number(b);
              });

            if (sortedWeeks.length > 1 || (sortedWeeks.length === 1 && filterWeek === "all")) {
              return (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Subtotals by Week</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedWeeks.map(([week, data]: [string, any]) => (
                      <div key={week} className="flex justify-between p-2 bg-white rounded border">
                        <span className="font-medium">
                          {week === "Unassigned" ? "No Week" : `Week ${week}`}
                        </span>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">
                            {Math.round(data.hours)} hrs ({data.count} items)
                          </div>
                          <div className="font-semibold">
                            ${Math.round(data.amount).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="mt-4 flex justify-end">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                Total Hours: {Math.round(totalHours)}
              </div>
              <div className="text-lg font-semibold">
                Total Amount: ${Math.round(totalAmount).toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
      )}

    {/* Epic Creation Dialog */}
    <Dialog open={showEpicDialog} onOpenChange={setShowEpicDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Epic</DialogTitle>
          <DialogDescription>
            Add a new epic to organize your estimate line items
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="epic-name">Epic Name</Label>
            <Input
              id="epic-name"
              value={newEpicName}
              onChange={(e) => setNewEpicName(e.target.value)}
              placeholder="Enter epic name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEpicDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (newEpicName.trim()) {
                createEpicMutation.mutate({ name: newEpicName.trim() });
              }
            }}
            disabled={!newEpicName.trim() || createEpicMutation.isPending}
          >
            {createEpicMutation.isPending ? "Creating..." : "Create Epic"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Stage Creation Dialog */}
    <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Stage</DialogTitle>
          <DialogDescription>
            Add a new stage to an epic
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="stage-epic">Select Epic</Label>
            <Select value={selectedEpicForStage} onValueChange={setSelectedEpicForStage}>
              <SelectTrigger>
                <SelectValue placeholder="Select an epic" />
              </SelectTrigger>
              <SelectContent>
                {epics.filter(epic => epic.id && epic.id !== "").map((epic) => (
                  <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="stage-name">Stage Name</Label>
            <Input
              id="stage-name"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Enter stage name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowStageDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (selectedEpicForStage && newStageName.trim()) {
                createStageMutation.mutate({ 
                  epicId: selectedEpicForStage, 
                  name: newStageName.trim() 
                });
              }
            }}
            disabled={!selectedEpicForStage || !newStageName.trim() || createStageMutation.isPending}
          >
            {createStageMutation.isPending ? "Creating..." : "Create Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Milestone Creation Dialog */}
    <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Milestone Payment</DialogTitle>
          <DialogDescription>
            Define a payment milestone for the customer
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="milestone-name">Name</Label>
            <Input
              id="milestone-name"
              placeholder="e.g., Project Kickoff, Phase 1 Completion"
              value={newMilestone.name}
              onChange={(e) => setNewMilestone({ ...newMilestone, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="milestone-description">Description</Label>
            <Input
              id="milestone-description"
              placeholder="Optional description"
              value={newMilestone.description}
              onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="milestone-amount">Fixed Amount ($)</Label>
              <Input
                id="milestone-amount"
                type="number"
                placeholder="0.00"
                value={newMilestone.amount}
                onChange={(e) => setNewMilestone({ ...newMilestone, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="milestone-percentage">Or Percentage (%)</Label>
              <Input
                id="milestone-percentage"
                type="number"
                placeholder="0"
                value={newMilestone.percentage}
                onChange={(e) => setNewMilestone({ ...newMilestone, percentage: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="milestone-due">Due Date</Label>
            <Input
              id="milestone-due"
              type="date"
              value={newMilestone.dueDate}
              onChange={(e) => setNewMilestone({ ...newMilestone, dueDate: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowMilestoneDialog(false);
              setNewMilestone({ name: "", description: "", amount: "", percentage: "", dueDate: "" });
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Calculate sort order based on existing milestones
              const sortOrder = milestones.length + 1;
              
              createMilestoneMutation.mutate({
                name: newMilestone.name,
                description: newMilestone.description || null,
                amount: newMilestone.amount ? parseFloat(newMilestone.amount) : null,
                percentage: newMilestone.percentage ? parseFloat(newMilestone.percentage) : null,
                dueDate: newMilestone.dueDate || null,
                sortOrder
              });
            }}
            disabled={
              !newMilestone.name?.trim() || 
              ((!newMilestone.amount?.trim()) && (!newMilestone.percentage?.trim())) || 
              (!!newMilestone.amount?.trim() && !!newMilestone.percentage?.trim()) || 
              createMilestoneMutation.isPending
            }
          >
            {createMilestoneMutation.isPending ? "Creating..." : "Add Milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Milestone Edit Dialog */}
    <Dialog open={showMilestoneEditDialog} onOpenChange={setShowMilestoneEditDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Milestone Payment</DialogTitle>
          <DialogDescription>
            Update the milestone payment details
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-milestone-name">Name</Label>
            <Input
              id="edit-milestone-name"
              placeholder="e.g., Project Kickoff, Phase 1 Completion"
              value={editingMilestone?.name || ""}
              onChange={(e) => setEditingMilestone({ ...editingMilestone, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="edit-milestone-description">Description</Label>
            <Input
              id="edit-milestone-description"
              placeholder="Optional description"
              value={editingMilestone?.description || ""}
              onChange={(e) => setEditingMilestone({ ...editingMilestone, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-milestone-amount">Fixed Amount ($)</Label>
              <Input
                id="edit-milestone-amount"
                type="number"
                placeholder="0.00"
                value={editingMilestone?.amount || ""}
                onChange={(e) => setEditingMilestone({ ...editingMilestone, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-milestone-percentage">Or Percentage (%)</Label>
              <Input
                id="edit-milestone-percentage"
                type="number"
                placeholder="0"
                value={editingMilestone?.percentage || ""}
                onChange={(e) => setEditingMilestone({ ...editingMilestone, percentage: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-milestone-due">Due Date</Label>
            <Input
              id="edit-milestone-due"
              type="date"
              value={editingMilestone?.dueDate || ""}
              onChange={(e) => setEditingMilestone({ ...editingMilestone, dueDate: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowMilestoneEditDialog(false);
              setEditingMilestone(null);
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              updateMilestoneMutation.mutate({
                milestoneId: editingMilestone.id,
                data: {
                  name: editingMilestone.name,
                  description: editingMilestone.description || null,
                  amount: editingMilestone.amount ? parseFloat(editingMilestone.amount) : null,
                  percentage: editingMilestone.percentage ? parseFloat(editingMilestone.percentage) : null,
                  dueDate: editingMilestone.dueDate || null
                }
              });
              setShowMilestoneEditDialog(false);
              setEditingMilestone(null);
            }}
            disabled={!editingMilestone?.name || (!editingMilestone?.amount && !editingMilestone?.percentage) || !!(editingMilestone?.amount && editingMilestone?.percentage) || updateMilestoneMutation.isPending}
          >
            {updateMilestoneMutation.isPending ? "Updating..." : "Update Milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Bulk Edit Dialog */}
    <Dialog open={bulkEditDialog} onOpenChange={setBulkEditDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Edit Line Items</DialogTitle>
          <DialogDescription>
            Edit {selectedItems.size} selected line items. Only fields with values will be updated.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-epic">Epic</Label>
              <Select value={bulkEditData.epicId} onValueChange={(value) => setBulkEditData({...bulkEditData, epicId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Epic</SelectItem>
                  {epics.map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-stage">Stage</Label>
              <Select value={bulkEditData.stageId} onValueChange={(value) => setBulkEditData({...bulkEditData, stageId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Stage</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-workstream">Workstream</Label>
              <Input
                id="bulk-workstream"
                placeholder="Keep current values"
                value={bulkEditData.workstream}
                onChange={(e) => setBulkEditData({...bulkEditData, workstream: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-week">Week</Label>
              <Input
                id="bulk-week"
                type="number"
                placeholder="Keep current values"
                value={bulkEditData.week}
                onChange={(e) => setBulkEditData({...bulkEditData, week: e.target.value})}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-size">Size</Label>
              <Select value={bulkEditData.size} onValueChange={(value) => setBulkEditData({...bulkEditData, size: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-complexity">Complexity</Label>
              <Select value={bulkEditData.complexity} onValueChange={(value) => setBulkEditData({...bulkEditData, complexity: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Simple</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Complex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-confidence">Confidence</Label>
              <Select value={bulkEditData.confidence} onValueChange={(value) => setBulkEditData({...bulkEditData, confidence: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-rate">Rate ($)</Label>
              <Input
                id="bulk-rate"
                type="number"
                placeholder="Keep current values"
                value={bulkEditData.rate}
                onChange={(e) => setBulkEditData({...bulkEditData, rate: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              {/* Category field hidden per requirements */}
              <Label htmlFor="bulk-workstream">Workstream</Label>
              <Input
                id="bulk-workstream"
                placeholder="Keep current values"
                value={bulkEditData.workstream}
                onChange={(e) => setBulkEditData({...bulkEditData, workstream: e.target.value})}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBulkEditDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const updates: any = {};
              if (bulkEditData.epicId) {
                updates.epicId = bulkEditData.epicId === "none" ? null : bulkEditData.epicId;
              }
              if (bulkEditData.stageId) {
                updates.stageId = bulkEditData.stageId === "none" ? null : bulkEditData.stageId;
              }
              if (bulkEditData.workstream) updates.workstream = bulkEditData.workstream;
              if (bulkEditData.week) updates.week = parseInt(bulkEditData.week);
              if (bulkEditData.size) updates.size = bulkEditData.size;
              if (bulkEditData.complexity) updates.complexity = bulkEditData.complexity;
              if (bulkEditData.confidence) updates.confidence = bulkEditData.confidence;
              if (bulkEditData.rate) updates.rate = bulkEditData.rate;
              // Category field hidden per requirements
              
              if (Object.keys(updates).length > 0) {
                bulkUpdateMutation.mutate({
                  itemIds: Array.from(selectedItems),
                  updates
                });
              }
            }}
            disabled={bulkUpdateMutation.isPending || Object.values(bulkEditData).every(v => !v)}
          >
            {bulkUpdateMutation.isPending ? "Updating..." : "Update Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Assign Roles/Staff Dialog */}
    <Dialog open={applyStaffRatesDialog} onOpenChange={setApplyStaffRatesDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Roles/Staff</DialogTitle>
          <DialogDescription>
            Select a role or staff member to assign to {selectedItems.size} selected line items.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="resource">Resource Assignment</Label>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Select role or staff member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Generic Roles</div>
                {roles.map((role: any) => (
                  <SelectItem key={`role-${role.id}`} value={`role-${role.id}`}>
                    {role.name} (${role.defaultChargeRate}/hr)
                  </SelectItem>
                ))}
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Specific Staff</div>
                {users.filter((user: any) => user.isAssignable).map((member: any) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} - {member.role} (${member.defaultChargeRate}/hr)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setApplyStaffRatesDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedStaffId) {
                let updates: any = {};
                
                if (selectedStaffId === "unassigned") {
                  updates = {
                    assignedUserId: null,
                    roleId: null,
                    resourceName: null,
                    rate: "0",
                    costRate: "0"
                  };
                } else if (selectedStaffId.startsWith("role-")) {
                  const roleId = selectedStaffId.substring(5);
                  const selectedRole = roles.find((r: any) => r.id === roleId);
                  if (selectedRole) {
                    updates = {
                      assignedUserId: null,
                      roleId: selectedRole.id,
                      resourceName: selectedRole.name,
                      rate: selectedRole.defaultChargeRate?.toString() || "0",
                      costRate: selectedRole.defaultCostRate?.toString() || "0"
                    };
                  }
                } else {
                  const selectedStaff = users.find((s: any) => s.id === selectedStaffId);
                  if (selectedStaff) {
                    updates = {
                      assignedUserId: selectedStaff.id,
                      roleId: null,
                      resourceName: selectedStaff.name,
                      rate: selectedStaff.defaultChargeRate?.toString() || "0",
                      costRate: selectedStaff.defaultCostRate?.toString() || "0"
                    };
                  }
                }
                
                if (Object.keys(updates).length > 0) {
                  bulkUpdateMutation.mutate({
                    itemIds: Array.from(selectedItems),
                    updates
                  });
                  setApplyStaffRatesDialog(false);
                  setSelectedStaffId("");
                }
              }
            }}
            disabled={!selectedStaffId || bulkUpdateMutation.isPending}
          >
            {bulkUpdateMutation.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </div>
    </div>
    </Layout>
  );
}