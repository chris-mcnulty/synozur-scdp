import { useState, useEffect, useMemo } from "react";
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
  targetAmount: z.coerce.number().positive("Target amount must be positive"),
  allocationMethod: z.enum(["pro_rata_amount", "pro_rata_hours", "flat", "manual"]),
  sowId: z.string().optional(),
  adjustmentReason: z.string().min(10, "Please provide a detailed reason (min 10 characters)"),
});

// Utility function to normalize amount strings and convert to number
function normalizeAmount(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  // Remove currency symbols and convert to number
  const cleanedValue = value.toString().replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleanedValue);
  return isNaN(parsed) ? 0 : parsed;
}

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
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});

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

  // Watch form values for preview calculation
  const targetAmount = form.watch("targetAmount");
  const allocationMethod = form.watch("allocationMethod");

  // Initialize manual allocations when switching to manual mode
  useEffect(() => {
    if (allocationMethod === 'manual' && lines.length > 0) {
      // Initialize with current amounts for all lines if not already set
      const initialAllocations: Record<string, number> = {};
      lines.forEach(line => {
        const originalAmount = normalizeAmount(line.billedAmount || line.amount);
        // Only set if not already in state (preserve user edits)
        if (!(line.id in manualAllocations)) {
          initialAllocations[line.id] = originalAmount;
        }
      });
      if (Object.keys(initialAllocations).length > 0) {
        setManualAllocations(prev => ({ ...prev, ...initialAllocations }));
      }
    }
  }, [allocationMethod, lines]);

  // Calculate preview using useMemo for better performance and accuracy
  const calculatedPreview = useMemo(() => {
    if (!targetAmount || !lines.length || targetAmount <= 0) {
      return [];
    }

    const numericTargetAmount = normalizeAmount(targetAmount);
    const numericCurrentTotal = normalizeAmount(currentTotal);
    
    const preview = lines.map(line => {
      const originalAmount = normalizeAmount(line.billedAmount || line.amount);
      let newAmount = 0;
      
      switch (allocationMethod) {
        case "pro_rata_amount": {
          // Distribute proportionally based on original amounts
          if (numericCurrentTotal > 0) {
            const proportion = originalAmount / numericCurrentTotal;
            newAmount = numericTargetAmount * proportion;
          } else {
            // If current total is 0, distribute equally
            newAmount = numericTargetAmount / lines.length;
          }
          break;
        }
          
        case "pro_rata_hours": {
          // Distribute proportionally based on hours/quantity
          const quantity = normalizeAmount(line.quantity || 1);
          const totalQuantity = lines.reduce((sum, l) => 
            sum + normalizeAmount(l.quantity || 1), 0
          );
          if (totalQuantity > 0) {
            const proportion = quantity / totalQuantity;
            newAmount = numericTargetAmount * proportion;
          } else {
            // If total quantity is 0, distribute equally
            newAmount = numericTargetAmount / lines.length;
          }
          break;
        }
          
        case "flat": {
          // Equal distribution across all lines
          newAmount = numericTargetAmount / lines.length;
          break;
        }
          
        case "manual": {
          // Use manually specified amount if available, otherwise keep original
          newAmount = manualAllocations[line.id] ?? originalAmount;
          break;
        }
      }
      
      // Ensure we handle rounding to 2 decimal places
      const roundedNewAmount = Math.round(newAmount * 100) / 100;
      const roundedVariance = Math.round((roundedNewAmount - originalAmount) * 100) / 100;
      
      return {
        lineId: line.id,
        originalAmount: originalAmount,
        newAmount: Math.max(0, roundedNewAmount),
        variance: roundedVariance,
        description: line.description || `${line.type} item`,
      };
    });
    
    return preview;
  }, [targetAmount, allocationMethod, lines, currentTotal, manualAllocations]);

  // Update preview data when calculated preview changes
  useEffect(() => {
    setPreviewData(calculatedPreview);
  }, [calculatedPreview]);

  // Apply adjustment mutation
  const applyAdjustmentMutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      // Build request body
      const requestBody: any = {
        targetAmount: data.targetAmount,
        method: data.allocationMethod,
        reason: data.adjustmentReason,
        sowId: data.sowId,
        projectId: projectId,
      };
      
      // Include allocation object for manual method
      if (data.allocationMethod === 'manual') {
        // Ensure all lines have an allocation value
        const completeAllocation: Record<string, number> = {};
        lines.forEach(line => {
          const originalAmount = normalizeAmount(line.billedAmount || line.amount);
          completeAllocation[line.id] = manualAllocations[line.id] ?? originalAmount;
        });
        requestBody.allocation = completeAllocation;
      }
      
      // Use the proper backend endpoint that correctly calculates adjustments
      return await apiRequest(`/api/invoice-batches/${batchId}/adjustments`, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
    },
    onSuccess: async () => {
      // Force refetch all relevant queries to ensure UI updates immediately
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/invoice-batches'] }),
        queryClient.refetchQueries({ queryKey: [`/api/invoice-batches/${batchId}/details`] }),
        queryClient.refetchQueries({ queryKey: [`/api/invoice-batches/${batchId}/lines`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/billing/unbilled-items'] }),
      ]);
      toast({
        title: "Contract adjustment applied",
        description: `Invoice adjusted to match contract amount of $${normalizeAmount(form.getValues("targetAmount")).toLocaleString()}`,
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

  const numericTargetAmount = normalizeAmount(targetAmount);
  const numericCurrentTotal = normalizeAmount(currentTotal);
  const variance = numericTargetAmount - numericCurrentTotal;
  const variancePercent = numericCurrentTotal > 0 ? (variance / numericCurrentTotal) * 100 : 0;
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
                      ${numericCurrentTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Target Amount</Label>
                    <div className="text-lg font-semibold text-primary">
                      ${numericTargetAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Variance</Label>
                    <div className={`text-lg font-semibold flex items-center gap-1 ${
                      isNegativeVariance ? "text-destructive" : "text-green-600"
                    }`}>
                      {isNegativeVariance ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                      ${Math.abs(variance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      min="0.01"
                      data-testid="input-target-amount"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
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
                <Label>
                  {allocationMethod === 'manual' ? 'Manual Allocation - Enter Amounts' : 'Preview of Line Adjustments'}
                </Label>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Original</TableHead>
                        <TableHead className="text-right">
                          {allocationMethod === 'manual' ? 'New Amount' : 'Adjusted'}
                        </TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(allocationMethod === 'manual' ? previewData : previewData.slice(0, 5)).map((preview) => (
                        <TableRow key={preview.lineId}>
                          <TableCell className="text-sm">
                            {preview.description}
                          </TableCell>
                          <TableCell className="text-right">
                            ${preview.originalAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {allocationMethod === 'manual' ? (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={manualAllocations[preview.lineId] ?? preview.originalAmount}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  setManualAllocations(prev => ({
                                    ...prev,
                                    [preview.lineId]: value
                                  }));
                                }}
                                className="w-32 text-right"
                                data-testid={`input-manual-amount-${preview.lineId}`}
                              />
                            ) : (
                              `$${preview.newAmount.toFixed(2)}`
                            )}
                          </TableCell>
                          <TableCell className={`text-right ${
                            preview.variance < 0 ? "text-destructive" : "text-green-600"
                          }`}>
                            {preview.variance < 0 ? "-" : "+"}
                            ${Math.abs(preview.variance).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {previewData.length > 5 && allocationMethod !== 'manual' && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            ... and {previewData.length - 5} more lines
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {allocationMethod === 'manual' && (
                  <p className="text-sm text-muted-foreground">
                    Enter the desired amount for each line item. The total should match your target amount.
                  </p>
                )}
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