import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign,
  Percent,
  Hash,
  Edit3,
  CheckCircle2,
} from "lucide-react";

const bulkEditSchema = z.object({
  adjustmentType: z.enum(["percentage", "fixed_amount", "fixed_rate"]),
  adjustmentValue: z.string()
    .refine((val) => !isNaN(parseFloat(val)), {
      message: "Must be a valid number",
    }),
  adjustmentMode: z.enum(["discount", "markup"]),
  adjustmentReason: z.string().min(1, "Adjustment reason is required"),
});

type BulkEditFormData = z.infer<typeof bulkEditSchema>;

interface InvoiceLineBulkEditDialogProps {
  open: boolean;
  onClose: () => void;
  selectedLines: Array<{
    id: string;
    type: string;
    amount: string;
    rate?: string;
    quantity?: string;
    project: { name: string };
    client: { name: string };
  }>;
  onApply: (data: {
    adjustmentType: string;
    adjustmentValue: number;
    adjustmentMode: string;
    adjustmentReason: string;
  }) => void;
  isApplying: boolean;
}

export function InvoiceLineBulkEditDialog({
  open,
  onClose,
  selectedLines,
  onApply,
  isApplying,
}: InvoiceLineBulkEditDialogProps) {
  const [previewAmounts, setPreviewAmounts] = useState<Record<string, number>>({});

  const form = useForm<BulkEditFormData>({
    resolver: zodResolver(bulkEditSchema),
    defaultValues: {
      adjustmentType: "percentage",
      adjustmentValue: "10",
      adjustmentMode: "discount",
      adjustmentReason: "",
    },
  });

  const watchType = form.watch("adjustmentType");
  const watchValue = form.watch("adjustmentValue");
  const watchMode = form.watch("adjustmentMode");

  // Calculate preview amounts
  const calculatePreview = () => {
    const value = parseFloat(watchValue || "0");
    const isDiscount = watchMode === "discount";
    const multiplier = isDiscount ? -1 : 1;

    const preview: Record<string, number> = {};

    selectedLines.forEach((line) => {
      const originalAmount = parseFloat(line.amount);
      let newAmount = originalAmount;

      switch (watchType) {
        case "percentage":
          const percentChange = (originalAmount * value) / 100;
          newAmount = originalAmount + (percentChange * multiplier);
          break;
        case "fixed_amount":
          newAmount = originalAmount + (value * multiplier);
          break;
        case "fixed_rate":
          // Only applies to lines with quantity
          if (line.quantity && line.type !== "expense" && line.type !== "milestone") {
            const qty = parseFloat(line.quantity);
            newAmount = qty * value;
          }
          break;
      }

      preview[line.id] = Math.max(0, newAmount); // Ensure non-negative
    });

    setPreviewAmounts(preview);
  };

  // Update preview when form values change
  useState(() => {
    calculatePreview();
  });

  const handleSubmit = (data: BulkEditFormData) => {
    onApply({
      adjustmentType: data.adjustmentType,
      adjustmentValue: parseFloat(data.adjustmentValue),
      adjustmentMode: data.adjustmentMode,
      adjustmentReason: data.adjustmentReason,
    });
  };

  const getTotalOriginal = () => {
    return selectedLines.reduce((sum, line) => sum + parseFloat(line.amount), 0);
  };

  const getTotalAdjusted = () => {
    return Object.values(previewAmounts).reduce((sum, amount) => sum + amount, 0);
  };

  const getTotalVariance = () => {
    return getTotalAdjusted() - getTotalOriginal();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Bulk Edit Invoice Lines
          </DialogTitle>
          <DialogDescription>
            Apply adjustments to {selectedLines.length} selected line{selectedLines.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Adjustment Type */}
            <FormField
              control={form.control}
              name="adjustmentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adjustment Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-3 gap-4"
                    >
                      <div className="flex items-center space-x-2 rounded-lg border p-4">
                        <RadioGroupItem value="percentage" id="percentage" />
                        <label
                          htmlFor="percentage"
                          className="flex flex-1 cursor-pointer items-center gap-2"
                        >
                          <Percent className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Percentage</div>
                            <div className="text-xs text-muted-foreground">
                              Apply % change
                            </div>
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center space-x-2 rounded-lg border p-4">
                        <RadioGroupItem value="fixed_amount" id="fixed_amount" />
                        <label
                          htmlFor="fixed_amount"
                          className="flex flex-1 cursor-pointer items-center gap-2"
                        >
                          <DollarSign className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Fixed Amount</div>
                            <div className="text-xs text-muted-foreground">
                              Add/subtract amount
                            </div>
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center space-x-2 rounded-lg border p-4">
                        <RadioGroupItem value="fixed_rate" id="fixed_rate" />
                        <label
                          htmlFor="fixed_rate"
                          className="flex flex-1 cursor-pointer items-center gap-2"
                        >
                          <Hash className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Fixed Rate</div>
                            <div className="text-xs text-muted-foreground">
                              Set hourly rate
                            </div>
                          </div>
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Adjustment Mode and Value */}
            <div className="grid grid-cols-2 gap-4">
              {watchType !== "fixed_rate" && (
                <FormField
                  control={form.control}
                  name="adjustmentMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => {
                            field.onChange(value);
                            calculatePreview();
                          }}
                          value={field.value}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="discount" id="discount" />
                            <label htmlFor="discount">Discount (Reduce)</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="markup" id="markup" />
                            <label htmlFor="markup">Markup (Increase)</label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="adjustmentValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {watchType === "percentage"
                        ? "Percentage"
                        : watchType === "fixed_amount"
                        ? "Amount"
                        : "Rate ($/Hour)"}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        {watchType === "percentage" && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Percent className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        {watchType !== "percentage" && (
                          <div className="absolute left-3 top-1/2 -translate-y-1/2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          className={
                            watchType === "percentage"
                              ? "pr-9"
                              : "pl-9"
                          }
                          onChange={(e) => {
                            field.onChange(e);
                            calculatePreview();
                          }}
                          data-testid="input-bulk-adjustment-value"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {watchType === "fixed_rate" &&
                        "New rate will be applied to all lines with quantities"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Adjustment Reason */}
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
                      placeholder="Explain why these adjustments are being made..."
                      className="min-h-[80px] resize-none"
                      data-testid="input-bulk-adjustment-reason"
                    />
                  </FormControl>
                  <FormDescription>
                    This reason will be saved in the audit trail for all adjusted lines
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preview Section */}
            <div className="rounded-lg border">
              <div className="bg-muted/50 p-3">
                <h4 className="font-medium">Preview Changes</h4>
              </div>
              <ScrollArea className="h-[200px] p-4">
                <div className="space-y-2">
                  {selectedLines.map((line) => {
                    const originalAmount = parseFloat(line.amount);
                    const newAmount = previewAmounts[line.id] || originalAmount;
                    const variance = newAmount - originalAmount;
                    const showChange = Math.abs(variance) > 0.01;

                    return (
                      <div
                        key={line.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {line.project.name}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {line.type}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {line.client.name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground line-through">
                              ${originalAmount.toFixed(2)}
                            </span>
                            {showChange && (
                              <>
                                <span className="text-sm">→</span>
                                <span
                                  className={`text-sm font-medium ${
                                    variance > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : variance < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : ""
                                  }`}
                                >
                                  ${newAmount.toFixed(2)}
                                </span>
                              </>
                            )}
                            {!showChange && (
                              <span className="text-sm text-muted-foreground">
                                No change
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <Separator />
              <div className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Original Total:</span>
                    <span className="font-medium">
                      ${getTotalOriginal().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Adjusted Total:</span>
                    <span className="font-medium">
                      ${getTotalAdjusted().toFixed(2)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-medium">Total Variance:</span>
                    <span
                      className={`font-semibold ${
                        getTotalVariance() > 0
                          ? "text-green-600 dark:text-green-400"
                          : getTotalVariance() < 0
                          ? "text-red-600 dark:text-red-400"
                          : ""
                      }`}
                      data-testid="text-bulk-total-variance"
                    >
                      {getTotalVariance() > 0 ? "+" : ""}
                      ${getTotalVariance().toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isApplying}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isApplying}
                data-testid="button-apply-bulk-edit"
              >
                {isApplying ? (
                  <>Applying...</>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Apply to {selectedLines.length} Lines
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}