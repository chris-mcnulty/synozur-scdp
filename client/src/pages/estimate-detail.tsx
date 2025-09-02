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
import { ArrowLeft, Plus, Trash2, Download, Upload, Save, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EstimateLineItem, Estimate, EstimateEpic, EstimateStage } from "@shared/schema";

export default function EstimateDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  
  console.log("[EstimateDetail] Component mounted with ID:", id);
  console.log("[EstimateDetail] SessionId:", localStorage.getItem("sessionId"));
  const [newItem, setNewItem] = useState({
    description: "",
    category: "",
    epicId: "none",
    stageId: "none",
    workstream: "",
    week: "",
    baseHours: "",
    rate: "",
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

  console.log("[EstimateDetail] Estimate query result:", { 
    loading: estimateLoading, 
    error: estimateError, 
    hasData: !!estimate 
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
  
  // Log all errors
  if (estimateError) console.error("[EstimateDetail] Estimate error:", estimateError);
  if (lineItemsError) console.error("[EstimateDetail] Line items error:", lineItemsError);
  if (epicsError) console.error("[EstimateDetail] Epics error:", epicsError);
  if (stagesError) console.error("[EstimateDetail] Stages error:", stagesError);

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("Sending line item creation request:", data);
      const sessionId = localStorage.getItem("sessionId");
      console.log("Using sessionId:", sessionId);
      
      if (!sessionId) {
        throw new Error("No session ID found. Please log in again.");
      }
      
      return apiRequest(`/api/estimates/${id}/line-items`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (response) => {
      console.log("Line item created successfully:", response);
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setNewItem({
        description: "",
        category: "",
        epicId: "none",
        stageId: "none",
        workstream: "",
        week: "",
        baseHours: "",
        rate: "",
        size: "small",
        complexity: "small",
        confidence: "high",
        comments: ""
      });
      toast({ title: "Line item added successfully" });
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

  const calculateAdjustedValues = (baseHours: number, rate: number, size: string, complexity: string, confidence: string) => {
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
    
    const adjustedHours = baseHours * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
    const totalAmount = adjustedHours * rate;
    
    return { adjustedHours, totalAmount };
  };

  const handleAddItem = () => {
    console.log("Adding line item with data:", newItem);
    
    const baseHours = Number(newItem.baseHours);
    const rate = Number(newItem.rate);
    
    if (isNaN(baseHours) || isNaN(rate)) {
      toast({
        title: "Invalid input",
        description: "Please enter valid numbers for hours and rate",
        variant: "destructive"
      });
      return;
    }
    
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, rate, newItem.size, newItem.complexity, newItem.confidence
    );
    
    const lineItemData = {
      ...newItem,
      epicId: newItem.epicId === "none" ? null : newItem.epicId,
      stageId: newItem.stageId === "none" ? null : newItem.stageId,
      baseHours: baseHours.toString(),
      rate: rate.toString(),
      adjustedHours: adjustedHours.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      sortOrder: lineItems?.length || 0
    };
    
    console.log("Sending line item data:", lineItemData);
    createLineItemMutation.mutate(lineItemData);
  };

  const handleUpdateItem = (item: EstimateLineItem, field: string, value: any) => {
    const updatedItem = { ...item, [field]: value };
    const baseHours = Number(updatedItem.baseHours);
    const rate = Number(updatedItem.rate);
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
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

  // Try-catch wrapper for debugging
  try {
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
      console.error("[EstimateDetail] Rendering error state:", errorMessage);
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
          <CardTitle>Line Items</CardTitle>
          <CardDescription>
            Add and manage estimate line items with size, complexity, and confidence factors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-6 gap-2">
              <Select
                value={newItem.epicId}
                onValueChange={(value) => setNewItem({ ...newItem, epicId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Epic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {epics.map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={newItem.stageId}
                onValueChange={(value) => setNewItem({ ...newItem, stageId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                placeholder="Rate"
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
            {createLineItemMutation.isPending ? "Adding..." : "Add Line Item"}
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
                  <TableHead>Rate</TableHead>
                  <TableHead>Factors</TableHead>
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
    </div>
    </Layout>
  );
  } catch (error) {
    console.error("[EstimateDetail] Component render error:", error);
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Unexpected Error</h2>
                <p className="text-muted-foreground mb-4">Something went wrong while loading this page.</p>
                <p className="text-sm text-red-500 mb-4">{error instanceof Error ? error.message : "Unknown error"}</p>
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
}