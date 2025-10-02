import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertCircle, CheckCircle, Wand2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PMWizardDialogProps {
  estimateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = "check" | "context" | "hours" | "confirm";

export function PMWizardDialog({ estimateId, open, onOpenChange }: PMWizardDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>("check");
  const [hoursPerWeekPerEpic, setHoursPerWeekPerEpic] = useState<number>(2);
  const [maxWeeks, setMaxWeeks] = useState<number>(0);

  // Check for existing PM hours
  const { data: pmData, isLoading } = useQuery({
    queryKey: ['/api/estimates', estimateId, 'pm-check'],
    queryFn: async () => {
      const response = await apiRequest(`/api/estimates/${estimateId}/pm-hours`, {
        method: 'POST',
        body: JSON.stringify({ action: 'check' })
      });
      return response;
    },
    enabled: open,
  });

  // Create PM hours mutation
  const createPMMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/estimates/${estimateId}/pm-hours`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          hoursPerWeekPerEpic,
          maxWeeks
        })
      });
    },
    onSuccess: (data) => {
      toast({
        title: "PM hours added",
        description: `Successfully added ${data.created} PM line items (${data.totalHours} total hours)`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', estimateId, 'line-items'] });
      onOpenChange(false);
      resetWizard();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add PM hours",
        variant: "destructive",
      });
    },
  });

  const resetWizard = () => {
    setStep("check");
    setHoursPerWeekPerEpic(2);
    setMaxWeeks(0);
  };

  const handleNext = () => {
    if (step === "check") {
      if (pmData?.hasExistingPM) {
        // Stay on check step - user needs to confirm
        return;
      }
      setMaxWeeks(pmData?.maxWeeks || 0);
      setStep("context");
    } else if (step === "context") {
      setStep("hours");
    } else if (step === "hours") {
      setStep("confirm");
    }
  };

  const handleBack = () => {
    if (step === "context") setStep("check");
    else if (step === "hours") setStep("context");
    else if (step === "confirm") setStep("hours");
  };

  // Remove existing PM items mutation
  const removePMMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/estimates/${estimateId}/pm-hours`, {
        method: 'POST',
        body: JSON.stringify({ action: 'remove' })
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Existing PM hours removed",
        description: `Removed ${data.removed} PM line items`,
      });
      // Move to next step
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', estimateId, 'pm-check'] });
      setMaxWeeks(pmData?.maxWeeks || 0);
      setStep("context");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove PM hours",
        variant: "destructive",
      });
    },
  });

  const handleKeepExisting = () => {
    toast({
      title: "Existing PM hours kept",
      description: "No changes made to your estimate",
    });
    onOpenChange(false);
    resetWizard();
  };

  const handleKeepAndAddNew = () => {
    // Keep existing hours and continue to add more
    setMaxWeeks(pmData?.maxWeeks || 0);
    setStep("context");
  };

  const handleRemoveAndContinue = () => {
    removePMMutation.mutate();
  };

  const totalPMHours = (pmData?.epics?.length || 0) * maxWeeks * hoursPerWeekPerEpic;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>PM Wizard</DialogTitle>
            <DialogDescription>Loading...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Project Management Wizard
          </DialogTitle>
          <DialogDescription>
            Ensure PM hours are properly allocated across all epics and weeks
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Check for existing PM hours */}
        {step === "check" && (
          <div className="space-y-4">
            {pmData?.hasExistingPM ? (
              <>
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Found {pmData.existingPMItems.length} existing PM line items
                  </AlertDescription>
                </Alert>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Workstream</TableHead>
                        <TableHead>Week</TableHead>
                        <TableHead>Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pmData.existingPMItems.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.workstream || '-'}</TableCell>
                          <TableCell>{item.week || '-'}</TableCell>
                          <TableCell>{item.baseHours}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleKeepExisting} variant="outline" data-testid="button-keep-existing">
                    Keep These Hours
                  </Button>
                  <Button 
                    onClick={handleKeepAndAddNew} 
                    variant="default" 
                    data-testid="button-keep-and-add"
                  >
                    Keep & Add New
                  </Button>
                  <Button 
                    onClick={handleRemoveAndContinue} 
                    variant="destructive" 
                    disabled={removePMMutation.isPending}
                    data-testid="button-remove-existing"
                  >
                    {removePMMutation.isPending ? "Removing..." : "Remove & Add New"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No existing PM hours found. Let's add them!
                  </AlertDescription>
                </Alert>
                <Button onClick={handleNext} data-testid="button-start-wizard">
                  Continue
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 2: Project Context */}
        {step === "context" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project Summary</Label>
              <p className="text-sm text-muted-foreground">
                This estimate has <strong>{pmData?.epics?.length || 0} epics</strong> and{" "}
                <strong>{pmData?.maxWeeks || 0} weeks</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxWeeks">Adjust weeks if needed</Label>
              <Input
                id="maxWeeks"
                type="number"
                min="1"
                value={maxWeeks}
                onChange={(e) => setMaxWeeks(parseInt(e.target.value) || 0)}
                data-testid="input-max-weeks"
              />
            </div>

            <div className="space-y-2">
              <Label>Epics in this estimate:</Label>
              <ul className="list-disc list-inside text-sm space-y-1">
                {pmData?.epics?.map((epic: any) => (
                  <li key={epic.id}>{epic.name}</li>
                ))}
              </ul>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleBack} data-testid="button-back">
                Back
              </Button>
              <Button onClick={handleNext} disabled={maxWeeks < 1} data-testid="button-next">
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Hours per week per epic */}
        {step === "hours" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hoursPerWeekPerEpic">PM hours per week per epic</Label>
              <Input
                id="hoursPerWeekPerEpic"
                type="number"
                min="0.5"
                step="0.5"
                value={hoursPerWeekPerEpic}
                onChange={(e) => setHoursPerWeekPerEpic(parseFloat(e.target.value) || 0)}
                data-testid="input-hours-per-week"
              />
            </div>

            <Alert>
              <AlertDescription>
                <strong>Calculation:</strong> {maxWeeks} weeks × {pmData?.epics?.length || 0} epics × {hoursPerWeekPerEpic} hours ={" "}
                <strong>{totalPMHours} total PM hours</strong>
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button variant="outline" onClick={handleBack} data-testid="button-back">
                Back
              </Button>
              <Button onClick={handleNext} disabled={hoursPerWeekPerEpic <= 0} data-testid="button-next">
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === "confirm" && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Ready to create {(pmData?.epics?.length || 0) * maxWeeks} PM line items ({totalPMHours} total hours)
              </AlertDescription>
            </Alert>

            <div className="rounded-md border max-h-60 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Epic</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pmData?.epics?.map((epic: any) => 
                    Array.from({ length: maxWeeks }, (_, i) => i + 1).map((week) => (
                      <TableRow key={`${epic.id}-${week}`}>
                        <TableCell>{epic.name}</TableCell>
                        <TableCell>{week}</TableCell>
                        <TableCell>{hoursPerWeekPerEpic}</TableCell>
                        <TableCell>Project Management</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleBack} data-testid="button-back">
                Back
              </Button>
              <Button 
                onClick={() => createPMMutation.mutate()} 
                disabled={createPMMutation.isPending}
                data-testid="button-add-pm-hours"
              >
                {createPMMutation.isPending ? "Adding..." : "Add PM Hours"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
