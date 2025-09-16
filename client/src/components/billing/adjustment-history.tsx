import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import {
  History,
  TrendingUp,
  TrendingDown,
  Calculator,
  Edit,
  FileText,
  ChevronRight,
  ChevronDown,
  User,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Undo,
} from "lucide-react";

interface AdjustmentRecord {
  id: string;
  batchId: string;
  type: "line_item" | "aggregate" | "reversal";
  targetAmount?: number;
  originalAmount: number;
  adjustedAmount: number;
  variance: number;
  variancePercent: number;
  allocationMethod?: string;
  reason: string;
  appliedAt: string;
  appliedBy: {
    id: string;
    name: string;
    email: string;
  };
  reversedAt?: string;
  reversedBy?: {
    id: string;
    name: string;
    email: string;
  };
  sowReference?: {
    id: string;
    sowNumber: string;
    totalValue: number;
  };
  affectedLines: number;
  lineDetails?: Array<{
    id: string;
    description: string;
    originalAmount: number;
    adjustedAmount: number;
    variance: number;
  }>;
}

interface AdjustmentSummary {
  originalTotal: number;
  currentTotal: number;
  totalVariance: number;
  variancePercent: number;
  adjustmentCount: number;
  lastAdjustment?: string;
  aggregateAdjustments: number;
  lineItemAdjustments: number;
  reversals: number;
}

interface AdjustmentHistoryProps {
  batchId: string;
  canReverse?: boolean;
  onReverse?: (adjustmentId: string) => void;
}

export function AdjustmentHistory({
  batchId,
  canReverse = false,
  onReverse,
}: AdjustmentHistoryProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<AdjustmentRecord | null>(null);

  // Fetch adjustment history
  const { data: adjustments = [], isLoading } = useQuery<AdjustmentRecord[]>({
    queryKey: [`/api/invoice-batches/${batchId}/adjustments/history`],
  });

  // Fetch adjustment summary
  const { data: summary } = useQuery<AdjustmentSummary>({
    queryKey: [`/api/invoice-batches/${batchId}/adjustments/summary`],
  });

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const showDetails = (adjustment: AdjustmentRecord) => {
    setSelectedAdjustment(adjustment);
    setShowDetailDialog(true);
  };

  const getAdjustmentIcon = (type: string) => {
    switch (type) {
      case "aggregate":
        return <Calculator className="h-4 w-4" />;
      case "line_item":
        return <Edit className="h-4 w-4" />;
      case "reversal":
        return <Undo className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getAdjustmentColor = (variance: number) => {
    if (variance < 0) return "text-destructive";
    if (variance > 0) return "text-green-600";
    return "text-muted-foreground";
  };

  const getAdjustmentBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case "aggregate":
        return "default";
      case "line_item":
        return "secondary";
      case "reversal":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Loading Adjustment History...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!adjustments.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Adjustment History
          </CardTitle>
          <CardDescription>No adjustments have been applied to this batch</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Adjustment History
          </CardTitle>
          <CardDescription>
            Track all modifications made to this invoice batch
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary Section */}
          {summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Original Total</div>
                  <div className="text-lg font-semibold">
                    ${summary.originalTotal.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Current Total</div>
                  <div className="text-lg font-semibold text-primary">
                    ${summary.currentTotal.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Total Variance</div>
                  <div className={`text-lg font-semibold flex items-center gap-1 ${getAdjustmentColor(summary.totalVariance)}`}>
                    {summary.totalVariance < 0 ? (
                      <ArrowDownRight className="h-4 w-4" />
                    ) : summary.totalVariance > 0 ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : null}
                    ${Math.abs(summary.totalVariance).toLocaleString()}
                    <span className="text-xs">({summary.variancePercent.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Adjustments</div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {summary.adjustmentCount} total
                    </Badge>
                    {summary.reversals > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {summary.reversals} reversed
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Adjustment Breakdown */}
              <div className="flex gap-4 mb-6 text-sm">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Aggregate:</span>
                  <span className="font-medium">{summary.aggregateAdjustments}</span>
                </div>
                <Separator orientation="vertical" className="h-5" />
                <div className="flex items-center gap-2">
                  <Edit className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Line Items:</span>
                  <span className="font-medium">{summary.lineItemAdjustments}</span>
                </div>
                <Separator orientation="vertical" className="h-5" />
                <div className="flex items-center gap-2">
                  <Undo className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Reversals:</span>
                  <span className="font-medium">{summary.reversals}</span>
                </div>
              </div>
              <Separator className="mb-6" />
            </>
          )}

          {/* Timeline */}
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {adjustments.map((adjustment, index) => {
                const isExpanded = expandedItems.has(adjustment.id);
                const isReversed = !!adjustment.reversedAt;
                
                return (
                  <div key={adjustment.id} className="relative">
                    {/* Timeline connector */}
                    {index < adjustments.length - 1 && (
                      <div className="absolute left-5 top-10 bottom-0 w-px bg-border" />
                    )}
                    
                    {/* Timeline item */}
                    <div className={`flex gap-4 ${isReversed ? "opacity-60" : ""}`}>
                      {/* Icon */}
                      <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-background ${
                        isReversed ? "border-muted" : "border-primary"
                      }`}>
                        {getAdjustmentIcon(adjustment.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={getAdjustmentBadgeVariant(adjustment.type)}>
                                {adjustment.type === "aggregate" ? "Contract Adjustment" :
                                 adjustment.type === "line_item" ? "Line Edit" :
                                 "Reversal"}
                              </Badge>
                              {isReversed && (
                                <Badge variant="outline" className="text-xs">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Reversed
                                </Badge>
                              )}
                              {adjustment.sowReference && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  {adjustment.sowReference.sowNumber}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(adjustment.appliedAt), "PPp")}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-semibold ${getAdjustmentColor(adjustment.variance)}`}>
                              {adjustment.variance < 0 ? "-" : "+"}
                              ${Math.abs(adjustment.variance).toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {adjustment.variancePercent.toFixed(1)}% change
                            </div>
                          </div>
                        </div>

                        {/* Collapsible details */}
                        <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(adjustment.id)}>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              data-testid={`button-toggle-details-${adjustment.id}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3 mr-1" />
                              ) : (
                                <ChevronRight className="h-3 w-3 mr-1" />
                              )}
                              {isExpanded ? "Hide" : "Show"} Details
                            </Button>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent className="pt-2 space-y-2">
                            <div className="text-sm space-y-1">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <User className="h-3 w-3" />
                                Applied by {adjustment.appliedBy.name}
                              </div>
                              {adjustment.allocationMethod && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Calculator className="h-3 w-3" />
                                  Method: {adjustment.allocationMethod.replace(/_/g, " ")}
                                </div>
                              )}
                              <div className="flex items-start gap-2 text-muted-foreground">
                                <AlertCircle className="h-3 w-3 mt-0.5" />
                                <span className="flex-1">{adjustment.reason}</span>
                              </div>
                              {adjustment.affectedLines > 0 && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <FileText className="h-3 w-3" />
                                  {adjustment.affectedLines} lines affected
                                </div>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => showDetails(adjustment)}
                                data-testid={`button-view-details-${adjustment.id}`}
                              >
                                View Full Details
                              </Button>
                              {canReverse && !isReversed && adjustment.type !== "reversal" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onReverse?.(adjustment.id)}
                                  className="text-destructive"
                                  data-testid={`button-reverse-${adjustment.id}`}
                                >
                                  <Undo className="h-3 w-3 mr-1" />
                                  Reverse
                                </Button>
                              )}
                            </div>

                            {/* Reversal info */}
                            {isReversed && adjustment.reversedBy && (
                              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                Reversed by {adjustment.reversedBy.name} on {format(new Date(adjustment.reversedAt!), "PPp")}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjustment Details</DialogTitle>
            <DialogDescription>
              Complete information about this adjustment
            </DialogDescription>
          </DialogHeader>
          
          {selectedAdjustment && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Type</label>
                  <div className="flex items-center gap-2 mt-1">
                    {getAdjustmentIcon(selectedAdjustment.type)}
                    <Badge variant={getAdjustmentBadgeVariant(selectedAdjustment.type)}>
                      {selectedAdjustment.type === "aggregate" ? "Contract Adjustment" :
                       selectedAdjustment.type === "line_item" ? "Line Edit" :
                       "Reversal"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Applied</label>
                  <div className="mt-1">
                    {format(new Date(selectedAdjustment.appliedAt), "PPp")}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Applied By</label>
                  <div className="mt-1">
                    {selectedAdjustment.appliedBy.name}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({selectedAdjustment.appliedBy.email})
                    </span>
                  </div>
                </div>
                {selectedAdjustment.sowReference && (
                  <div>
                    <label className="text-sm text-muted-foreground">SOW Reference</label>
                    <div className="mt-1">
                      {selectedAdjustment.sowReference.sowNumber}
                      <span className="text-xs text-muted-foreground ml-1">
                        (${selectedAdjustment.sowReference.totalValue.toLocaleString()})
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Financial Impact */}
              <div>
                <h4 className="font-medium mb-3">Financial Impact</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Original Amount</label>
                    <div className="text-lg font-semibold mt-1">
                      ${selectedAdjustment.originalAmount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Adjusted Amount</label>
                    <div className="text-lg font-semibold text-primary mt-1">
                      ${selectedAdjustment.adjustedAmount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Variance</label>
                    <div className={`text-lg font-semibold mt-1 ${getAdjustmentColor(selectedAdjustment.variance)}`}>
                      {selectedAdjustment.variance < 0 ? "-" : "+"}
                      ${Math.abs(selectedAdjustment.variance).toLocaleString()}
                      <span className="text-xs ml-1">
                        ({selectedAdjustment.variancePercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Reason */}
              <div>
                <h4 className="font-medium mb-2">Adjustment Reason</h4>
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                  {selectedAdjustment.reason}
                </div>
              </div>

              {/* Line Details */}
              {selectedAdjustment.lineDetails && selectedAdjustment.lineDetails.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3">Affected Line Items</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2">Description</th>
                            <th className="text-right p-2">Original</th>
                            <th className="text-right p-2">Adjusted</th>
                            <th className="text-right p-2">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedAdjustment.lineDetails.map((line) => (
                            <tr key={line.id} className="border-b">
                              <td className="p-2">{line.description}</td>
                              <td className="text-right p-2">
                                ${line.originalAmount.toFixed(2)}
                              </td>
                              <td className="text-right p-2 font-medium">
                                ${line.adjustedAmount.toFixed(2)}
                              </td>
                              <td className={`text-right p-2 ${getAdjustmentColor(line.variance)}`}>
                                {line.variance < 0 ? "-" : "+"}
                                ${Math.abs(line.variance).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}