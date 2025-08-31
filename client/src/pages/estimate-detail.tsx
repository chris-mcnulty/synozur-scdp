import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Download, Upload, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EstimateLineItem } from "@shared/schema";

export default function EstimateDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    description: "",
    category: "",
    baseHours: "",
    rate: "",
    size: "small",
    complexity: "small",
    confidence: "high"
  });

  const { data: estimate } = useQuery({
    queryKey: [`/api/estimates/${id}`],
    enabled: !!id,
  });

  const { data: lineItems = [], isLoading } = useQuery({
    queryKey: [`/api/estimates/${id}/line-items`],
    enabled: !!id,
  });

  const createLineItemMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/estimates/${id}/line-items`, {
      method: "POST",
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/estimates/${id}/line-items`] });
      setNewItem({
        description: "",
        category: "",
        baseHours: "",
        rate: "",
        size: "small",
        complexity: "small",
        confidence: "high"
      });
      toast({ title: "Line item added successfully" });
    }
  });

  const updateLineItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: any }) => 
      apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/estimates/${id}/line-items`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/estimates/${id}/line-items`] });
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
    const baseHours = Number(newItem.baseHours);
    const rate = Number(newItem.rate);
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, rate, newItem.size, newItem.complexity, newItem.confidence
    );
    
    createLineItemMutation.mutate({
      ...newItem,
      baseHours: baseHours.toString(),
      rate: rate.toString(),
      adjustedHours: adjustedHours.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      sortOrder: lineItems.length
    });
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
        queryClient.invalidateQueries({ queryKey: [`/api/estimates/${id}/line-items`] });
      } catch (error) {
        toast({ title: "Failed to import Excel file", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  const totalHours = lineItems.reduce((sum: number, item: EstimateLineItem) => 
    sum + Number(item.adjustedHours), 0);
  const totalAmount = lineItems.reduce((sum: number, item: EstimateLineItem) => 
    sum + Number(item.totalAmount), 0);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/estimates")}
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
          <div className="mb-4 grid grid-cols-8 gap-2">
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
            <Input
              placeholder="Hours"
              type="number"
              value={newItem.baseHours}
              onChange={(e) => setNewItem({ ...newItem, baseHours: e.target.value })}
              className="w-full"
            />
            <Input
              placeholder="Rate"
              type="number"
              value={newItem.rate}
              onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
              className="w-full"
            />
            <Select
              value={newItem.size}
              onValueChange={(value) => setNewItem({ ...newItem, size: value })}
            >
              <SelectTrigger>
                <SelectValue />
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
                <SelectValue />
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
          <Button
            onClick={handleAddItem}
            disabled={!newItem.description || !newItem.baseHours || !newItem.rate}
            className="mb-4"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Line Item
          </Button>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Base Hours</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Complexity</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Adj. Hours</TableHead>
                  <TableHead>Total</TableHead>
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
                ) : lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center">
                      No line items yet
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map((item: EstimateLineItem) => (
                    <TableRow key={item.id}>
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
                        <Select
                          value={item.size}
                          onValueChange={(value) => handleUpdateItem(item, "size", value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.complexity}
                          onValueChange={(value) => handleUpdateItem(item, "complexity", value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.confidence}
                          onValueChange={(value) => handleUpdateItem(item, "confidence", value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{Number(item.adjustedHours).toFixed(2)}</TableCell>
                      <TableCell>${Number(item.totalAmount).toFixed(2)}</TableCell>
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
                  ))
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
  );
}