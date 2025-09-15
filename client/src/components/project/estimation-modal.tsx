import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Save, FileSpreadsheet, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface EstimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectId?: string;
}

interface EstimationRow {
  role: string;
  person: string;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  total: number;
  cost: number;
}

// Mock estimation data removed - now using real estimate data

export function EstimationModal({ isOpen, onClose, projectName, projectId }: EstimationModalProps) {
  const { canViewPricing } = useAuth();
  
  // Fetch real estimation data from estimates API
  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "estimates"],
    enabled: isOpen && !!projectId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["/api/staff"],
    enabled: isOpen,
  });

  // Get the most recent approved estimate for this project
  const currentEstimate = (estimates as any[])?.find((est: any) => est.status === 'approved') || (estimates as any[])?.[0];

  // Convert estimate line items to estimation rows
  const generateEstimationRows = (estimate: any): EstimationRow[] => {
    if (!estimate || !estimate.lineItems) {
      return [];
    }

    // Group line items by week and person/role
    const weeklyData: { [key: string]: EstimationRow } = {};

    estimate.lineItems.forEach((lineItem: any) => {
      const key = `${lineItem.assignedUserId || lineItem.roleId || 'unassigned'}`;
      
      if (!weeklyData[key]) {
        const assignedPerson = (staff as any[]).find((s: any) => s.id === lineItem.assignedUserId);
        const assignedRole = (staff as any[]).find((s: any) => s.roleId === lineItem.roleId);
        
        weeklyData[key] = {
          role: assignedRole?.role || lineItem.resourceName || 'Unknown Role',
          person: assignedPerson?.name || lineItem.resourceName || 'Unassigned',
          week1: 0,
          week2: 0,
          week3: 0,
          week4: 0,
          total: 0,
          cost: 0
        };
      }

      const week = lineItem.week || 1;
      const hours = Number(lineItem.adjustedHours || lineItem.baseHours || 0);
      const cost = Number(lineItem.totalAmount || 0);

      if (week >= 1 && week <= 4) {
        const weekKey = `week${week}` as 'week1' | 'week2' | 'week3' | 'week4';
        (weeklyData[key] as any)[weekKey] = hours;
      }
      
      weeklyData[key].cost += cost;
      weeklyData[key].total += hours;
    });

    return Object.values(weeklyData);
  };

  const estimationRows = currentEstimate ? generateEstimationRows(currentEstimate) : [];
  
  const [currentEstimationRows, setEstimationRows] = useState<EstimationRow[]>([]);

  const updateHours = (rowIndex: number, week: string, value: number) => {
    const newRows = [...estimationRows];
    newRows[rowIndex] = { ...newRows[rowIndex], [week]: value };
    
    // Recalculate total
    const total = newRows[rowIndex].week1 + newRows[rowIndex].week2 + 
                  newRows[rowIndex].week3 + newRows[rowIndex].week4;
    newRows[rowIndex].total = total;
    
    setEstimationRows(newRows);
  };

  const totals = estimationRows.reduce(
    (acc, row) => ({
      week1: acc.week1 + row.week1,
      week2: acc.week2 + row.week2,
      week3: acc.week3 + row.week3,
      week4: acc.week4 + row.week4,
      total: acc.total + row.total,
      cost: acc.cost + row.cost
    }),
    { week1: 0, week2: 0, week3: 0, week4: 0, total: 0, cost: 0 }
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden" data-testid="estimation-modal">
        <DialogHeader>
          <DialogTitle>Project Estimation - {projectName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Project Structure */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <h4 className="font-semibold mb-3">Project Structure</h4>
              <div className="space-y-2">
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Epic: Assessment</span>
                      <Button variant="ghost" size="sm" data-testid="button-expand-epic-assessment">
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="mt-2 ml-4 space-y-1">
                      <div className="text-sm text-muted-foreground">Stage: Current State Analysis</div>
                      <div className="text-sm text-muted-foreground">Stage: Technology Audit</div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Epic: Strategy Design</span>
                      <Button variant="ghost" size="sm" data-testid="button-expand-epic-strategy">
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="mt-2 ml-4 space-y-1">
                      <div className="text-sm text-muted-foreground">Stage: AI Roadmap</div>
                      <div className="text-sm text-muted-foreground">Stage: Implementation Plan</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            {/* Weekly Staffing Grid */}
            <div className="lg:col-span-2">
              <h4 className="font-semibold mb-3">Weekly Staffing Grid</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border rounded-lg">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 font-medium">Role/Person</th>
                      <th className="text-center p-3 font-medium">Week 1</th>
                      <th className="text-center p-3 font-medium">Week 2</th>
                      <th className="text-center p-3 font-medium">Week 3</th>
                      <th className="text-center p-3 font-medium">Week 4</th>
                      <th className="text-center p-3 font-medium">Total</th>
                      <th className="text-right p-3 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {estimationRows.map((row, index) => (
                      <tr key={index} data-testid={`estimation-row-${index}`}>
                        <td className="p-3 font-medium">
                          {row.role} ({row.person})
                        </td>
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            className="w-16 text-center"
                            value={row.week1}
                            onChange={(e) => updateHours(index, 'week1', Number(e.target.value))}
                            data-testid={`input-week1-${index}`}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            className="w-16 text-center"
                            value={row.week2}
                            onChange={(e) => updateHours(index, 'week2', Number(e.target.value))}
                            data-testid={`input-week2-${index}`}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            className="w-16 text-center"
                            value={row.week3}
                            onChange={(e) => updateHours(index, 'week3', Number(e.target.value))}
                            data-testid={`input-week3-${index}`}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            className="w-16 text-center"
                            value={row.week4}
                            onChange={(e) => updateHours(index, 'week4', Number(e.target.value))}
                            data-testid={`input-week4-${index}`}
                          />
                        </td>
                        <td className="p-3 text-center font-medium" data-testid={`total-hours-${index}`}>
                          {row.total}
                        </td>
                        <td className="p-3 text-right font-medium" data-testid={`total-cost-${index}`}>
                          {canViewPricing ? `$${row.cost.toLocaleString()}` : '***'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-primary bg-primary/5">
                    <tr>
                      <td className="p-3 font-bold">Total</td>
                      <td className="p-3 text-center font-bold" data-testid="total-week1">{totals.week1}</td>
                      <td className="p-3 text-center font-bold" data-testid="total-week2">{totals.week2}</td>
                      <td className="p-3 text-center font-bold" data-testid="total-week3">{totals.week3}</td>
                      <td className="p-3 text-center font-bold" data-testid="total-week4">{totals.week4}</td>
                      <td className="p-3 text-center font-bold" data-testid="total-hours">{totals.total}</td>
                      <td className="p-3 text-right font-bold" data-testid="total-cost">
                        {canViewPricing ? `$${totals.cost.toLocaleString()}` : '***'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex justify-between pt-4 border-t border-border">
            <div className="flex space-x-3">
              <Button variant="outline" data-testid="button-save-template">
                <Save className="w-4 h-4 mr-2" />
                Save as Template
              </Button>
              <Button variant="outline" data-testid="button-export-excel">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export to Excel
              </Button>
            </div>
            <div className="flex space-x-3">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-estimation">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button data-testid="button-save-estimation">
                <Check className="w-4 h-4 mr-2" />
                Save Estimate
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
