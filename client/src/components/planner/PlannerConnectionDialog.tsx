import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, AlertCircle, Users, FolderKanban, Plus, Search, Hash, Pin, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PlannerConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  clientName?: string;
  clientTeamId?: string;
  clientId?: string;
}

type ConnectionStep = "choose-method" | "select-team" | "select-plan" | "create-plan" | "select-channel" | "create-team" | "create-channel" | "confirm";
type ConnectionMethod = "existing-plan" | "create-in-team" | "create-new-team" | "create-channel-in-team";

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

interface TeamChannel {
  id: string;
  displayName: string;
  description?: string;
  membershipType?: string;
}

interface TeamTemplate {
  id: string;
  displayName: string;
  shortDescription?: string;
}

export function PlannerConnectionDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  clientName,
  clientTeamId,
  clientId
}: PlannerConnectionDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<ConnectionStep>("choose-method");
  const [method, setMethod] = useState<ConnectionMethod | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PlannerGroup | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlannerPlan | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<TeamChannel | null>(null);
  const [pinToChannel, setPinToChannel] = useState(true);
  const [newPlanName, setNewPlanName] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [allGroups, setAllGroups] = useState<PlannerGroup[]>([]);
  const [nextLink, setNextLink] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  
  const [newTeamName, setNewTeamName] = useState(clientName || "");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState(projectName || "");
  const [newChannelDescription, setNewChannelDescription] = useState("");

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
    retry: false
  });

  const { data: groupsResponse, isLoading: loadingGroups } = useQuery<{
    groups: PlannerGroup[];
    source: 'user' | 'all';
    hasAzureMapping: boolean;
    nextLink?: string;
  }>({
    queryKey: ["/api/planner/groups"],
    enabled: open && (step === "select-team" || method === "existing-plan"),
    retry: false
  });

  // Accumulate groups when initial data loads
  useMemo(() => {
    if (groupsResponse?.groups) {
      setAllGroups(groupsResponse.groups);
      setNextLink(groupsResponse.nextLink);
    }
  }, [groupsResponse]);

  // Load more groups
  const loadMoreGroups = async () => {
    if (!nextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const skipToken = encodeURIComponent(nextLink);
      const response = await apiRequest(`/api/planner/groups?skipToken=${skipToken}`);
      setAllGroups(prev => [...prev, ...(response.groups || [])]);
      setNextLink(response.nextLink);
    } catch (error: any) {
      toast({ title: "Failed to load more teams", description: error.message, variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!groupSearchQuery.trim()) return allGroups;
    const query = groupSearchQuery.toLowerCase();
    return allGroups.filter(g => 
      g.displayName.toLowerCase().includes(query) ||
      g.description?.toLowerCase().includes(query)
    );
  }, [allGroups, groupSearchQuery]);

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

  // Fetch channels for the selected team (for pinning the plan as a tab)
  const { data: channels, isLoading: loadingChannels } = useQuery<TeamChannel[]>({
    queryKey: ["/api/planner/teams", selectedGroup?.id, "channels"],
    enabled: open && selectedGroup !== null && (step === "select-channel" || step === "create-channel"),
    retry: false
  });

  // Fetch team templates for creating new teams
  const { data: teamTemplates, isLoading: loadingTemplates } = useQuery<TeamTemplate[]>({
    queryKey: ["/api/planner/team-templates"],
    enabled: open && step === "create-team",
    retry: false
  });

  // Mutation to create a new Team
  const createTeamMutation = useMutation({
    mutationFn: async ({ displayName, description, templateId, clientId: cId }: { displayName: string; description?: string; templateId?: string; clientId?: string }) => {
      return await apiRequest(`/api/planner/teams`, {
        method: "POST",
        body: JSON.stringify({ displayName, description, templateId, clientId: cId })
      });
    },
    onSuccess: (team) => {
      setSelectedGroup({ id: team.id, displayName: team.displayName, description: team.description });
      toast({ title: "Team created", description: `"${team.displayName}" was created successfully.` });
      // Now ask about creating a channel for the project
      setNewChannelName(projectName || "");
      setStep("create-channel");
    },
    onError: (error: any) => {
      toast({ title: "Failed to create team", description: error.message, variant: "destructive" });
    }
  });

  // Mutation to create a new Channel
  const createChannelMutation = useMutation({
    mutationFn: async ({ teamId, displayName, description }: { teamId: string; displayName: string; description?: string }) => {
      return await apiRequest(`/api/planner/teams/${teamId}/channels`, {
        method: "POST",
        body: JSON.stringify({ displayName, description, membershipType: 'standard' })
      });
    },
    onSuccess: (channel) => {
      setSelectedChannel(channel);
      toast({ title: "Channel created", description: `"${channel.displayName}" was created successfully.` });
      // Now create a plan in this channel
      setNewPlanName(projectName || "");
      setStep("create-plan");
    },
    onError: (error: any) => {
      toast({ title: "Failed to create channel", description: error.message, variant: "destructive" });
    }
  });

  const createTabMutation = useMutation({
    mutationFn: async ({ teamId, channelId, planId, planTitle }: { teamId: string; channelId: string; planId: string; planTitle: string }) => {
      return await apiRequest(`/api/planner/teams/${teamId}/channels/${channelId}/tabs`, {
        method: "POST",
        body: JSON.stringify({ planId, planTitle })
      });
    },
    onSuccess: () => {
      toast({ title: "Plan pinned to channel", description: "The Planner tab has been added to the selected channel." });
    },
    onError: (error: any) => {
      // Don't fail the whole flow, just notify
      toast({ 
        title: "Could not pin plan to channel", 
        description: error.message || "The plan was connected but the tab was not created. You can manually add it in Teams.",
        variant: "destructive" 
      });
    }
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ groupId, title }: { groupId: string; title: string }) => {
      return await apiRequest(`/api/planner/groups/${groupId}/plans`, {
        method: "POST",
        body: JSON.stringify({ title })
      });
    },
    onSuccess: (plan) => {
      setSelectedPlan(plan);
      // After creating plan, ask if user wants to pin it to a channel
      setStep("select-channel");
      toast({ title: "Plan created in Microsoft Planner" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create plan", description: error.message, variant: "destructive" });
    }
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/planner-connection`, {
        method: "POST",
        body: JSON.stringify({
          planId: selectedPlan?.id,
          planTitle: selectedPlan?.title,
          groupId: selectedGroup?.id,
          groupName: selectedGroup?.displayName,
          channelId: selectedChannel?.id,
          channelName: selectedChannel?.displayName,
          syncDirection: "bidirectional"
        })
      });
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
    setSelectedChannel(null);
    setPinToChannel(true);
    setNewPlanName("");
    setGroupSearchQuery("");
    setAllGroups([]);
    setNextLink(undefined);
    setNewTeamName(clientName || "");
    setNewTeamDescription("");
    setSelectedTemplateId(null);
    setNewChannelName(projectName || "");
    setNewChannelDescription("");
  };

  const handleMethodSelect = (selectedMethod: ConnectionMethod) => {
    setMethod(selectedMethod);
    if (selectedMethod === "existing-plan") {
      setStep("select-plan");
    } else if (selectedMethod === "create-in-team") {
      setStep("select-team");
    } else if (selectedMethod === "create-new-team") {
      setNewTeamName(clientName || "");
      setStep("create-team");
    } else if (selectedMethod === "create-channel-in-team") {
      setStep("select-team");
    }
  };

  const handleTeamSelect = (group: PlannerGroup) => {
    setSelectedGroup(group);
    if (method === "create-channel-in-team") {
      // Go to channel creation step
      setNewChannelName(projectName || "");
      setStep("create-channel");
    } else {
      setStep("create-plan");
      setNewPlanName(projectName);
    }
  };

  const handlePlanSelect = (plan: PlannerPlan) => {
    setSelectedPlan(plan);
    const groups = groupsResponse?.groups || [];
    const group = groups.find((g: PlannerGroup) => g.id === plan.owner);
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

  const handleConnect = async () => {
    // First connect to Planner
    connectMutation.mutate(undefined, {
      onSuccess: async () => {
        // After successful connection, create tab if channel was selected
        if (pinToChannel && selectedChannel && selectedGroup && selectedPlan) {
          createTabMutation.mutate({
            teamId: selectedGroup.id,
            channelId: selectedChannel.id,
            planId: selectedPlan.id,
            planTitle: selectedPlan.title
          });
        }
      }
    });
  };

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

        {!checkingStatus && !isConnected && (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
            <p className="font-medium">
              {plannerStatus?.configured ? 'Planner permissions issue' : 'Planner integration not configured'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {plannerStatus?.message || plannerStatus?.error || 'Please contact your administrator to set up the Planner integration.'}
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
                        Create new plan in existing Team
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Create a new plan inside an existing Microsoft Team
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="create-channel-in-team" id="create-channel" />
                    <div className="flex-1">
                      <Label htmlFor="create-channel" className="font-medium cursor-pointer flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Create new channel in existing Team
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Add a new channel for this project in an existing Team
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer border-blue-200 dark:border-blue-800">
                    <RadioGroupItem value="create-new-team" id="new-team" />
                    <div className="flex-1">
                      <Label htmlFor="new-team" className="font-medium cursor-pointer flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Create new Team {clientName && `for "${clientName}"`}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Create a new Microsoft Team, channel, and plan for this project
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {step === "select-team" && (
              <div className="space-y-4" data-testid="planner-team-selection">
                <Button variant="ghost" size="sm" onClick={() => { setStep("choose-method"); setGroupSearchQuery(""); }}>
                  ← Back
                </Button>
                <p className="text-sm text-muted-foreground">
                  Select a Team to create the plan in:
                </p>

                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teams..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="team-search-input"
                  />
                </div>

                {/* Source indicator */}
                {groupsResponse && !loadingGroups && (
                  <p className="text-xs text-muted-foreground">
                    {groupsResponse.source === 'user' 
                      ? `Showing ${filteredGroups.length} team${filteredGroups.length !== 1 ? 's' : ''} you belong to`
                      : `Showing ${filteredGroups.length} team${filteredGroups.length !== 1 ? 's' : ''} in your organization`
                    }
                  </p>
                )}
                
                {loadingGroups && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                
                {!loadingGroups && filteredGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {groupSearchQuery 
                      ? "No teams match your search."
                      : "No Microsoft Teams found. Make sure you're a member of at least one team."
                    }
                  </p>
                )}
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {filteredGroups.map((group) => (
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
                  
                  {/* Load More button */}
                  {nextLink && !groupSearchQuery && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={loadMoreGroups}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        "Load More Teams"
                      )}
                    </Button>
                  )}
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

            {step === "create-team" && (
              <div className="space-y-4" data-testid="planner-create-team">
                <Button variant="ghost" size="sm" onClick={() => setStep("choose-method")}>
                  ← Back
                </Button>
                
                <p className="text-sm text-muted-foreground">
                  Create a new Microsoft Team for this client:
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-name">Team Name</Label>
                    <Input
                      id="team-name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder={clientName || "Enter team name"}
                      data-testid="input-team-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Default: Client name
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="team-description">Description (optional)</Label>
                    <Textarea
                      id="team-description"
                      value={newTeamDescription}
                      onChange={(e) => setNewTeamDescription(e.target.value)}
                      placeholder="Enter team description"
                      rows={2}
                    />
                  </div>

                  {loadingTemplates && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading templates...</span>
                    </div>
                  )}

                  {!loadingTemplates && teamTemplates && teamTemplates.length > 0 && (
                    <div className="space-y-2">
                      <Label>Team Template (optional)</Label>
                      <Select value={selectedTemplateId || ""} onValueChange={(v) => setSelectedTemplateId(v || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Standard template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Standard template</SelectItem>
                          {teamTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplateId && teamTemplates.find(t => t.id === selectedTemplateId)?.shortDescription && (
                        <p className="text-xs text-muted-foreground">
                          {teamTemplates.find(t => t.id === selectedTemplateId)?.shortDescription}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Button 
                  onClick={() => createTeamMutation.mutate({ 
                    displayName: newTeamName.trim(), 
                    description: newTeamDescription.trim() || undefined,
                    templateId: selectedTemplateId || undefined,
                    clientId
                  })}
                  disabled={!newTeamName.trim() || createTeamMutation.isPending}
                  className="w-full"
                  data-testid="button-create-team"
                >
                  {createTeamMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Team...
                    </>
                  ) : (
                    <>
                      <Building2 className="mr-2 h-4 w-4" />
                      Create Team
                    </>
                  )}
                </Button>
              </div>
            )}

            {step === "create-channel" && selectedGroup && (
              <div className="space-y-4" data-testid="planner-create-channel">
                <Button variant="ghost" size="sm" onClick={() => {
                  if (method === "create-new-team") {
                    setStep("create-team");
                  } else {
                    setStep("select-team");
                  }
                }}>
                  ← Back
                </Button>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Creating channel in
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">{selectedGroup.displayName}</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="channel-name">Channel Name</Label>
                    <Input
                      id="channel-name"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder={projectName || "Enter channel name"}
                      data-testid="input-channel-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Default: Project name
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="channel-description">Description (optional)</Label>
                    <Textarea
                      id="channel-description"
                      value={newChannelDescription}
                      onChange={(e) => setNewChannelDescription(e.target.value)}
                      placeholder="Enter channel description"
                      rows={2}
                    />
                  </div>
                </div>

                <Button 
                  onClick={() => createChannelMutation.mutate({ 
                    teamId: selectedGroup.id,
                    displayName: newChannelName.trim(), 
                    description: newChannelDescription.trim() || undefined
                  })}
                  disabled={!newChannelName.trim() || createChannelMutation.isPending}
                  className="w-full"
                  data-testid="button-create-channel"
                >
                  {createChannelMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Channel...
                    </>
                  ) : (
                    <>
                      <Hash className="mr-2 h-4 w-4" />
                      Create Channel
                    </>
                  )}
                </Button>
              </div>
            )}

            {step === "create-plan" && selectedGroup && (
              <div className="space-y-4" data-testid="planner-create-plan">
                <Button variant="ghost" size="sm" onClick={() => {
                  if (selectedChannel && (method === "create-new-team" || method === "create-channel-in-team")) {
                    setStep("create-channel");
                  } else {
                    setStep("select-team");
                  }
                }}>
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

            {step === "select-channel" && selectedGroup && selectedPlan && (
              <div className="space-y-4" data-testid="planner-select-channel">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Plan created: {selectedPlan.title}</span>
                </div>

                <div className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/50">
                  <Checkbox 
                    id="pin-to-channel"
                    checked={pinToChannel}
                    onCheckedChange={(checked) => setPinToChannel(checked === true)}
                  />
                  <div className="flex-1">
                    <Label htmlFor="pin-to-channel" className="font-medium cursor-pointer flex items-center gap-2">
                      <Pin className="h-4 w-4" />
                      Pin plan as a tab in Teams
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add this plan as a tab in a Teams channel for easy access
                    </p>
                  </div>
                </div>

                {pinToChannel && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Select a channel to pin the plan to:
                    </p>
                    
                    {loadingChannels && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                    
                    {!loadingChannels && channels && channels.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No channels found. The plan will be connected without a tab.
                      </p>
                    )}
                    
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {channels?.map((channel) => (
                        <Card 
                          key={channel.id} 
                          className={`cursor-pointer hover:bg-accent transition-colors ${
                            selectedChannel?.id === channel.id ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => setSelectedChannel(channel)}
                          data-testid={`channel-option-${channel.id}`}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <Hash className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{channel.displayName}</p>
                              {channel.membershipType === 'private' && (
                                <span className="text-xs text-muted-foreground">Private</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
                
                <Button 
                  onClick={() => setStep("confirm")}
                  disabled={pinToChannel && !selectedChannel && channels && channels.length > 0}
                  className="w-full"
                  data-testid="button-continue-to-confirm"
                >
                  Continue
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
                    {pinToChannel && selectedChannel && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pin to channel:</span>
                        <span className="font-medium flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {selectedChannel.displayName}
                        </span>
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
                    disabled={connectMutation.isPending || createTabMutation.isPending}
                    className="flex-1"
                    data-testid="button-connect"
                  >
                    {(connectMutation.isPending || createTabMutation.isPending) ? (
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
