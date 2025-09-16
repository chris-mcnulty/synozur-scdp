import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Calculator,
  AlertTriangle,
  FileText,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Info,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

type AllocationMethod = 
  | "pro_rata_amount"  // Distribute by original amounts
  | "pro_rata_hours"   // Distribute by hours/quantity
  | "flat"            // Equal distribution
  | "manual";         // Manual allocation per line

interface AggregateAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  currentTotal: number;
  lineCount: number;
  projectId?: string;
  onSuccess?: () => void;
  lines?: Array<{
    id: string;
    type: string;
    quantity?: string;
    rate?: string;
    amount: string;
    billedAmount?: string;
    description?: string;
    project: { id: string; name: string };
    client: { id: string; name: string };
  }>;
}

interface SOW {
  id: string;
  projectId: string;
  sowNumber: string;
  totalValue: number;
  signedDate?: string;
  description?: string;
  status: string;
}

const adjustmentFormSchema = z.object({
  targetAmount: z.number().positive("Target amount must be positive"),
  allocationMethod: z.enum(["pro_rata_amount", "pro_rata_hours", "flat", "manual"]),
  sowId: z.string().optional(),
  adjustmentReason: z.string().min(10, "Please provide a detailed reason (min 10 characters)"),
});

type AdjustmentFormData = z.infer<typeof adjustmentFormSchema>;

export function AggregateAdjustmentDialog({
  open,
  onOpenChange,
  batchId,
  currentTotal,
  lineCount,
  projectId,
  onSuccess,
  lines = [],
}: AggregateAdjustmentDialogProps) {
  const { toast } = useToast();
  const [previewData, setPreviewData] = useState<Array<{
    lineId: string;
    originalAmount: number;
    newAmount: number;
    variance: number;
    description: string;
  }>>([]);

  const form = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      targetAmount: currentTotal,
      allocationMethod: "pro_rata_amount",
      sowId: undefined,
      adjustmentReason: "",
    },
  });

  // Fetch SOWs if projectId is provided
  const { data: sows = [] } = useQuery<SOW[]>({
    queryKey: [`/api/sows`, { projectId }],
    enabled: !!projectId && open,
  });

  // Calculate preview when target amount or allocation method changes
  useEffect(() => {
    const targetAmount = form.watch("targetAmount");
    const allocationMethod = form.watch("allocationMethod");
    
    if (!targetAmount || !lines.length) {
      setPreviewData([]);
      return;
    }

    const variance = targetAmount - currentTotal;
    const adjustmentRatio = targetAmount / currentTotal;
    
    const preview = lines.map(line => {
      const originalAmount = parseFloat(line.billedAmount || line.amount);
      let newAmount = originalAmount;
      
      switch (allocationMethod) {
        case "pro_rata_amount":
          // Distribute proportionally based on original amounts
          newAmount = originalAmount * adjustmentRatio;
          break;
          
        case "pro_rata_hours":
          // Distribute proportionally based on hours/quantity
          const quantity = parseFloat(line.quantity || "1");
          const totalQuantity = lines.reduce((sum, l) => 
            sum + parseFloat(l.quantity || "1"), 0
          );
          const quantityRatio = quantity / totalQuantity;
          newAmount = targetAmount * quantityRatio;
          break;
          
        case "flat":
          // Equal distribution across all lines
          newAmount = targetAmount / lines.length;
          break;
          
        case "manual":
          // Keep original for now, will handle manual allocation separately
          newAmount = originalAmount;
          break;
      }
      
      return {
        lineId: line.id,
        originalAmount,
        newAmount: Math.max(0, newAmount), // Ensure non-negative
        variance: newAmount - originalAmount,
        description: line.description || `${line.type} item`,
      };
    });
    
    setPreviewData(preview);
  }, [form.watch("targetAmount"), form.watch("allocationMethod"), lines, currentTotal]);

  // Apply adjustment mutation
  const applyAdjustmentMutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      // Use the proper backend endpoint that correctly calculates adjustments
      return await apiRequest(`/api/invoice-batches/${batchId}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          targetAmount: data.targetAmount,
          method: data.allocationMethod,
          reason: data.adjustmentReason,
          sowId: data.sowId,
          projectId: projectId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/invoice-batches/${batchId}`] });
      toast({
        title: "Contract adjustment applied",
        description: `Invoice adjusted to match contract amount of $${form.getValues("targetAmount").toLocaleString()}`,
      });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to apply adjustment",
        description: error.message || "An error occurred while applying the adjustment",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: AdjustmentFormData) => {
    // Show confirmation for large variances
    const variancePercent = Math.abs((data.targetAmount - currentTotal) / currentTotal) * 100;
    if (variancePercent > 40) {
      if (!confirm(`This adjustment represents a ${variancePercent.toFixed(1)}% variance. Are you sure you want to proceed?`)) {
        return;
      }
    }
    
    applyAdjustmentMutation.mutate(data);
  };

  // Auto-populate target amount when SOW is selected
  const handleSOWChange = (sowId: string) => {
    form.setValue("sowId", sowId);
    const selectedSOW = sows.find(s => s.id === sowId);
    if (selectedSOW) {
      form.setValue("targetAmount", selectedSOW.totalValue);
    }
  };

  const variance = form.watch("targetAmount") - currentTotal;
  const variancePercent = currentTotal > 0 ? (variance / currentTotal) * 100 : 0;
  const isNegativeVariance = variance < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Apply Contract Adjustment
          </DialogTitle>
          <DialogDescription>
            Adjust invoice total to match fixed-price contract or SOW amount
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Current vs Target Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Adjustment Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Current Total</Label>
                    <div className="text-lg font-semibold">
                      ${currentTotal.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Target Amount</Label>
                    <div className="text-lg font-semibold text-primary">
                      ${form.watch("targetAmount")?.toLocaleString() || "0"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Variance</Label>
                    <div className={`text-lg font-semibold flex items-center gap-1 ${
                      isNegativeVariance ? "text-destructive" : "text-green-600"
                    }`}>
                      {isNegativeVariance ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                      ${Math.abs(variance).toLocaleString()}
                      <span className="text-xs">({variancePercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SOW Selection (if available) */}
            {sows.length > 0 && (
              <FormField
                control={form.control}
                name="sowId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link to SOW/Contract</FormLabel>
                    <Select onValueChange={handleSOWChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-sow">
                          <SelectValue placeholder="Select a SOW to link this adjustment" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sows.map((sow) => (
                          <SelectItem key={sow.id} value={sow.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{sow.sowNumber}</span>
                              <Badge variant="outline" className="ml-2">
                                ${sow.totalValue.toLocaleString()}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Link this adjustment to a specific SOW for tracking
                    </FormDescription>
                  </FormItem>
                )}
              />
            )}

            {/* Target Amount */}
            <FormField
              control={form.control}
              name="targetAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Invoice Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      data-testid="input-target-amount"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the contracted or agreed-upon invoice amount
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Allocation Method */}
            <FormField
              control={form.control}
              name="allocationMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allocation Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-allocation-method">
                        <SelectValue placeholder="Select how to distribute the adjustment" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pro_rata_amount">
                        <div>
                          <div className="font-medium">Pro-rata by Amount</div>
                          <div className="text-xs text-muted-foreground">
                            Distribute proportionally based on original amounts
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="pro_rata_hours">
                        <div>
                          <div className="font-medium">Pro-rata by Hours</div>
                          <div className="text-xs text-muted-foreground">
                            Distribute proportionally based on hours/quantity
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="flat">
                        <div>
                          <div className="font-medium">Equal Distribution</div>
                          <div className="text-xs text-muted-foreground">
                            Distribute equally across all lines
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="manual">
                        <div>
                          <div className="font-medium">Manual Allocation</div>
                          <div className="text-xs text-muted-foreground">
                            Manually specify amounts per line
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Adjustment Reason */}
            <FormField
              control={form.control}
              name="adjustmentReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adjustment Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain why this adjustment is being applied (e.g., 'Fixed-price contract adjustment per SOW #12345')"
                      className="min-h-[80px]"
                      data-testid="textarea-adjustment-reason"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preview Section */}
            {previewData.length > 0 && (
              <div className="space-y-2">
                <Label>Preview of Line Adjustments</Label>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Original</TableHead>
                        <TableHead className="text-right">Adjusted</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 5).map((preview) => (
                        <TableRow key={preview.lineId}>
                          <TableCell className="text-sm">
                            {preview.description}
                          </TableCell>
                          <TableCell className="text-right">
                            ${preview.originalAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${preview.newAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right ${
                            preview.variance < 0 ? "text-destructive" : "text-green-600"
                          }`}>
                            {preview.variance < 0 ? "-" : "+"}
                            ${Math.abs(preview.variance).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {previewData.length > 5 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            ... and {previewData.length - 5} more lines
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Warning for large variance */}
            {Math.abs(variancePercent) > 40 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Large Variance Warning</AlertTitle>
                <AlertDescription>
                  This adjustment represents a {Math.abs(variancePercent).toFixed(1)}% variance from the original amount.
                  Please ensure this is intentional and documented properly.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={applyAdjustmentMutation.isPending}
                data-testid="button-apply-adjustment"
              >
                {applyAdjustmentMutation.isPending ? "Applying..." : "Apply Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}