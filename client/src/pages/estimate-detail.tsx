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
  const [newItem, setNewItem] = useState({
    description: "",
    category: "",
    epicId: "none",
    stageId: "none",
    workstream: "",
    week: "",
    baseHours: "",
    factor: "1",
    rate: "0",
    size: "small",
    complexity: "small",
    confidence: "high",
    comments: ""
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
        category: "",
        epicId: "none",
        stageId: "none",
        workstream: "",
        week: "",
        baseHours: "",
        factor: "1",
        rate: "0",
        size: "small",
        complexity: "small",
        confidence: "high",
        comments: ""
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
      category: newItem.category || "",
      epicId: newItem.epicId === "none" ? null : newItem.epicId,
      stageId: newItem.stageId === "none" ? null : newItem.stageId,
      workstream: newItem.workstream || null,
      week: newItem.week ? Number(newItem.week) : null,
      baseHours: baseHours.toString(),
      factor: factor.toString(),
      rate: rate.toString(),
      size: newItem.size,
      complexity: newItem.complexity,
      confidence: newItem.confidence,
      comments: newItem.comments || null,
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
            <p className="text-muted-foreground">
              {estimate?.name} - Version {estimate?.version}
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

      <Card className="mb-6">
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
              <Input
                placeholder="Category"
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
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
          <div className="grid grid-cols-1 gap-2">
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

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Epic</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Workstream</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Factor</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Adjustments</TableHead>
                  <TableHead>Adj. Hours</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (lineItems || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center">
                      No line items yet
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map((item: EstimateLineItem) => {
                    const epic = epics.find(e => e.id === item.epicId);
                    const stage = stages.find(s => s.id === item.stageId);
                    return (
                    <TableRow key={item.id}>
                      <TableCell>{epic?.name || "-"}</TableCell>
                      <TableCell>{stage?.name || "-"}</TableCell>
                      <TableCell>{item.workstream || "-"}</TableCell>
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
                      <TableCell>{item.category || "-"}</TableCell>
                      <TableCell>{item.baseHours}</TableCell>
                      <TableCell>{item.factor || 1}</TableCell>
                      <TableCell>${item.rate}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          S:{item.size[0].toUpperCase()},
                          C:{item.complexity[0].toUpperCase()},
                          Cf:{item.confidence[0].toUpperCase()}
                        </div>
                      </TableCell>
                      <TableCell>{Number(item.adjustedHours).toFixed(2)}</TableCell>
                      <TableCell>${Number(item.totalAmount).toFixed(2)}</TableCell>
                      <TableCell>{item.comments || "-"}</TableCell>
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

          <div className="mt-4 flex justify-end">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                Total Hours: {totalHours.toFixed(2)}
              </div>
              <div className="text-lg font-semibold">
                Total Amount: ${totalAmount.toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estimate Outputs Card */}
      <Card>
        <CardHeader>
          <CardTitle>Estimate Outputs</CardTitle>
          <CardDescription>
            Customer-facing totals and milestone payment schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Presented Total and Margin */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="presented-total">Presented Total</Label>
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
                  }
                }}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Internal Total: ${totalAmount.toFixed(2)}
              </p>
            </div>
            <div>
              <Label htmlFor="margin">Margin (%)</Label>
              <Input
                id="margin"
                type="number"
                placeholder="Auto-calculated"
                value={margin || (estimate?.presentedTotal ? ((totalAmount - Number(estimate.presentedTotal)) / totalAmount * 100).toFixed(2) : "")}
                readOnly
                className="mt-1 bg-muted"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Difference: ${presentedTotal ? (totalAmount - parseFloat(presentedTotal)).toFixed(2) : "N/A"}
              </p>
            </div>
          </div>

          {/* Milestone Payments */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Milestone Payments</h3>
              <Button onClick={() => setShowMilestoneDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Milestone
              </Button>
            </div>

            {milestones.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No milestone payments defined. Click "Add Milestone" to create payment milestones.
              </div>
            ) : (
              <div className="space-y-2">
                {milestones.map((milestone) => {
                  const percentageAmount = milestone.percentage 
                    ? (parseFloat(presentedTotal || estimate?.presentedTotal || "0") * Number(milestone.percentage) / 100).toFixed(2)
                    : "0.00";
                  
                  return (
                    <div key={milestone.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">{milestone.name}</div>
                          {milestone.description && (
                            <div className="text-sm text-muted-foreground">{milestone.description}</div>
                          )}
                          {milestone.dueDate && (
                            <div className="text-sm text-muted-foreground">
                              Due: {new Date(milestone.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-semibold">
                            ${Number(milestone.amount) || percentageAmount}
                          </div>
                          {milestone.percentage && (
                            <div className="text-sm text-muted-foreground">
                              {milestone.percentage}%
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingMilestone({
                                id: milestone.id,
                                name: milestone.name,
                                description: milestone.description || "",
                                amount: milestone.amount?.toString() || "",
                                percentage: milestone.percentage?.toString() || "",
                                dueDate: milestone.dueDate || ""
                              });
                              setShowMilestoneEditDialog(true);
                            }}
                            data-testid={`button-edit-milestone-${milestone.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                            data-testid={`button-delete-milestone-${milestone.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Milestone Summary */}
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  {(() => {
                    const milestoneTotal = milestones.reduce((sum, m) => {
                      const amount = Number(m.amount) || (m.percentage && presentedTotal ? parseFloat(presentedTotal) * Number(m.percentage) / 100 : 0);
                      return sum + Number(amount);
                    }, 0);
                    const currentPresentedTotal = parseFloat(presentedTotal || estimate?.presentedTotal || "0");
                    const difference = milestoneTotal - currentPresentedTotal;
                    const isBalanced = Math.abs(difference) < 0.01; // Allow for small rounding differences
                    
                    return (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Total Milestone Payments:</span>
                          <span className="font-semibold">
                            ${milestoneTotal.toFixed(2)}
                          </span>
                        </div>
                        {currentPresentedTotal > 0 && (
                          <div className="space-y-1 mt-2">
                            <div className="text-sm text-muted-foreground">
                              Presented Total: ${currentPresentedTotal.toFixed(2)}
                            </div>
                            <div className={`text-sm font-medium ${isBalanced ? 'text-green-600 dark:text-green-400' : difference > 0 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>
                              {isBalanced ? (
                                <span data-testid="milestone-validation-balanced">✓ Milestones match presented total</span>
                              ) : (
                                <span data-testid="milestone-validation-unbalanced">
                                  ⚠ {difference > 0 ? 'Over' : 'Under'} by ${Math.abs(difference).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>

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
            disabled={!newMilestone.name || (!newMilestone.amount && !newMilestone.percentage) || !!(newMilestone.amount && newMilestone.percentage) || createMilestoneMutation.isPending}
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

    </Layout>
  );
}