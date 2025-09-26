import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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
import {
  CreditCard,
  DollarSign,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const paymentUpdateSchema = z.object({
  paymentStatus: z.enum(["unpaid", "partial", "paid"]),
  paymentDate: z.string().optional(),
  paymentAmount: z.string().optional(),
  paymentNotes: z.string().optional(),
});

type PaymentUpdateFormData = z.infer<typeof paymentUpdateSchema>;

interface PaymentStatusDialogProps {
  open: boolean;
  onClose: () => void;
  batch: {
    batchId: string;
    totalAmount: number;
    paymentStatus: 'unpaid' | 'partial' | 'paid';
    paymentDate?: string;
    paymentAmount?: number;
    paymentNotes?: string;
    status: string;
  };
}

export function PaymentStatusDialog({
  open,
  onClose,
  batch,
}: PaymentStatusDialogProps) {
  const { toast } = useToast();

  const form = useForm<PaymentUpdateFormData>({
    resolver: zodResolver(paymentUpdateSchema),
    defaultValues: {
      paymentStatus: batch.paymentStatus,
      paymentDate: batch.paymentDate || '',
      paymentAmount: batch.paymentAmount?.toString() || '',
      paymentNotes: batch.paymentNotes || '',
    },
  });

  const paymentStatus = form.watch("paymentStatus");

  const updatePaymentMutation = useMutation({
    mutationFn: async (data: PaymentUpdateFormData) => {
      return apiRequest(`/api/invoice-batches/${batch.batchId}/payment-status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Status Updated",
        description: "Invoice payment status has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-batches"] });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update payment status.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PaymentUpdateFormData) => {
    updatePaymentMutation.mutate(data);
  };

  const handleClose = () => {
    onClose();
    form.reset();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'partial':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Partial</Badge>;
      default:
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Unpaid</Badge>;
    }
  };

  if (batch.status !== 'finalized') {
    return (
      <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Cannot Update Payment Status
            </DialogTitle>
            <DialogDescription>
              Invoice batch must be finalized before payment status can be updated.
              Current status: <Badge variant="secondary">{batch.status}</Badge>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Update Payment Status
          </DialogTitle>
          <DialogDescription>
            Update payment information for invoice batch <code>{batch.batchId}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div>
              <div className="text-sm text-muted-foreground">Invoice Total</div>
              <div className="text-2xl font-semibold">
                ${batch.totalAmount.toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Current Status</div>
              <div className="flex items-center gap-2 mt-1">
                {getStatusIcon(batch.paymentStatus)}
                {getStatusBadge(batch.paymentStatus)}
              </div>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="paymentStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Payment Status
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="unpaid" id="unpaid" />
                        <label
                          htmlFor="unpaid"
                          className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          <AlertCircle className="w-4 h-4 text-red-600" />
                          Unpaid
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="partial" id="partial" />
                        <label
                          htmlFor="partial"
                          className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          <Clock className="w-4 h-4 text-yellow-600" />
                          Partial Payment
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="paid" id="paid" />
                        <label
                          htmlFor="paid"
                          className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          Paid in Full
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {paymentStatus !== 'unpaid' && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Payment Date
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-payment-date"
                          />
                        </FormControl>
                        <FormDescription>
                          Date payment was received
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {paymentStatus === 'partial' && (
                    <FormField
                      control={form.control}
                      name="paymentAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Amount Paid
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              data-testid="input-payment-amount"
                            />
                          </FormControl>
                          <FormDescription>
                            Amount received for partial payment
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="paymentNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add notes about the payment..."
                          className="min-h-[80px]"
                          {...field}
                          data-testid="input-payment-notes"
                        />
                      </FormControl>
                      <FormDescription>
                        Optional notes about the payment (reference number, payment method, etc.)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-payment"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updatePaymentMutation.isPending}
                data-testid="button-update-payment"
              >
                {updatePaymentMutation.isPending ? "Updating..." : "Update Payment Status"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}