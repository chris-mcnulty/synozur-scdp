import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle, Users, Plus, Search } from "lucide-react";
import { MicrosoftPlannerIcon } from "@/components/icons/microsoft-icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SupportPlannerConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  currentSettings?: {
    supportPlannerEnabled?: boolean;
    supportPlannerPlanId?: string;
    supportPlannerPlanTitle?: string;
    supportPlannerGroupId?: string;
    supportPlannerGroupName?: string;
    supportPlannerBucketName?: string;
  };
}

type ConnectionStep = "choose-method" | "select-team" | "select-plan" | "create-plan" | "configure-bucket" | "confirm";
type ConnectionMethod = "existing-plan" | "create-in-team";

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

export function SupportPlannerConnectionDialog({
  open,
  onOpenChange,
  tenantId,
  currentSettings,
}: SupportPlannerConnectionDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<ConnectionStep>("choose-method");
  const [method, setMethod] = useState<ConnectionMethod | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PlannerGroup | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlannerPlan | null>(null);
  const [newPlanName, setNewPlanName] = useState("Support Tickets");
  const [bucketName, setBucketName] = useState("Support Tickets");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [allGroups, setAllGroups] = useState<PlannerGroup[]>([]);
  const [nextLink, setNextLink] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: plannerStatus, isLoading: checkingStatus } = useQuery<{
    configured: boolean;
    connected: boolean;
    appConfigured?: boolean;
    error?: string;
    message?: string;
    permissionIssue?: string;
  }>({
    queryKey: ["/api/planner/status"],
    enabled: open,
    retry: false,
  });

  const { data: groupsResponse, isLoading: loadingGroups } = useQuery<{
    groups: PlannerGroup[];
    source: "user" | "all";
    hasAzureMapping: boolean;
    nextLink?: string;
  }>({
    queryKey: ["/api/planner/groups"],
    enabled: open && step === "select-team",
    retry: false,
  });

  useMemo(() => {
    if (groupsResponse?.groups) {
      setAllGroups(groupsResponse.groups);
      setNextLink(groupsResponse.nextLink);
    }
  }, [groupsResponse]);

  const loadMoreGroups = async () => {
    if (!nextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const skipToken = encodeURIComponent(nextLink);
      const response = await apiRequest(`/api/planner/groups?skipToken=${skipToken}`);
      setAllGroups((prev) => [...prev, ...(response.groups || [])]);
      setNextLink(response.nextLink);
    } catch (error: any) {
      toast({ title: "Failed to load more teams", description: error.message, variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!groupSearchQuery.trim()) return allGroups;
    const query = groupSearchQuery.toLowerCase();
    return allGroups.filter(
      (g) => g.displayName.toLowerCase().includes(query) || g.description?.toLowerCase().includes(query)
    );
  }, [allGroups, groupSearchQuery]);

  const { data: teamPlans, isLoading: loadingPlans } = useQuery<PlannerPlan[]>({
    queryKey: ["/api/planner/groups", selectedGroup?.id, "plans"],
    enabled: open && selectedGroup !== null && (method === "existing-plan" || method === "create-in-team"),
    retry: false,
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ groupId, title }: { groupId: string; title: string }) => {
      return await apiRequest(`/api/planner/groups/${groupId}/plans`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: (plan) => {
      setSelectedPlan(plan);
      setStep("configure-bucket");
      toast({ title: "Plan created in Microsoft Planner" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create plan", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const planWebUrl = selectedPlan?.id && selectedGroup?.id
        ? `https://tasks.office.com/home/planner/#/plantaskboard?groupId=${selectedGroup.id}&planId=${selectedPlan.id}`
        : null;
      return await apiRequest(`/api/tenants/${tenantId}/support-integrations`, {
        method: "PATCH",
        body: JSON.stringify({
          supportPlannerEnabled: true,
          supportPlannerPlanId: selectedPlan?.id,
          supportPlannerPlanTitle: selectedPlan?.title,
          supportPlannerPlanWebUrl: planWebUrl,
          supportPlannerGroupId: selectedGroup?.id,
          supportPlannerGroupName: selectedGroup?.displayName,
          supportPlannerBucketName: bucketName || "Support Tickets",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "support-integrations"] });
      toast({ title: "Planner integration connected", description: "New support tickets will create tasks in the selected plan." });
      onOpenChange(false);
      resetState();
    },
    onError: (error: any) => {
      toast({ title: "Failed to save settings", description: error.message, variant: "destructive" });
    },
  });

  const resetState = () => {
    setStep("choose-method");
    setMethod(null);
    setSelectedGroup(null);
    setSelectedPlan(null);
    setNewPlanName("Support Tickets");
    setBucketName("Support Tickets");
    setGroupSearchQuery("");
    setAllGroups([]);
    setNextLink(undefined);
  };

  const handleMethodSelect = (selectedMethod: ConnectionMethod) => {
    setMethod(selectedMethod);
    setStep("select-team");
  };

  const handleTeamSelect = (group: PlannerGroup) => {
    setSelectedGroup(group);
    if (method === "existing-plan") {
      setStep("select-plan");
    } else {
      setStep("create-plan");
      setNewPlanName("Support Tickets");
    }
  };

  const handlePlanSelect = (plan: PlannerPlan) => {
    setSelectedPlan(plan);
    const group = allGroups.find((g) => g.id === plan.owner);
    if (group) {
      setSelectedGroup(group);
    }
    setStep("configure-bucket");
  };

  const handleCreatePlan = () => {
    if (selectedGroup && newPlanName.trim()) {
      createPlanMutation.mutate({ groupId: selectedGroup.id, title: newPlanName.trim() });
    }
  };

  const isConnected = plannerStatus?.connected === true;

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetState();
      }}
    >
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MicrosoftPlannerIcon className="h-5 w-5" />
            Connect Support Tickets to Planner
          </DialogTitle>
          <DialogDescription>
            Enable bidirectional sync between support tickets and Microsoft Planner tasks.
          </DialogDescription>
        </DialogHeader>

        {checkingStatus && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Checking Planner configuration...</span>
          </div>
        )}

        {!checkingStatus && !isConnected && (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
            <p className="font-medium">
              {plannerStatus?.configured ? "Planner permissions issue" : "Planner integration not configured"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {plannerStatus?.message || plannerStatus?.error || "Please contact your administrator to set up the Planner integration."}
            </p>
            {plannerStatus?.permissionIssue && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-left">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>How to fix:</strong> {plannerStatus.permissionIssue}
                </p>
              </div>
            )}
          </div>
        )}

        {!checkingStatus && isConnected && (
          <>
            {step === "choose-method" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Choose how to connect support tickets to Microsoft Planner:
                </p>

                <RadioGroup onValueChange={(v) => handleMethodSelect(v as ConnectionMethod)}>
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="existing-plan" id="support-existing" />
                    <div className="flex-1">
                      <Label htmlFor="support-existing" className="font-medium cursor-pointer">
                        Connect to existing plan
                      </Label>
                      <p className="text-sm text-muted-foreground">Choose from an existing Planner plan in one of your Teams</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="create-in-team" id="support-create" />
                    <div className="flex-1">
                      <Label htmlFor="support-create" className="font-medium cursor-pointer flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Create new plan in existing Team
                      </Label>
                      <p className="text-sm text-muted-foreground">Create a dedicated "Support Tickets" plan inside a Team</p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {step === "select-team" && (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("choose-method");
                    setGroupSearchQuery("");
                  }}
                >
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  {method === "existing-plan" ? "Select a Team to browse its plans:" : "Select a Team to create the support plan in:"}
                </p>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teams..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {groupsResponse && !loadingGroups && (
                  <p className="text-xs text-muted-foreground">
                    {groupsResponse.source === "user"
                      ? `Showing ${filteredGroups.length} team${filteredGroups.length !== 1 ? "s" : ""} you belong to`
                      : `Showing ${filteredGroups.length} team${filteredGroups.length !== 1 ? "s" : ""} in your organization`}
                  </p>
                )}

                {loadingGroups && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}

                {!loadingGroups && filteredGroups.length > 0 && (
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {filteredGroups.map((group) => (
                      <Card
                        key={group.id}
                        className="cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => handleTeamSelect(group)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{group.displayName}</p>
                            {group.description && (
                              <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {nextLink && (
                      <Button variant="outline" size="sm" className="w-full" onClick={loadMoreGroups} disabled={loadingMore}>
                        {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Load more teams
                      </Button>
                    )}
                  </div>
                )}

                {!loadingGroups && filteredGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No teams found</p>
                )}
              </div>
            )}

            {step === "select-plan" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("select-team")}>
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  Select a plan from <strong>{selectedGroup?.displayName}</strong>:
                </p>

                {loadingPlans && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}

                {!loadingPlans && teamPlans && teamPlans.length > 0 && (
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {teamPlans.map((plan) => (
                      <Card
                        key={plan.id}
                        className="cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => handlePlanSelect(plan)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <MicrosoftPlannerIcon className="h-5 w-5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{plan.title}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!loadingPlans && (!teamPlans || teamPlans.length === 0) && (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm text-muted-foreground">No plans found in this team</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMethod("create-in-team");
                        setNewPlanName("Support Tickets");
                        setStep("create-plan");
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create a new plan instead
                    </Button>
                  </div>
                )}
              </div>
            )}

            {step === "create-plan" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("select-team")}>
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  Create a new plan in <strong>{selectedGroup?.displayName}</strong>:
                </p>

                <div className="space-y-2">
                  <Label>Plan Name</Label>
                  <Input
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    placeholder="Support Tickets"
                  />
                </div>

                <Button onClick={handleCreatePlan} disabled={!newPlanName.trim() || createPlanMutation.isPending} className="w-full">
                  {createPlanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Plan
                </Button>
              </div>
            )}

            {step === "configure-bucket" && (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (method === "existing-plan") setStep("select-plan");
                    else setStep("create-plan");
                  }}
                >
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  Configure the bucket name for support ticket tasks:
                </p>

                <div className="space-y-2">
                  <Label>Bucket Name</Label>
                  <Input value={bucketName} onChange={(e) => setBucketName(e.target.value)} placeholder="Support Tickets" />
                  <p className="text-xs text-muted-foreground">
                    Tasks will be created in this bucket. If it doesn't exist, it will be created automatically.
                  </p>
                </div>

                <Button onClick={() => setStep("confirm")} className="w-full">
                  Continue
                </Button>
              </div>
            )}

            {step === "confirm" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("configure-bucket")}>
                  ← Back
                </Button>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <p className="font-medium text-sm">Connection Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Team</span>
                      <span className="font-medium">{selectedGroup?.displayName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-medium">{selectedPlan?.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bucket</span>
                      <span className="font-medium">{bucketName || "Support Tickets"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Bidirectional Auto-Sync Enabled</p>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                    <li>New support tickets automatically create Planner tasks</li>
                    <li>Completing a Planner task automatically closes the ticket</li>
                    <li>Sync runs every 30 minutes to keep everything in sync</li>
                  </ul>
                </div>

                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Connect to Planner
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
