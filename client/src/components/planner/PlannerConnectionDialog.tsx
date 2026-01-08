import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle, Users, FolderKanban, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PlannerConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

type ConnectionStep = "choose-method" | "select-team" | "select-plan" | "create-plan" | "confirm";
type ConnectionMethod = "existing-plan" | "create-in-team" | "standalone";

interface PlannerGroup {
  id: string;
  displayName: string;
  description?: string;
}

interface PlannerPlan {
  id: string;
  title: string;
  owner: string;
}

export function PlannerConnectionDialog({
  open,
  onOpenChange,
  projectId,
  projectName
}: PlannerConnectionDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<ConnectionStep>("choose-method");
  const [method, setMethod] = useState<ConnectionMethod | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PlannerGroup | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlannerPlan | null>(null);
  const [newPlanName, setNewPlanName] = useState("");

  const { data: plannerStatus, isLoading: checkingStatus } = useQuery<{
    configured: boolean;
    connected: boolean;
    error?: string;
    message?: string;
  }>({
    queryKey: ["/api/planner/status"],
    enabled: open,
    retry: false
  });

  const { data: groups, isLoading: loadingGroups } = useQuery<PlannerGroup[]>({
    queryKey: ["/api/planner/groups"],
    enabled: open && (step === "select-team" || method === "existing-plan"),
    retry: false
  });

  const { data: plans, isLoading: loadingPlans } = useQuery<PlannerPlan[]>({
    queryKey: ["/api/planner/plans"],
    enabled: open && step === "select-plan" && method === "existing-plan",
    retry: false
  });

  const { data: teamPlans, isLoading: loadingTeamPlans } = useQuery<PlannerPlan[]>({
    queryKey: ["/api/planner/groups", selectedGroup?.id, "plans"],
    enabled: open && selectedGroup !== null && method === "create-in-team",
    retry: false
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ groupId, title }: { groupId: string; title: string }) => {
      const response = await apiRequest(`/api/planner/groups/${groupId}/plans`, {
        method: "POST",
        body: JSON.stringify({ title })
      });
      return response.json();
    },
    onSuccess: (plan) => {
      setSelectedPlan(plan);
      setStep("confirm");
      toast({ title: "Plan created in Microsoft Planner" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create plan", description: error.message, variant: "destructive" });
    }
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/projects/${projectId}/planner-connection`, {
        method: "POST",
        body: JSON.stringify({
          planId: selectedPlan?.id,
          planTitle: selectedPlan?.title,
          groupId: selectedGroup?.id,
          groupName: selectedGroup?.displayName,
          syncDirection: "bidirectional"
        })
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-sync-status"] });
      toast({ title: "Connected to Microsoft Planner", description: "You can now sync assignments with Planner tasks." });
      onOpenChange(false);
      resetState();
    },
    onError: (error: any) => {
      toast({ title: "Failed to connect", description: error.message, variant: "destructive" });
    }
  });

  const resetState = () => {
    setStep("choose-method");
    setMethod(null);
    setSelectedGroup(null);
    setSelectedPlan(null);
    setNewPlanName("");
  };

  const handleMethodSelect = (selectedMethod: ConnectionMethod) => {
    setMethod(selectedMethod);
    if (selectedMethod === "existing-plan") {
      setStep("select-plan");
    } else if (selectedMethod === "create-in-team") {
      setStep("select-team");
    }
  };

  const handleTeamSelect = (group: PlannerGroup) => {
    setSelectedGroup(group);
    setStep("create-plan");
    setNewPlanName(projectName);
  };

  const handlePlanSelect = (plan: PlannerPlan) => {
    setSelectedPlan(plan);
    const group = groups?.find(g => g.id === plan.owner);
    if (group) {
      setSelectedGroup(group);
    } else if (plan.owner) {
      // Fallback: use plan.owner as groupId if group not found in loaded list
      setSelectedGroup({ id: plan.owner, displayName: "Unknown Group" });
    }
    setStep("confirm");
  };

  const handleCreatePlan = () => {
    if (selectedGroup && newPlanName.trim()) {
      createPlanMutation.mutate({ groupId: selectedGroup.id, title: newPlanName.trim() });
    }
  };

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const isConfigured = plannerStatus?.configured === true;
  const isConnected = plannerStatus?.connected === true;

  return (
    <Dialog open={open} onOpenChange={(open) => { onOpenChange(open); if (!open) resetState(); }}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Connect to Microsoft Planner
          </DialogTitle>
          <DialogDescription>
            Sync your project assignments with Microsoft Planner for task management.
          </DialogDescription>
        </DialogHeader>

        {checkingStatus && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Checking Planner configuration...</span>
          </div>
        )}

        {!checkingStatus && !isConfigured && (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
            <p className="font-medium">Planner integration not configured</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {plannerStatus?.message || 'Please contact your administrator to set up the Planner integration credentials.'}
            </p>
          </div>
        )}

        {!checkingStatus && isConfigured && !isConnected && (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" />
            <p className="font-medium">Planner connection failed</p>
            <p className="text-sm text-muted-foreground mt-1">
              {plannerStatus?.error || 'Unable to connect to Microsoft Planner. Please check the integration configuration.'}
            </p>
          </div>
        )}

        {!checkingStatus && isConfigured && isConnected && (
          <>
            {step === "choose-method" && (
              <div className="space-y-4" data-testid="planner-method-selection">
                <p className="text-sm text-muted-foreground">
                  How would you like to connect this project to Planner?
                </p>
                
                <RadioGroup onValueChange={(v) => handleMethodSelect(v as ConnectionMethod)}>
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="existing-plan" id="existing" />
                    <div className="flex-1">
                      <Label htmlFor="existing" className="font-medium cursor-pointer">
                        Connect to existing plan
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Choose from your existing Planner plans
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="create-in-team" id="create-team" />
                    <div className="flex-1">
                      <Label htmlFor="create-team" className="font-medium cursor-pointer">
                        Create new plan in a Team
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Create a new plan inside a Microsoft Teams team
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {step === "select-team" && (
              <div className="space-y-4" data-testid="planner-team-selection">
                <Button variant="ghost" size="sm" onClick={() => setStep("choose-method")}>
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  Select a Team to create the plan in:
                </p>
                
                {loadingGroups && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                
                {!loadingGroups && groups && groups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No Microsoft Teams found. Make sure you're a member of at least one team.
                  </p>
                )}
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {groups?.map((group) => (
                    <Card 
                      key={group.id} 
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleTeamSelect(group)}
                      data-testid={`team-option-${group.id}`}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{group.displayName}</p>
                          {group.description && (
                            <p className="text-sm text-muted-foreground truncate max-w-[350px]">
                              {group.description}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {step === "select-plan" && (
              <div className="space-y-4" data-testid="planner-plan-selection">
                <Button variant="ghost" size="sm" onClick={() => setStep("choose-method")}>
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  Select a Planner plan to connect:
                </p>
                
                {loadingPlans && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                
                {!loadingPlans && plans && plans.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No Planner plans found. Create one in Microsoft Planner first.
                  </p>
                )}
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {plans?.map((plan) => (
                    <Card 
                      key={plan.id} 
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handlePlanSelect(plan)}
                      data-testid={`plan-option-${plan.id}`}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <FolderKanban className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{plan.title}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {step === "create-plan" && selectedGroup && (
              <div className="space-y-4" data-testid="planner-create-plan">
                <Button variant="ghost" size="sm" onClick={() => setStep("select-team")}>
                  ← Back
                </Button>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Creating plan in
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">{selectedGroup.displayName}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <div className="space-y-2">
                  <Label htmlFor="plan-name">Plan name</Label>
                  <Input
                    id="plan-name"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    placeholder="Enter plan name"
                    data-testid="input-plan-name"
                  />
                </div>
                
                <Button 
                  onClick={handleCreatePlan} 
                  disabled={!newPlanName.trim() || createPlanMutation.isPending}
                  className="w-full"
                  data-testid="button-create-plan"
                >
                  {createPlanMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Plan
                    </>
                  )}
                </Button>
              </div>
            )}

            {step === "confirm" && selectedPlan && (
              <div className="space-y-4" data-testid="planner-confirm">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Ready to connect</span>
                </div>
                
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Project:</span>
                      <span className="font-medium">{projectName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Planner Plan:</span>
                      <span className="font-medium">{selectedPlan.title}</span>
                    </div>
                    {selectedGroup && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Team:</span>
                        <span className="font-medium">{selectedGroup.displayName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sync mode:</span>
                      <span className="font-medium">Bidirectional</span>
                    </div>
                  </CardContent>
                </Card>
                
                <p className="text-sm text-muted-foreground">
                  Your project assignments will sync with Planner tasks. Changes made in either 
                  system will be reflected in both.
                </p>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep("choose-method")}
                    className="flex-1"
                  >
                    Start Over
                  </Button>
                  <Button 
                    onClick={handleConnect}
                    disabled={connectMutation.isPending}
                    className="flex-1"
                    data-testid="button-connect"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
