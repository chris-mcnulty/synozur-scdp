import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Calculator,
  DollarSign,
  Edit3,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  History,
  User,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";

const editSchema = z.object({
  quantity: z.string()
    .optional()
    .refine((val) => !val || !isNaN(parseFloat(val)), {
      message: "Must be a valid number",
    })
    .refine((val) => !val || parseFloat(val) >= 0, {
      message: "Must be a positive number",
    }),
  rate: z.string()
    .optional()
    .refine((val) => !val || !isNaN(parseFloat(val)), {
      message: "Must be a valid number",
    })
    .refine((val) => !val || parseFloat(val) >= 0, {
      message: "Must be a positive number",
    }),
  billedAmount: z.string()
    .refine((val) => !isNaN(parseFloat(val)), {
      message: "Must be a valid number",
    })
    .refine((val) => parseFloat(val) >= 0, {
      message: "Must be a positive number",
    }),
  description: z.string().optional(),
  adjustmentReason: z.string().min(1, "Adjustment reason is required"),
});

type EditFormData = z.infer<typeof editSchema>;

interface InvoiceLineEditDialogProps {
  open: boolean;
  onClose: () => void;
  line: {
    id: string;
    type: string;
    quantity?: string;
    rate?: string;
    amount: string;
    description?: string;
    originalAmount?: string;
    originalQuantity?: string;
    originalRate?: string;
    billedAmount?: string;
    adjustmentReason?: string;
    editedBy?: { id: string; name: string; email: string };
    editedAt?: string;
    project: { id: string; name: string; code: string };
    client: { id: string; name: string };
  };
  onSave: (data: {
    lineId: string;
    quantity?: number;
    rate?: number;
    billedAmount: number;
    description?: string;
    adjustmentReason: string;
  }) => void;
  isSaving: boolean;
}

export function InvoiceLineEditDialog({
  open,
  onClose,
  line,
  onSave,
  isSaving,
}: InvoiceLineEditDialogProps) {
  const [showVarianceWarning, setShowVarianceWarning] = useState(false);
  const [pendingData, setPendingData] = useState<EditFormData | null>(null);
  const [autoCalculate, setAutoCalculate] = useState(true);

  // Use billed amount if it exists, otherwise use the original amount
  const currentAmount = line.billedAmount || line.amount;
  const originalAmount = line.originalAmount || line.amount;
  const currentQuantity = line.quantity;
  const currentRate = line.rate;

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      quantity: currentQuantity || "",
      rate: currentRate || "",
      billedAmount: currentAmount,
      description: line.description || "",
      adjustmentReason: "",
    },
  });

  const watchQuantity = form.watch("quantity");
  const watchRate = form.watch("rate");
  const watchAmount = form.watch("billedAmount");

  // Auto-calculate amount when quantity or rate changes
  useEffect(() => {
    if (autoCalculate && watchQuantity && watchRate) {
      const qty = parseFloat(watchQuantity);
      const rt = parseFloat(watchRate);
      if (!isNaN(qty) && !isNaN(rt)) {
        const calculatedAmount = (qty * rt).toFixed(2);
        form.setValue("billedAmount", calculatedAmount);
      }
    }
  }, [watchQuantity, watchRate, autoCalculate, form]);

  // Check for large variance
  const checkVariance = (newAmount: string) => {
    const original = parseFloat(originalAmount);
    const newVal = parseFloat(newAmount);
    if (!isNaN(original) && !isNaN(newVal)) {
      const variance = Math.abs(original - newVal);
      const variancePercent = (variance / original) * 100;
      return variancePercent > 20;
    }
    return false;
  };

  const handleSubmit = (data: EditFormData) => {
    // Check for large variance
    if (checkVariance(data.billedAmount)) {
      setPendingData(data);
      setShowVarianceWarning(true);
      return;
    }

    // Proceed with save
    onSave({
      lineId: line.id,
      quantity: data.quantity ? parseFloat(data.quantity) : undefined,
      rate: data.rate ? parseFloat(data.rate) : undefined,
      billedAmount: parseFloat(data.billedAmount),
      description: data.description,
      adjustmentReason: data.adjustmentReason,
    });
  };

  const confirmVarianceAndSave = () => {
    if (pendingData) {
      onSave({
        lineId: line.id,
        quantity: pendingData.quantity ? parseFloat(pendingData.quantity) : undefined,
        rate: pendingData.rate ? parseFloat(pendingData.rate) : undefined,
        billedAmount: parseFloat(pendingData.billedAmount),
        description: pendingData.description,
        adjustmentReason: pendingData.adjustmentReason,
      });
      setShowVarianceWarning(false);
      setPendingData(null);
    }
  };

  const calculateVariance = () => {
    const original = parseFloat(originalAmount);
    const current = parseFloat(watchAmount || "0");
    if (!isNaN(original) && !isNaN(current)) {
      return current - original;
    }
    return 0;
  };

  const variance = calculateVariance();
  const variancePercent = originalAmount
    ? ((variance / parseFloat(originalAmount)) * 100).toFixed(1)
    : "0";

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Edit Invoice Line
            </DialogTitle>
            <DialogDescription>
              Adjust the invoice line details. Original values are shown for reference.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {/* Project and Client Info */}
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Client:</span>{" "}
                    <span className="font-medium">{line.client.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Project:</span>{" "}
                    <span className="font-medium">{line.project.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>{" "}
                    <Badge variant="secondary">{line.type}</Badge>
                  </div>
                </div>
              </div>

              {/* Edit History */}
              {line.editedAt && line.editedBy && (
                <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <History className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">
                      Previously Edited
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span>{line.editedBy.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{format(new Date(line.editedAt), "MMM d, yyyy h:mm a")}</span>
                      </div>
                    </div>
                    {line.adjustmentReason && (
                      <div className="italic text-muted-foreground">
                        "{line.adjustmentReason}"
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Quantity Field */}
                {line.type !== "expense" && line.type !== "milestone" && (
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity (Hours)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              onChange={(e) => {
                                field.onChange(e);
                                setAutoCalculate(true);
                              }}
                              data-testid="input-quantity-edit"
                            />
                            {line.originalQuantity && (
                              <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
                                Original: {line.originalQuantity}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Rate Field */}
                {line.type !== "expense" && line.type !== "milestone" && (
                  <FormField
                    control={form.control}
                    name="rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rate ($/Hour)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              onChange={(e) => {
                                field.onChange(e);
                                setAutoCalculate(true);
                              }}
                              data-testid="input-rate-edit"
                            />
                            {line.originalRate && (
                              <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
                                Original: ${line.originalRate}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Amount Field */}
              <FormField
                control={form.control}
                name="billedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billed Amount</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          className="pl-9"
                          onChange={(e) => {
                            field.onChange(e);
                            setAutoCalculate(false);
                          }}
                          data-testid="input-billed-amount-edit"
                        />
                        <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
                          Original: ${originalAmount}
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription>
                      {autoCalculate ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Calculator className="h-3 w-3" />
                          Auto-calculated from quantity × rate
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">
                          Manual override - not using quantity × rate
                        </span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Variance Display */}
              {variance !== 0 && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Variance</span>
                    <div className="flex items-center gap-2">
                      {variance > 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                      )}
                      <span
                        className={`font-semibold ${
                          variance > 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                        data-testid="text-variance-amount"
                      >
                        ${Math.abs(variance).toFixed(2)} ({variancePercent}%)
                      </span>
                    </div>
                  </div>
                  {Math.abs(parseFloat(variancePercent)) > 20 && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-4 w-4" />
                      Large variance detected - confirmation will be required
                    </div>
                  )}
                </div>
              )}

              {/* Description Field */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Line item description..."
                        className="min-h-[80px] resize-none"
                        data-testid="input-description-edit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Adjustment Reason Field (Required) */}
              <FormField
                control={form.control}
                name="adjustmentReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Adjustment Reason <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Explain why this adjustment is being made..."
                        className="min-h-[80px] resize-none"
                        data-testid="input-adjustment-reason"
                      />
                    </FormControl>
                    <FormDescription>
                      This reason will be saved in the audit trail
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} data-testid="button-save-line-edit">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Large Variance Warning Dialog */}
      <AlertDialog open={showVarianceWarning} onOpenChange={setShowVarianceWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Large Variance Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              This adjustment results in a{" "}
              <span className="font-semibold">{variancePercent}%</span> variance from the
              original amount. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Original Amount:</span>
                <span className="font-medium">${originalAmount}</span>
              </div>
              <div className="flex justify-between">
                <span>New Amount:</span>
                <span className="font-medium">
                  ${pendingData?.billedAmount || "0"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span>Variance:</span>
                <span
                  className={`font-semibold ${
                    variance > 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {variance > 0 ? "+" : ""}${variance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVarianceAndSave}>
              Confirm Adjustment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}