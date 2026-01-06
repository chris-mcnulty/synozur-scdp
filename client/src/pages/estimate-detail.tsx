import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Plus, Trash2, Download, Upload, Save, FileDown, Edit, Split, Check, X, FileCheck, Briefcase, FileText, Wand2, Calculator, Pencil, ChevronDown, ChevronRight, ChevronUp, ArrowUp, ArrowDown, Sparkles, Copy, Loader2, AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { EstimateLineItem, Estimate, EstimateEpic, EstimateStage, EstimateMilestone, Project } from "@shared/schema";
import { PMWizardDialog } from "@/components/pm-wizard-dialog";
import { RateOverridesSection } from "@/components/RateOverridesSection";
import { RatePrecedenceBadge } from "@/components/RatePrecedenceBadge";
import { VocabularyProvider, useVocabulary } from "@/lib/vocabulary-context";
import { useEffectiveRates } from "@/hooks/useEffectiveRates";
import { useGenerateEstimateNarrative, useAIStatus } from "@/lib/ai";

function EstimateDetailContent() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const vocabulary = useVocabulary();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<string | null>(null); // format: "itemId-fieldName"
  const [editingDraft, setEditingDraft] = useState<Record<string, any>>({});
  const [pendingAttributes, setPendingAttributes] = useState<Record<string, { size?: string; complexity?: string; confidence?: string }>>({});
  const [showEpicDialog, setShowEpicDialog] = useState(false);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [selectedEpicForStage, setSelectedEpicForStage] = useState("");
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [newMilestone, setNewMilestone] = useState({
    name: "",
    description: "",
    amount: "",
    percentage: "",
    dueDate: ""
  });
  const [editingMilestone, setEditingMilestone] = useState<any>(null);
  const [showMilestoneEditDialog, setShowMilestoneEditDialog] = useState(false);
  const [presentedTotal, setPresentedTotal] = useState("");
  const [margin, setMargin] = useState("");
  const [editingEstimateName, setEditingEstimateName] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkEditDialog, setBulkEditDialog] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    epicId: "",
    stageId: "",
    workstream: "",
    week: "",
    size: "",
    complexity: "",
    confidence: "",
    rate: "",
    category: ""
  });
  const [applyUserRatesDialog, setApplyUserRatesDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [filterText, setFilterText] = useState("");
  const [filterEpic, setFilterEpic] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [filterWorkstream, setFilterWorkstream] = useState("");
  const [filterWeek, setFilterWeek] = useState("all");
  const [filterResource, setFilterResource] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showResourceSummary, setShowResourceSummary] = useState(false);
  
  // Toggle expanded row state
  const toggleExpandRow = (itemId: string) => {
    setExpandedRows(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(itemId)) {
        newExpanded.delete(itemId);
      } else {
        newExpanded.add(itemId);
      }
      return newExpanded;
    });
  };
  const [showEpicManagement, setShowEpicManagement] = useState(false);
  const [showStageManagement, setShowStageManagement] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splittingItem, setSplittingItem] = useState<EstimateLineItem | null>(null);
  const [splitHours, setSplitHours] = useState({ first: "", second: "" });
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [blockHourDescription, setBlockHourDescription] = useState("");
  const [shouldCreateProject, setShouldCreateProject] = useState(true);
  const [shouldCopyAssignments, setShouldCopyAssignments] = useState(true);
  const [kickoffDate, setKickoffDate] = useState<string>("");
  const [fixedPriceInput, setFixedPriceInput] = useState<string>("");
  const [showPMWizard, setShowPMWizard] = useState(false);
  const [showRecalcDialog, setShowRecalcDialog] = useState(false);
  const [blockHoursInput, setBlockHoursInput] = useState<string>("");
  const [blockDollarsInput, setBlockDollarsInput] = useState<string>("");
  const [blockDescriptionInput, setBlockDescriptionInput] = useState<string>("");
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [editingEpicName, setEditingEpicName] = useState<string>("");
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<string | null>(null);
  const [importType, setImportType] = useState<'excel' | 'csv'>('excel');
  const [showMissingRolesWizard, setShowMissingRolesWizard] = useState(false);
  const [missingRoles, setMissingRoles] = useState<{ name: string; billingRate: string; costRate: string; usageCount: number }[]>([]);
  const [isValidatingImport, setIsValidatingImport] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState<string>("");
  const [showNarrativeDialog, setShowNarrativeDialog] = useState(false);
  const [generatedNarrative, setGeneratedNarrative] = useState<string>("");
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    description: "",
    epicId: "none",
    stageId: "none",
    workstream: "",
    week: "",
    baseHours: "",
    factor: "1",
    rate: "0",
    costRate: "0",
    size: "small",
    complexity: "small",
    confidence: "high",
    comments: "",
    userId: "",
    resourceName: ""
  });

  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ['/api/estimates', id],
    enabled: !!id,
    retry: 1,
  });

  // Check if estimate is editable (only draft estimates can be modified)
  const isEditable = estimate?.status === 'draft';

  const { data: lineItems = [], isLoading, error: lineItemsError } = useQuery<EstimateLineItem[]>({
    queryKey: ['/api/estimates', id, 'line-items'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  // Fetch projects for project selection dropdown
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Get IDs of users currently assigned to any line item
  const currentlyAssignedUserIds = new Set(
    lineItems.map((item: EstimateLineItem) => item.assignedUserId).filter(Boolean)
  );

  // Include users that are either assignable OR currently assigned (so admins can change assignments)
  const assignableUsers = users.filter((u: any) => 
    (u.isAssignable && u.isActive) || currentlyAssignedUserIds.has(u.id)
  );

  // Function to get filtered line items based on current filter criteria
  const getFilteredLineItems = () => {
    const filtered = lineItems.filter((item: EstimateLineItem) => {
      const matchesText = !filterText || item.description.toLowerCase().includes(filterText.toLowerCase());
      const matchesEpic = filterEpic === "all" || 
        (filterEpic === "none" && (!item.epicId || item.epicId === "none")) ||
        item.epicId === filterEpic;
      const matchesStage = filterStage === "all" || 
        (filterStage === "none" && (!item.stageId || item.stageId === "none")) ||
        item.stageId === filterStage;
      const matchesWorkstream = !filterWorkstream || 
        (item.workstream && item.workstream.toLowerCase().includes(filterWorkstream.toLowerCase()));
      // Allow filtering by week 0 - treat null/undefined as 0
      const itemWeek = item.week ?? 0;
      const matchesWeek = filterWeek === "all" || itemWeek.toString() === filterWeek;
      const matchesResource = filterResource === "all" || 
        (filterResource === "unassigned" && !item.assignedUserId && !item.roleId) ||
        (filterResource !== "unassigned" && item.resourceName === filterResource);
      
      return matchesText && matchesEpic && matchesStage && matchesWorkstream && matchesWeek && matchesResource;
    });
    
    // Default sort by week (ascending)
    return filtered.sort((a, b) => {
      const weekA = a.week ?? 0;
      const weekB = b.week ?? 0;
      return Number(weekA) - Number(weekB);
    });
  };

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
  });

  const { user, canViewCostMargins } = useAuth();

  const { data: epics = [], error: epicsError } = useQuery<EstimateEpic[]>({
    queryKey: ['/api/estimates', id, 'epics'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const { data: stages = [], error: stagesError } = useQuery<EstimateStage[]>({
    queryKey: ['/api/estimates', id, 'stages'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const { data: milestones = [] } = useQuery<EstimateMilestone[]>({
    queryKey: ['/api/estimates', id, 'milestones'],
    enabled: !!id && !!estimate,
    retry: 1,
  });

  const { data: effectiveRates = [], isLoading: ratesLoading } = useEffectiveRates(id);

  const effectiveRateById = useMemo(
    () => new Map(effectiveRates.map(rate => [rate.lineItemId, rate])),
    [effectiveRates]
  );

  const { data: aiStatus } = useAIStatus();
  const generateNarrativeMutation = useGenerateEstimateNarrative();

  const handleGenerateNarrative = async () => {
    if (!id) return;
    
    setShowNarrativeDialog(true);
    setGeneratedNarrative("");
    setNarrativeError(null);
    
    try {
      const result = await generateNarrativeMutation.mutateAsync(id);
      setGeneratedNarrative(result.narrative);
    } catch (error: any) {
      const errorMsg = error.message || "Failed to generate narrative. Please try again.";
      setNarrativeError(errorMsg);
      toast({
        title: "Failed to generate narrative",
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  const handleCopyNarrative = () => {
    navigator.clipboard.writeText(generatedNarrative);
    toast({
      title: "Copied to clipboard",
      description: "Narrative copied successfully"
    });
  };

  const createEpicMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest(`/api/estimates/${id}/epics`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
      setNewEpicName("");
      setShowEpicDialog(false);
      toast({ title: `${vocabulary.epic} created successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to create ${vocabulary.epic.toLowerCase()}`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const createStageMutation = useMutation({
    mutationFn: async (data: { epicId: string; name: string }) => {
      return apiRequest(`/api/estimates/${id}/stages`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      setNewStageName("");
      setSelectedEpicForStage("");
      setShowStageDialog(false);
      toast({ title: `${vocabulary.stage} created successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to create ${vocabulary.stage.toLowerCase()}`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const updateEpicMutation = useMutation({
    mutationFn: async ({ epicId, name, order }: { epicId: string; name?: string; order?: number }) => {
      const body: { name?: string; order?: number } = {};
      if (name !== undefined) body.name = name;
      if (order !== undefined) body.order = order;
      return apiRequest(`/api/estimates/${id}/epics/${epicId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
      // Also refresh line items since they may display epic names
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: `${vocabulary.epic} updated successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to update ${vocabulary.epic.toLowerCase()}`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const deleteEstimateEpicMutation = useMutation({
    mutationFn: async (epicId: string) => {
      return apiRequest(`/api/estimates/${id}/epics/${epicId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: `${vocabulary.epic} deleted successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to delete ${vocabulary.epic.toLowerCase()}`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ stageId, name, order }: { stageId: string; name?: string; order?: number }) => {
      const body: { name?: string; order?: number } = {};
      if (name !== undefined) body.name = name;
      if (order !== undefined) body.order = order;
      return apiRequest(`/api/estimates/${id}/stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      // Also refresh line items since they may display stage names
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: `${vocabulary.stage} updated successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to update ${vocabulary.stage.toLowerCase()}`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const deleteEstimateStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      return apiRequest(`/api/estimates/${id}/stages/${stageId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: `${vocabulary.stage} deleted successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to delete ${vocabulary.stage.toLowerCase()}`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const mergeStagesMutation = useMutation({
    mutationFn: async (data: { keepStageId: string; deleteStageId: string }) => {
      return apiRequest(`/api/estimates/${id}/stages/merge`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: `${vocabulary.stage}s merged successfully` });
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to merge ${vocabulary.stage.toLowerCase()}s`, 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/estimates/${id}/line-items`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setNewItem({
        description: "",
        epicId: "none",
        stageId: "none",
        workstream: "",
        week: "",
        baseHours: "",
        factor: "1",
        rate: "0",
        costRate: "0",
        size: "small",
        complexity: "small",
        confidence: "high",
        comments: "",
        userId: "",
        resourceName: ""
      });
      toast({ title: "Input added successfully" });
    },
    onError: (error: any) => {
      console.error("Failed to create line item - Full error:", error);
      console.error("Error response:", error.response);
      console.error("Error details:", error.details);
      
      let errorMessage = "Please check your input and try again";
      
      if (error.message?.includes("session")) {
        errorMessage = "Session expired. Please refresh the page and try again.";
      } else if (error.details) {
        errorMessage = error.details;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({ 
        title: "Failed to add line item", 
        description: errorMessage,
        variant: "destructive" 
      });
    }
  });

  const updateLineItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: any }) => 
      apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setEditingField(null);
      setPendingAttributes(prev => {
        const next = { ...prev };
        if (next[variables.itemId]) {
          if (variables.data.size !== undefined) delete next[variables.itemId].size;
          if (variables.data.complexity !== undefined) delete next[variables.itemId].complexity;
          if (variables.data.confidence !== undefined) delete next[variables.itemId].confidence;
          if (Object.keys(next[variables.itemId]).length === 0) {
            delete next[variables.itemId];
          }
        }
        return next;
      });
      toast({ title: "Line item updated successfully" });
    }
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: (itemId: string) => 
      apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: "Line item deleted successfully" });
    }
  });

  const updateEstimateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/estimates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      // If referral fee fields changed, also refresh line items since they contain referralMarkup
      if ('referralFeeType' in variables || 'referralFeePercent' in variables || 'referralFeeFlat' in variables) {
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      }
      toast({ title: "Estimate updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update estimate", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const recalculateEstimateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/estimates/${id}/recalculate`, {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setShowRecalcDialog(false);
      toast({ 
        title: "Estimate recalculated successfully",
        description: data.message
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to recalculate estimate", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  // Initialize inputs when estimate loads
  useEffect(() => {
    if (estimate?.fixedPrice !== undefined) {
      setFixedPriceInput(estimate.fixedPrice?.toString() || "");
    }
    if (estimate?.blockHours !== undefined) {
      setBlockHoursInput(estimate.blockHours?.toString() || "");
    }
    if (estimate?.blockDollars !== undefined) {
      setBlockDollarsInput(estimate.blockDollars?.toString() || "");
    }
    if (estimate?.blockDescription !== undefined) {
      setBlockDescriptionInput(estimate.blockDescription || "");
    }
  }, [estimate?.fixedPrice, estimate?.blockHours, estimate?.blockDollars, estimate?.blockDescription]);

  const approveEstimateMutation = useMutation({
    mutationFn: async ({ createProject, copyAssignments, blockHourDescription, kickoffDate }: { createProject: boolean; copyAssignments?: boolean; blockHourDescription?: string; kickoffDate?: string }) => {
      return apiRequest(`/api/estimates/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ createProject, copyAssignments, blockHourDescription, kickoffDate }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      setShowApprovalDialog(false);
      setBlockHourDescription("");
      setKickoffDate("");
      setShouldCopyAssignments(true);
      if (data.project) {
        toast({ 
          title: estimate?.status === 'approved' ? "Project created" : "Estimate approved", 
          description: `Project "${data.project.name}" created successfully.` 
        });
        // Navigate to the new project
        setTimeout(() => {
          setLocation(`/projects/${data.project.id}`);
        }, 1500);
      } else {
        toast({ title: "Estimate approved successfully" });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: estimate?.status === 'approved' ? "Failed to create project" : "Failed to approve estimate", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const rejectEstimateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/estimates/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      toast({ title: "Estimate rejected" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to reject estimate", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const revertApprovalMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/estimates/${id}/revert-approval`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      toast({ 
        title: "Estimate reverted to Final", 
        description: "The approval has been undone successfully." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to revert approval", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ itemIds, updates }: { itemIds: string[]; updates: any }) => {
      // Update each item individually
      const promises = itemIds.map(itemId => 
        apiRequest(`/api/estimates/${id}/line-items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setSelectedItems(new Set());
      setBulkEditDialog(false);
      setBulkEditData({ epicId: "", stageId: "", workstream: "", week: "", size: "", complexity: "", confidence: "", rate: "", category: "" });
      toast({ title: "Bulk update completed successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to bulk update", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/estimates/${id}/milestones`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'milestones'] });
      setShowMilestoneDialog(false);
      setNewMilestone({ name: "", description: "", amount: "", percentage: "", dueDate: "" });
      toast({
        title: "Success",
        description: "Milestone created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Failed to create milestone - Full error:", error);
      toast({ 
        title: "Failed to create milestone", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: ({ milestoneId, data }: { milestoneId: string; data: any }) => 
      apiRequest(`/api/estimates/${id}/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'milestones'] });
      toast({ title: "Milestone updated successfully" });
    }
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: (milestoneId: string) => 
      apiRequest(`/api/estimates/${id}/milestones/${milestoneId}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'milestones'] });
      toast({ title: "Milestone deleted successfully" });
    }
  });

  const splitLineItemMutation = useMutation({
    mutationFn: ({ itemId, firstHours, secondHours }: { itemId: string; firstHours: number; secondHours: number }) => 
      apiRequest(`/api/estimates/${id}/line-items/${itemId}/split`, {
        method: "POST",
        body: JSON.stringify({ firstHours: String(firstHours), secondHours: String(secondHours) })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setShowSplitDialog(false);
      setSplittingItem(null);
      setSplitHours({ first: "", second: "" });
      toast({ title: "Line item split successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to split line item", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const getEffectiveAttributes = (item: EstimateLineItem) => {
    const pending = pendingAttributes[item.id] || {};
    return {
      size: pending.size || item.size,
      complexity: pending.complexity || item.complexity,
      confidence: pending.confidence || item.confidence
    };
  };

  const calculateAdjustedValues = (baseHours: number, factor: number, rate: number, costRate: number, size: string, complexity: string, confidence: string) => {
    if (!estimate) return { adjustedHours: 0, totalAmount: 0, totalCost: 0, margin: 0, marginPercent: 0 };
    
    let sizeMultiplier = 1.0;
    if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
    else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);
    
    let complexityMultiplier = 1.0;
    if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
    else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);
    
    let confidenceMultiplier = 1.0;
    if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
    else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);
    
    const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
    const totalAmount = adjustedHours * rate;
    const totalCost = adjustedHours * costRate;
    const margin = totalAmount - totalCost;
    const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
    
    return { adjustedHours, totalAmount, totalCost, margin, marginPercent };
  };

  const handleAddItem = () => {
    const baseHours = Number(newItem.baseHours);
    const factor = Number(newItem.factor) || 1;
    const rate = Number(newItem.rate);
    const costRate = Number(newItem.costRate) || 0;
    const week = newItem.week ? Number(newItem.week) : null;
    
    if (isNaN(baseHours) || isNaN(factor) || isNaN(rate)) {
      toast({
        title: "Invalid input",
        description: "Please enter valid numbers for hours, factor, and rate",
        variant: "destructive"
      });
      return;
    }
    
    // Allow week 0 for pre-kickoff work
    if (week !== null && week < 0) {
      toast({
        title: "Invalid week number",
        description: "Week number must be 0 or greater (0 = pre-kickoff work)",
        variant: "destructive"
      });
      return;
    }
    
    const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
      baseHours, factor, rate, costRate, newItem.size, newItem.complexity, newItem.confidence
    );
    
    // Backend normalizeEstimateLineItemPayload will handle type conversion
    // But we MUST send strings for numeric fields to pass Zod validation
    const lineItemData = {
      description: newItem.description,
      epicId: newItem.epicId === "none" ? null : newItem.epicId,
      stageId: newItem.stageId === "none" ? null : newItem.stageId,
      workstream: newItem.workstream || null,
      week: week !== null ? String(week) : null,
      baseHours: String(baseHours),
      factor: String(factor),
      rate: String(rate),
      costRate: String(costRate),
      size: newItem.size,
      complexity: newItem.complexity,
      confidence: newItem.confidence,
      comments: newItem.comments || null,
      assignedUserId: newItem.userId || null,  // Changed from userId to assignedUserId
      resourceName: newItem.resourceName || null,
      adjustedHours: String(adjustedHours),
      totalAmount: String(totalAmount),
      totalCost: String(totalCost),
      margin: String(margin),
      marginPercent: String(marginPercent),
      sortOrder: lineItems?.length || 0
    };
    
    createLineItemMutation.mutate(lineItemData);
  };

  // Start editing a specific field
  const startFieldEditing = (item: EstimateLineItem, fieldName: string) => {
    const fieldKey = `${item.id}-${fieldName}`;
    setEditingField(fieldKey);
    const defaultValue = fieldName === 'factor' ? 1 : (fieldName === 'baseHours' ? 0 : "");
    setEditingDraft({
      [fieldKey]: item[fieldName as keyof EstimateLineItem] || defaultValue
    });
  };

  // Update draft state during editing
  const updateFieldDraft = (itemId: string, fieldName: string, value: any) => {
    const fieldKey = `${itemId}-${fieldName}`;
    setEditingDraft(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  // Save a specific field's changes to server
  const saveFieldDraft = (item: EstimateLineItem, fieldName: string) => {
    const fieldKey = `${item.id}-${fieldName}`;
    const draftValue = editingDraft[fieldKey];
    if (draftValue === undefined) return;

    // Create update data for this specific field
    // Backend normalizeEstimateLineItemPayload will handle type conversion
    let updateData: any = {};
    
    // List of numeric fields that backend will normalize
    const numericFields = ['baseHours', 'factor', 'rate', 'costRate', 'week'];
    
    if (numericFields.includes(fieldName)) {
      // Parse for validation
      const numValue = Number(draftValue);
      
      // Validate week number (0 is allowed for pre-kickoff)
      if (fieldName === 'week' && draftValue !== '' && numValue < 0) {
        toast({
          title: "Invalid week number",
          description: "Week number must be 0 or greater (0 = pre-kickoff work)",
          variant: "destructive"
        });
        return;
      }
      
      // Send as string or null (backend expects strings for Zod validation)
      updateData[fieldName] = draftValue !== '' ? String(numValue) : null;
    } else {
      updateData[fieldName] = draftValue;
    }
    
    // For fields that affect calculations, include calculated values
    let finalData = updateData;
    if (['baseHours', 'factor', 'rate', 'costRate'].includes(fieldName)) {
      const baseHours = fieldName === 'baseHours' ? Number(draftValue) : Number(item.baseHours);
      const factor = fieldName === 'factor' ? Number(draftValue) : Number(item.factor) || 1;
      const rate = fieldName === 'rate' ? Number(draftValue) : Number(item.rate);
      const costRate = fieldName === 'costRate' ? Number(draftValue) : Number(item.costRate || 0);
      
      const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
        baseHours, factor, rate, costRate, item.size, item.complexity, item.confidence
      );
      
      finalData = {
        ...updateData,
        adjustedHours: String(adjustedHours),
        totalAmount: String(totalAmount),
        totalCost: String(totalCost),
        margin: String(margin),
        marginPercent: String(marginPercent)
      };
    }
    
    updateLineItemMutation.mutate({
      itemId: item.id,
      data: finalData
    }, {
      onSuccess: () => {
        // Clear only this field's editing state
        setEditingField(null);
        setEditingDraft(prev => {
          const newDraft = { ...prev };
          delete newDraft[fieldKey];
          return newDraft;
        });
      },
      onError: (error) => {
        toast({ 
          title: "Failed to save changes", 
          description: "Please try again", 
          variant: "destructive" 
        });
      }
    });
  };

  // Legacy function for non-draft updates (like dropdowns)
  const handleUpdateItem = (item: EstimateLineItem, field: string, value: any) => {
    const updatedItem = { ...item, [field]: value };
    const baseHours = Number(updatedItem.baseHours);
    const factor = Number(updatedItem.factor) || 1;
    const rate = Number(updatedItem.rate);
    const costRate = Number(updatedItem.costRate || 0);
    const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
      baseHours, factor, rate, costRate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
    );
    
    // Send numeric fields as strings - backend Zod validation expects strings
    // Convert all numeric fields to strings
    const dataToSend: any = {};
    for (const [key, value] of Object.entries(updatedItem)) {
      if (['baseHours', 'factor', 'rate', 'costRate', 'week', 'adjustedHours', 'totalAmount', 'totalCost', 'margin', 'marginPercent'].includes(key)) {
        dataToSend[key] = value !== null && value !== undefined && value !== '' ? String(value) : value;
      } else {
        dataToSend[key] = value;
      }
    }
    
    updateLineItemMutation.mutate({
      itemId: item.id,
      data: {
        ...dataToSend,
        adjustedHours: String(adjustedHours),
        totalAmount: String(totalAmount),
        totalCost: String(totalCost),
        margin: String(margin),
        marginPercent: String(marginPercent)
      }
    });
  };

  const handleExportExcel = async () => {
    try {
      const response = await fetch(`/api/estimates/${id}/export-excel`, {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimate-${id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Failed to export Excel file", variant: "destructive" });
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`/api/estimates/${id}/export-csv`, {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use estimate name, sanitized for filename safety
      const safeName = (estimate?.name || 'estimate').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `${safeName}-export.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "CSV exported successfully" });
    } catch (error) {
      toast({ title: "Failed to export CSV file", variant: "destructive" });
    }
  };

  const handleExportText = async () => {
    try {
      const response = await fetch(`/api/estimates/${id}/export-text`, {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use estimate name, sanitized for filename safety
      const safeName = (estimate?.name || 'estimate').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `${safeName}-ai-export.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Text export downloaded successfully" });
    } catch (error) {
      toast({ title: "Failed to export text file", variant: "destructive" });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/api/estimates/template-excel", {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "estimate-template.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Template downloaded successfully" });
    } catch (error) {
      toast({ title: "Failed to download template", variant: "destructive" });
    }
  };

  const handleDownloadCSVTemplate = async () => {
    try {
      const response = await fetch("/api/estimates/template-csv", {
        headers: {
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "estimate-template.csv";
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "CSV template downloaded successfully" });
    } catch (error) {
      toast({ title: "Failed to download CSV template", variant: "destructive" });
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear any old pending file first
    setPendingImportFile(null);
    setImportType('excel');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result?.toString().split(",")[1];
      if (!base64) return;
      
      // Store the new file data with a timestamp to prevent caching
      setPendingImportFile(base64);
      setShowImportConfirmDialog(true);
    };
    reader.readAsDataURL(file);
    
    // Reset file input so the same file can be selected again
    event.target.value = '';
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear any old pending file first
    setPendingImportFile(null);
    setImportType('csv');
    setMissingRoles([]);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result?.toString().split(",")[1];
      if (!base64) return;
      
      setPendingImportFile(base64);
      
      // Validate CSV for missing roles before showing import dialog
      setIsValidatingImport(true);
      try {
        const validationResponse = await fetch(`/api/estimates/${id}/validate-csv`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Id": localStorage.getItem("sessionId") || "",
          },
          body: JSON.stringify({ file: base64 })
        });
        
        const validation = await validationResponse.json();
        
        if (validation.missingRoles && validation.missingRoles.length > 0) {
          // Show missing roles wizard
          setMissingRoles(validation.missingRoles.map((r: any) => ({
            name: r.name,
            billingRate: "175",
            costRate: "131.25",
            usageCount: r.usageCount
          })));
          setShowMissingRolesWizard(true);
        } else {
          // No missing roles, proceed to import confirmation
          setShowImportConfirmDialog(true);
        }
      } catch (error) {
        console.error("CSV validation error:", error);
        // On validation error, just proceed with import
        setShowImportConfirmDialog(true);
      } finally {
        setIsValidatingImport(false);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset file input so the same file can be selected again
    event.target.value = '';
  };

  const handleCreateMissingRoles = async () => {
    try {
      // Create all missing roles with user-specified rates
      const rolesToCreate = missingRoles.map(r => ({
        name: r.name,
        defaultRackRate: r.billingRate,
        defaultCostRate: r.costRate
      }));

      const response = await fetch("/api/roles/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": localStorage.getItem("sessionId") || "",
        },
        body: JSON.stringify({ roles: rolesToCreate })
      });

      if (!response.ok) {
        throw new Error("Failed to create roles");
      }

      const result = await response.json();
      toast({ title: `Created ${result.rolesCreated} new role(s)` });
      
      // Close wizard and proceed to import confirmation (keep pendingImportFile!)
      setShowMissingRolesWizard(false);
      setMissingRoles([]);
      setShowImportConfirmDialog(true);
      
      // Invalidate roles query to refresh role list
      queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
    } catch (error) {
      toast({ title: "Failed to create roles", variant: "destructive" });
    }
  };

  const updateMissingRoleRate = (index: number, field: 'billingRate' | 'costRate', value: string) => {
    setMissingRoles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const executeImport = async (removeExisting: boolean) => {
    if (!pendingImportFile) return;
    
    try {
      // Use appropriate endpoint based on import type
      const endpoint = importType === 'csv' 
        ? `/api/estimates/${id}/import-csv`
        : `/api/estimates/${id}/import-excel`;
      
      // Add timestamp to prevent caching issues
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ 
          file: pendingImportFile,
          removeExisting,
          timestamp: Date.now() // Prevent caching
        })
      });
      
      // Build comprehensive message with all details
      let message = '';
      let hasIssues = false;
      
      // Start with items imported
      message = `${response.itemsCreated} line items imported\n`;
      
      // Add info about new epics/stages created
      if (response.newEpicsCreated?.length > 0) {
        message += `✓ Created ${response.newEpicsCreated.length} new Epic(s): ${response.newEpicsCreated.join(', ')}\n`;
      }
      
      if (response.newStagesCreated?.length > 0) {
        message += `✓ Created ${response.newStagesCreated.length} new Stage(s): ${response.newStagesCreated.join(', ')}\n`;
      }
      
      // Always check for warnings, even if new items were created
      if (response.warnings) {
        const { unmatchedEpics, unmatchedStages, totalSkipped } = response.warnings;
        hasIssues = true;
        
        if (unmatchedEpics && unmatchedEpics.length > 0) {
          message += `✗ Failed to create Epic(s): ${unmatchedEpics.join(', ')}\n`;
        }
        
        if (unmatchedStages && unmatchedStages.length > 0) {
          message += `✗ Failed to create Stage(s): ${unmatchedStages.join(', ')}\n`;
        }
        
        if (totalSkipped > 0) {
          message += `✗ ${totalSkipped} rows skipped (missing data)\n`;
        }
      }
      
      // Show appropriate toast based on whether there were issues
      if (hasIssues) {
        toast({ 
          title: "Import Completed with Issues",
          description: message,
          variant: "default",
          duration: 10000 // Show for 10 seconds
        });
      } else if (response.newEpicsCreated?.length > 0 || response.newStagesCreated?.length > 0) {
        // Success with new items created
        toast({ 
          title: "Import Successful",
          description: message,
          duration: 7000
        });
      } else {
        // Simple success
        const action = response.mode === 'replaced' ? 'replaced with' : 'added';
        toast({ title: `Successfully ${action} ${response.itemsCreated} line items` });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      
      setShowImportConfirmDialog(false);
      setPendingImportFile(null);
    } catch (error: any) {
      console.error("Import failed:", error);
      const errorMessage = error.message || "Unknown error occurred";
      toast({ 
        title: "Failed to import Excel file", 
        description: errorMessage,
        variant: "destructive" 
      });
    }
  };

  const totalHours = (lineItems || []).reduce((sum: number, item: EstimateLineItem) => 
    sum + Number(item.adjustedHours), 0);
  const totalAmount = (lineItems || []).reduce((sum: number, item: EstimateLineItem) => 
    sum + Number(item.totalAmount), 0);
  const totalCost = (lineItems || []).reduce((sum: number, item: EstimateLineItem) => 
    sum + (Number(item.costRate || 0) * Number(item.adjustedHours || 0)), 0);

  // Show loading state
  if (estimateLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div>Loading estimate...</div>
        </div>
      </Layout>
    );
  }

  // Show error state
  if (estimateError) {
    const errorMessage = estimateError instanceof Error ? estimateError.message : "Unknown error";
    return (
      <Layout>
          <div className="container mx-auto py-8 px-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">Error loading estimate</h2>
                  <p className="text-muted-foreground mb-4">Unable to load the estimate details.</p>
                  <p className="text-sm text-red-500 mb-4">{errorMessage}</p>
                  <Button onClick={() => setLocation("/estimates")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Estimates
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </Layout>
      );
    }

    // Check if estimate exists
    if (!estimate) {
      return (
        <Layout>
          <div className="container mx-auto py-8 px-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">Estimate Not Found</h2>
                  <p className="text-muted-foreground mb-4">The requested estimate could not be found.</p>
                  <Button onClick={() => setLocation("/estimates")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Estimates
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </Layout>
      );
    }

    return (
      <Layout>
      <div className="container mx-auto py-8 px-4 max-w-[1600px]">
      <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/estimates")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Estimate Details</h1>
            <p className="text-muted-foreground cursor-pointer" onClick={() => {
              if (!isEditable) return;
              setEditingField('estimate-name');
              setEditingEstimateName(estimate?.name || "");
            }}>
              {editingField === 'estimate-name' ? (
                <Input
                  value={editingEstimateName}
                  onChange={(e) => setEditingEstimateName(e.target.value)}
                  onBlur={() => {
                    if (editingEstimateName.trim() && editingEstimateName !== estimate?.name) {
                      updateEstimateMutation.mutate({ name: editingEstimateName.trim() });
                    }
                    setEditingField(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  className="text-base"
                  autoFocus
                />
              ) : (
                `${estimate?.name} - Version ${estimate?.version} (click to edit name)`
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Status Badge */}
          {estimate?.status && (
            <div className="flex items-center">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                estimate.status === 'approved' ? 'bg-green-100 text-green-800' :
                estimate.status === 'rejected' ? 'bg-red-100 text-red-800' :
                estimate.status === 'final' ? 'bg-blue-100 text-blue-800' :
                estimate.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
              </span>
            </div>
          )}
          
          {/* Status Management Buttons */}
          {(user?.role === 'admin' || user?.role === 'pm' || user?.role === 'billing-admin') && (
            <>
              {estimate?.status === 'draft' && (
                <Button 
                  onClick={() => {
                    if (window.confirm('Mark this estimate as final and ready for client review?')) {
                      updateEstimateMutation.mutate({ status: 'final' });
                    }
                  }}
                  variant="default"
                  data-testid="button-mark-as-final"
                >
                  <FileCheck className="h-4 w-4 mr-2" />
                  Mark as Final
                </Button>
              )}
              
              {estimate?.status === 'final' && (
                <>
                  <Button 
                    onClick={() => setShowApprovalDialog(true)}
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-approve-estimate"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    onClick={() => {
                      if (window.confirm('Are you sure you want to reject this estimate?')) {
                        rejectEstimateMutation.mutate();
                      }
                    }}
                    variant="destructive"
                    data-testid="button-reject-estimate"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button 
                    onClick={() => {
                      if (window.confirm('Return this estimate to draft status for more changes?')) {
                        updateEstimateMutation.mutate({ status: 'draft' });
                      }
                    }}
                    variant="outline"
                    data-testid="button-back-to-draft-final"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Back to Draft
                  </Button>
                </>
              )}
              
              {estimate?.status === 'approved' && (
                <>
                  {!estimate?.projectId && (
                    <Button 
                      onClick={() => {
                        setShouldCreateProject(true);
                        setShowApprovalDialog(true);
                      }}
                      variant="default"
                      className="bg-blue-600 hover:bg-blue-700"
                      data-testid="button-create-project"
                    >
                      <Briefcase className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  )}
                  
                  {estimate?.projectId && (
                    <Button 
                      onClick={() => {
                        setLocation(`/projects/${estimate.projectId}`);
                      }}
                      variant="outline"
                      data-testid="button-view-project"
                    >
                      <Briefcase className="h-4 w-4 mr-2" />
                      View Project
                    </Button>
                  )}
                  
                  <Button 
                    onClick={() => {
                      const confirmMessage = estimate?.projectId 
                        ? 'This estimate is linked to a project. Are you sure you want to revert it to Final status? The project link will remain intact.'
                        : 'Are you sure you want to revert this estimate to Final status? This will undo the approval.';
                      
                      if (window.confirm(confirmMessage)) {
                        revertApprovalMutation.mutate();
                      }
                    }}
                    variant="outline"
                    disabled={revertApprovalMutation.isPending}
                    data-testid="button-revert-to-final"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {revertApprovalMutation.isPending ? 'Reverting...' : 'Revert to Final'}
                  </Button>
                  
                  <Button 
                    onClick={() => {
                      if (window.confirm('Return this estimate to draft status for more changes?')) {
                        updateEstimateMutation.mutate({ status: 'draft' });
                      }
                    }}
                    variant="outline"
                    data-testid="button-back-to-draft-approved"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Back to Draft
                  </Button>
                </>
              )}
              
              {estimate?.status === 'rejected' && (
                <Button 
                  onClick={() => {
                    if (window.confirm('Return this estimate to draft status for revisions?')) {
                      updateEstimateMutation.mutate({ status: 'draft' });
                    }
                  }}
                  variant="outline"
                  data-testid="button-back-to-draft-rejected"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Back to Draft
                </Button>
              )}
              
              {estimate?.status === 'sent' && (
                <Button 
                  onClick={() => {
                    if (window.confirm('Return this estimate to draft status for modifications?')) {
                      updateEstimateMutation.mutate({ status: 'draft' });
                    }
                  }}
                  variant="outline"
                  data-testid="button-back-to-draft-sent"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Back to Draft
                </Button>
              )}
            </>
          )}
          
          {/* Excel operations - HIDDEN: See backlog for redevelopment/removal */}
          {/* <div className="flex gap-2">
            <Button onClick={handleDownloadTemplate} variant="outline" size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              Excel Template
            </Button>
            <Button onClick={handleExportExcel} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Excel
            </Button>
          </div> */}
          
          {/* CSV operations */}
          <div className="flex gap-2">
            <Button onClick={handleDownloadCSVTemplate} variant="outline" size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              CSV Template
            </Button>
            <Button onClick={handleExportCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => csvFileInputRef.current?.click()}
              variant="outline"
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </div>
          
          {/* AI-ready text export */}
          <div className="flex gap-2">
            <Button 
              onClick={handleExportText} 
              variant="outline" 
              size="sm"
              data-testid="button-export-text"
            >
              <FileText className="h-4 w-4 mr-2" />
              Export for AI
            </Button>
            {aiStatus?.configured && (
              <Button 
                onClick={handleGenerateNarrative}
                variant="default"
                size="sm"
                disabled={generateNarrativeMutation.isPending}
                data-testid="button-generate-narrative"
              >
                {generateNarrativeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Proposal Narrative
              </Button>
            )}
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />
          <input
            ref={csvFileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />
        </div>
      </div>

      {/* Pricing Configuration Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pricing Configuration</CardTitle>
          <CardDescription>Configure how this estimate is priced</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {/* First row - Pricing Configuration */}
            <div className="grid grid-cols-3 gap-4">
              {/* Pricing Type Selector */}
              <div>
                <Label>Pricing Type</Label>
                <Select 
                  value={estimate?.pricingType || 'hourly'} 
                  onValueChange={(value) => {
                    updateEstimateMutation.mutate({ 
                      pricingType: value as 'hourly' | 'fixed'
                    });
                  }}
                  disabled={!isEditable}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly (Time & Materials)</SelectItem>
                    <SelectItem value="fixed">Fixed Price / Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fixed Price Field - only show for fixed pricing */}
              {estimate?.pricingType === 'fixed' && (
                <div>
                  <Label htmlFor="fixed-price">Fixed Price ($)</Label>
                  <Input
                    id="fixed-price"
                    type="number"
                    step="0.01"
                    placeholder="Enter fixed price (e.g., 10000)"
                    value={fixedPriceInput}
                    onChange={(e) => {
                      setFixedPriceInput(e.target.value);
                    }}
                    onBlur={() => {
                      const value = fixedPriceInput.trim();
                      if (value === '' || !isNaN(parseFloat(value))) {
                        updateEstimateMutation.mutate({ 
                          fixedPrice: value === '' ? null : String(value)
                        });
                      }
                    }}
                    className="mt-1"
                    disabled={!isEditable}
                  />
                </div>
              )}

              {/* Estimate Type Selector */}
              <div>
                <Label>Estimate Type</Label>
                <Select 
                  value={estimate?.estimateType || 'detailed'} 
                  onValueChange={(value) => {
                    updateEstimateMutation.mutate({ 
                      estimateType: value as 'detailed' | 'block'
                    });
                  }}
                  disabled={!isEditable}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="detailed">Detailed (Line Items)</SelectItem>
                    <SelectItem value="block">Block (Simple Hours/Dollars)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Second row - Project Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Linked Project</Label>
                <Select 
                  value={estimate?.projectId || "no-project"} 
                  onValueChange={(value) => {
                    updateEstimateMutation.mutate({ 
                      projectId: value === "no-project" ? null : value
                    });
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="No project linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-project">No project (unlink)</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} - {project.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Link this estimate to an existing project for backtesting and tracking.
                </p>
              </div>
              {estimate?.projectId && (
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const linkedProject = projects.find(p => p.id === estimate.projectId);
                      if (linkedProject) {
                        setLocation(`/projects/${linkedProject.id}`);
                      }
                    }}
                    className="mt-1"
                  >
                    <Briefcase className="h-4 w-4 mr-2" />
                    View Linked Project
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Status Workflow Buttons */}
          <div className="border-t pt-4">
            <Label className="mb-2 block">Estimate Status: <span className="font-semibold">{estimate?.status || 'draft'}</span></Label>
            <div className="flex gap-2">
              {estimate?.status === 'draft' && (
                <Button 
                  onClick={() => {
                    updateEstimateMutation.mutate({ status: 'final' });
                  }}
                  variant="outline"
                  className="bg-blue-50 hover:bg-blue-100"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Mark as Final
                </Button>
              )}
              
              {estimate?.status === 'final' && (
                <>
                  <Button 
                    onClick={() => {
                      setShouldCreateProject(false);
                      setShowApprovalDialog(true);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve Estimate
                  </Button>
                  
                  <Button 
                    onClick={() => {
                      updateEstimateMutation.mutate({ status: 'draft' });
                    }}
                    variant="outline"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Back to Draft
                  </Button>
                </>
              )}
              
              {estimate?.status === 'approved' && (
                <>
                  {!estimate?.projectId && (
                    <Button 
                      onClick={() => {
                        setShouldCreateProject(true);
                        setShowApprovalDialog(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Briefcase className="h-4 w-4 mr-2" />
                      Create Project from Estimate
                    </Button>
                  )}
                  
                  <Button 
                    onClick={() => {
                      updateEstimateMutation.mutate({ status: 'final' });
                    }}
                    variant="outline"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Revert to Final
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Show block estimate UI for block type estimates */}
      {estimate?.estimateType === 'block' ? (
        <Card>
          <CardHeader>
            <CardTitle>Block Estimate</CardTitle>
            <CardDescription>Simple hours and dollars estimate for retainer projects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label htmlFor="block-hours">Total Hours</Label>
                <Input
                  id="block-hours"
                  type="number"
                  step="0.01"
                  placeholder="Enter total hours"
                  value={blockHoursInput}
                  onChange={(e) => {
                    setBlockHoursInput(e.target.value);
                  }}
                  onBlur={() => {
                    const value = blockHoursInput.trim();
                    if (value === '' || !isNaN(parseFloat(value))) {
                      updateEstimateMutation.mutate({ 
                        blockHours: value === '' ? null : String(value)
                      });
                    }
                  }}
                  className="mt-1"
                  data-testid="input-block-hours"
                  disabled={!isEditable}
                />
              </div>
              <div>
                <Label htmlFor="block-dollars">Total Dollars ($)</Label>
                <Input
                  id="block-dollars"
                  type="number"
                  step="0.01"
                  placeholder="Enter total dollar amount (e.g., 10000)"
                  value={blockDollarsInput}
                  onChange={(e) => {
                    setBlockDollarsInput(e.target.value);
                  }}
                  onBlur={() => {
                    const value = blockDollarsInput.trim();
                    if (value === '' || !isNaN(parseFloat(value))) {
                      updateEstimateMutation.mutate({ 
                        blockDollars: value === '' ? null : String(value)
                      });
                    }
                  }}
                  className="mt-1"
                  data-testid="input-block-dollars"
                  disabled={!isEditable}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="block-description">Description</Label>
              <textarea
                id="block-description"
                placeholder="Describe the work to be done..."
                value={blockDescriptionInput}
                onChange={(e) => {
                  setBlockDescriptionInput(e.target.value);
                }}
                onBlur={() => {
                  updateEstimateMutation.mutate({ 
                    blockDescription: blockDescriptionInput
                  });
                }}
                className="mt-1 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="textarea-block-description"
                disabled={!isEditable}
              />
            </div>
            {/* Cost Analysis for Block Estimates */}
            {estimate?.blockHours && estimate?.blockDollars && (
              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium">Cost Analysis</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-sm">
                    <span className="font-medium">Quote Rate:</span><br />
                    ${(Number(estimate.blockDollars) / Number(estimate.blockHours)).toFixed(0)}/hour
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Est. Cost Rate:</span><br />
                    ${totalCost > 0 ? (totalCost / Number(estimate.blockHours)).toFixed(0) : '0'}/hour
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Profit Margin:</span><br />
                    {Number(estimate.blockDollars) > 0 ? 
                      (((Number(estimate.blockDollars) - totalCost) / Number(estimate.blockDollars)) * 100).toFixed(1) 
                      : '0'}%
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">Customer Quote:</span> ${Number(estimate.blockDollars).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Estimated Cost:</span> ${Math.round(totalCost).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="font-medium">Estimated Profit:</span> ${Math.round(Number(estimate.blockDollars) - totalCost).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
            
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-sm">
                  <span className="font-medium">Status:</span> {estimate?.status || 'draft'}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Valid Until:</span> {estimate?.validUntil ? new Date(estimate.validUntil).toLocaleDateString() : 'Not set'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
      /* Show detailed estimate UI for detailed type estimates */
      <Tabs defaultValue="outputs" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="outputs">Quotes</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="contingency">Contingency</TabsTrigger>
          <TabsTrigger value="management">Structure</TabsTrigger>
        </TabsList>

        <TabsContent value="outputs" className="space-y-6">
          {/* Quotes */}
          <Card>
            <CardHeader>
              <CardTitle>Quotes</CardTitle>
              <CardDescription>Customer-facing pricing and margins</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="presented-total">Presented Total ($)</Label>
                  <Input
                    id="presented-total"
                    type="number"
                    placeholder="Enter customer-facing total"
                    value={presentedTotal || estimate?.presentedTotal || ""}
                    onChange={(e) => setPresentedTotal(e.target.value)}
                    onBlur={() => {
                      if (presentedTotal && estimate) {
                        // Calculate profit margin: (Quote - Cost) / Quote * 100
                        const quote = parseFloat(presentedTotal);
                        const profit = quote - totalCost;
                        const calculatedMargin = quote > 0 ? ((profit / quote) * 100).toFixed(2) : "0";
                        setMargin(calculatedMargin);
                        updateEstimateMutation.mutate({ 
                          presentedTotal: String(presentedTotal),
                          margin: String(calculatedMargin)
                        });
                      }
                    }}
                    className="mt-1"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Internal Total: ${Math.round(totalAmount).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label htmlFor="margin">Margin (%)</Label>
                  <Input
                    id="margin"
                    type="number"
                    placeholder="Auto-calculated"
                    value={margin || (estimate?.presentedTotal && Number(estimate.presentedTotal) > 0 ? 
                      ((Number(estimate.presentedTotal) - totalCost) / Number(estimate.presentedTotal) * 100).toFixed(1) : "")}
                    readOnly
                    className="mt-1 bg-muted"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Total Cost: ${Math.round(totalCost).toLocaleString()} | 
                    Profit: ${estimate?.presentedTotal ? Math.round(Number(estimate.presentedTotal) - totalCost).toLocaleString() : "N/A"}
                  </p>
                </div>
              </div>

              {/* Referral Fee Section */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3">Referral Fee</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="referral-fee-type">Fee Type</Label>
                    <Select
                      value={estimate?.referralFeeType || "none"}
                      onValueChange={(value) => {
                        updateEstimateMutation.mutate({ 
                          referralFeeType: value,
                          referralFeePercent: value === 'none' ? null : estimate?.referralFeePercent,
                          referralFeeFlat: value === 'none' ? null : estimate?.referralFeeFlat
                        });
                      }}
                      disabled={!isEditable}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-referral-fee-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="flat">Flat Fee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {estimate?.referralFeeType === 'percentage' && (
                    <div>
                      <Label htmlFor="referral-fee-percent">Fee Percent (%)</Label>
                      <Input
                        id="referral-fee-percent"
                        type="number"
                        step="0.1"
                        placeholder="e.g. 10"
                        defaultValue={estimate?.referralFeePercent || ""}
                        onBlur={(e) => {
                          updateEstimateMutation.mutate({ referralFeePercent: e.target.value || null });
                        }}
                        disabled={!isEditable}
                        className="mt-1"
                        data-testid="input-referral-fee-percent"
                      />
                    </div>
                  )}
                  
                  {estimate?.referralFeeType === 'flat' && (
                    <div>
                      <Label htmlFor="referral-fee-flat">Flat Fee ($)</Label>
                      <Input
                        id="referral-fee-flat"
                        type="number"
                        step="0.01"
                        placeholder="e.g. 5000"
                        defaultValue={estimate?.referralFeeFlat || ""}
                        onBlur={(e) => {
                          updateEstimateMutation.mutate({ referralFeeFlat: e.target.value || null });
                        }}
                        disabled={!isEditable}
                        className="mt-1"
                        data-testid="input-referral-fee-flat"
                      />
                    </div>
                  )}
                  
                  {estimate?.referralFeeType && estimate.referralFeeType !== 'none' && (
                    <div>
                      <Label htmlFor="referral-fee-paid-to">Paid To</Label>
                      <Input
                        id="referral-fee-paid-to"
                        type="text"
                        placeholder="Seller name"
                        defaultValue={estimate?.referralFeePaidTo || ""}
                        onBlur={(e) => {
                          updateEstimateMutation.mutate({ referralFeePaidTo: e.target.value || null });
                        }}
                        disabled={!isEditable}
                        className="mt-1"
                        data-testid="input-referral-fee-paid-to"
                      />
                    </div>
                  )}
                </div>
                
                {estimate?.referralFeeType && estimate.referralFeeType !== 'none' && (() => {
                  const referralFeeAmount = Number(estimate?.referralFeeAmount || 0);
                  const baseProfit = Number(estimate?.netRevenue || 0); // Profit stays the same
                  const baseTotalFees = Number(estimate?.totalFees || 0);
                  const presentedTotal = Number(estimate?.presentedTotal || 0);
                  const marginPercent = baseTotalFees > 0 ? ((baseProfit / baseTotalFees) * 100).toFixed(1) : '0';
                  
                  return (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg space-y-2" data-testid="referral-fee-summary">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base Profit:</span>
                        <span className="font-medium">
                          ${Math.round(baseProfit).toLocaleString()} ({marginPercent}%)
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Referral Commission{estimate?.referralFeePercent ? ` (${estimate.referralFeePercent}%)` : ''}:
                        </span>
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          ${Math.round(referralFeeAmount).toLocaleString()} (pass-through)
                        </span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2 mt-2">
                        <span className="text-muted-foreground">Quoted to Client:</span>
                        <span className="font-semibold">
                          ${Math.round(presentedTotal).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-xs text-muted-foreground italic">
                        <span></span>
                        <span>(includes +${Math.round(referralFeeAmount).toLocaleString()} referral surcharge)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Summary by Workstream, Stage, and Epic */}
          <Card>
            <CardHeader>
              <CardTitle>Summary by Workstream, {vocabulary.stage} & {vocabulary.epic}</CardTitle>
              <CardDescription>Effort and billing breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="epic">
                <TabsList className="mb-4">
                  <TabsTrigger value="epic">By {vocabulary.epic}</TabsTrigger>
                  <TabsTrigger value="workstream">By Workstream</TabsTrigger>
                  <TabsTrigger value="stage">By {vocabulary.stage}</TabsTrigger>
                </TabsList>
                
                <TabsContent value="epic">
                  {(() => {
                    // Group by epicId to preserve order
                    const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
                    const epicTotals = lineItems?.reduce((acc: any, item) => {
                      const epicId = item.epicId || 'unassigned';
                      const epicData = epics?.find(e => e.id === item.epicId);
                      if (!acc[epicId]) {
                        acc[epicId] = { 
                          name: epicData?.name || "Unassigned",
                          order: epicData?.order ?? 999999,
                          hours: 0, 
                          amount: 0, 
                          cost: 0, 
                          count: 0,
                          referralMarkup: 0,
                          quotedAmount: 0
                        };
                      }
                      acc[epicId].hours += Number(item.adjustedHours || 0);
                      acc[epicId].amount += Number(item.totalAmount || 0);
                      acc[epicId].cost += Number(item.totalCost || 0);
                      acc[epicId].referralMarkup += Number(item.referralMarkup || 0);
                      acc[epicId].quotedAmount += Number(item.totalAmountWithReferral || item.totalAmount || 0);
                      acc[epicId].count += 1;
                      return acc;
                    }, {});

                    const totalQuotedAmount = Object.values(epicTotals || {}).reduce((sum: number, data: any) => sum + data.quotedAmount, 0);

                    return (
                      <div className="space-y-3">
                        {Object.entries(epicTotals || {}).sort(([, a]: [string, any], [, b]: [string, any]) => {
                          return a.order - b.order;
                        }).map(([epicId, data]: [string, any]) => (
                          <div key={epicId} className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div>
                              <span className="text-xs text-muted-foreground mr-2">#{data.order}</span>
                              <span className="font-medium">{data.name}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6 text-right">
                              <div>
                                <span className="text-muted-foreground">{data.hours.toFixed(1)} hrs</span>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground block">Cost</span>
                                <span className="text-muted-foreground">${Math.round(data.cost).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground block">Base</span>
                                <span className="text-muted-foreground">${Math.round(data.amount).toLocaleString()}</span>
                              </div>
                              {hasReferralFee && (
                                <div>
                                  <span className="text-xs text-muted-foreground block">Quoted</span>
                                  <span className="font-semibold text-amber-600 dark:text-amber-400">${Math.round(data.quotedAmount).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6 text-right">
                              <span>{totalHours.toFixed(1)} hrs</span>
                              <div>
                                <span className="text-xs text-muted-foreground block">Cost</span>
                                <span>${Math.round(totalCost).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground block">Base</span>
                                <span>${Math.round(totalAmount).toLocaleString()}</span>
                              </div>
                              {hasReferralFee && (
                                <div>
                                  <span className="text-xs text-muted-foreground block">Quoted</span>
                                  <span className="text-amber-600 dark:text-amber-400">${Math.round(totalQuotedAmount).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
                
                <TabsContent value="workstream">
                  {(() => {
                    // Group by workstream
                    const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
                    const workstreamTotals = lineItems?.reduce((acc: any, item) => {
                      const workstream = item.workstream || "Unassigned";
                      if (!acc[workstream]) {
                        acc[workstream] = { hours: 0, amount: 0, count: 0, quotedAmount: 0 };
                      }
                      acc[workstream].hours += Number(item.adjustedHours);
                      acc[workstream].amount += Number(item.totalAmount);
                      acc[workstream].quotedAmount += Number(item.totalAmountWithReferral || item.totalAmount || 0);
                      acc[workstream].count += 1;
                      return acc;
                    }, {});

                    const totalQuotedAmount = Object.values(workstreamTotals || {}).reduce((sum: number, data: any) => sum + data.quotedAmount, 0);

                    return (
                      <div className="space-y-3">
                        {Object.entries(workstreamTotals || {}).sort(([a], [b]) => a.localeCompare(b)).map(([workstream, data]: [string, any]) => (
                          <div key={workstream} className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div>
                              <span className="font-medium">{workstream}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6 text-right">
                              <span className="text-muted-foreground">{data.hours.toFixed(1)} hrs</span>
                              <div>
                                <span className="text-xs text-muted-foreground block">Base</span>
                                <span className="text-muted-foreground">${Math.round(data.amount).toLocaleString()}</span>
                              </div>
                              {hasReferralFee && (
                                <div>
                                  <span className="text-xs text-muted-foreground block">Quoted</span>
                                  <span className="font-semibold text-amber-600 dark:text-amber-400">${Math.round(data.quotedAmount).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6 text-right">
                              <span>{totalHours.toFixed(1)} hrs</span>
                              <div>
                                <span className="text-xs text-muted-foreground block">Base</span>
                                <span>${Math.round(totalAmount).toLocaleString()}</span>
                              </div>
                              {hasReferralFee && (
                                <div>
                                  <span className="text-xs text-muted-foreground block">Quoted</span>
                                  <span className="text-amber-600 dark:text-amber-400">${Math.round(totalQuotedAmount).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
                
                <TabsContent value="stage">
                  {(() => {
                    // Group by stageId to preserve order
                    const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
                    const stageTotals = lineItems?.reduce((acc: any, item) => {
                      const stageId = item.stageId || 'unassigned';
                      const stageData = stages?.find(s => s.id === item.stageId);
                      const epicData = stageData ? epics?.find(e => e.id === stageData.epicId) : null;
                      if (!acc[stageId]) {
                        acc[stageId] = { 
                          name: stageData?.name || "Unassigned",
                          order: stageData?.order ?? 999999,
                          epicOrder: epicData?.order ?? 999999,
                          hours: 0, 
                          amount: 0, 
                          count: 0,
                          quotedAmount: 0
                        };
                      }
                      acc[stageId].hours += Number(item.adjustedHours);
                      acc[stageId].amount += Number(item.totalAmount);
                      acc[stageId].quotedAmount += Number(item.totalAmountWithReferral || item.totalAmount || 0);
                      acc[stageId].count += 1;
                      return acc;
                    }, {});

                    const totalQuotedAmount = Object.values(stageTotals || {}).reduce((sum: number, data: any) => sum + data.quotedAmount, 0);

                    return (
                      <div className="space-y-3">
                        {Object.entries(stageTotals || {}).sort(([, a]: [string, any], [, b]: [string, any]) => {
                          // Sort by epic order first, then stage order
                          if (a.epicOrder !== b.epicOrder) return a.epicOrder - b.epicOrder;
                          return a.order - b.order;
                        }).map(([stageId, data]: [string, any]) => (
                          <div key={stageId} className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div>
                              <span className="text-xs text-muted-foreground mr-2">#{data.order}</span>
                              <span className="font-medium">{data.name}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6 text-right">
                              <span className="text-muted-foreground">{data.hours.toFixed(1)} hrs</span>
                              <div>
                                <span className="text-xs text-muted-foreground block">Base</span>
                                <span className="text-muted-foreground">${Math.round(data.amount).toLocaleString()}</span>
                              </div>
                              {hasReferralFee && (
                                <div>
                                  <span className="text-xs text-muted-foreground block">Quoted</span>
                                  <span className="font-semibold text-amber-600 dark:text-amber-400">${Math.round(data.quotedAmount).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6 text-right">
                              <span>{totalHours.toFixed(1)} hrs</span>
                              <div>
                                <span className="text-xs text-muted-foreground block">Base</span>
                                <span>${Math.round(totalAmount).toLocaleString()}</span>
                              </div>
                              {hasReferralFee && (
                                <div>
                                  <span className="text-xs text-muted-foreground block">Quoted</span>
                                  <span className="text-amber-600 dark:text-amber-400">${Math.round(totalQuotedAmount).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Milestone Payments</CardTitle>
                  <CardDescription>Customer payment schedule</CardDescription>
                </div>
                <Button onClick={() => setShowMilestoneDialog(true)} size="sm" disabled={!isEditable}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {milestones.length === 0 ? (
                <p className="text-muted-foreground text-sm">No milestones created yet</p>
              ) : (
                <div className="space-y-4">
                  {/* Milestone total indicator */}
                  {(() => {
                    const milestoneTotal = milestones.reduce((sum, m) => {
                      if (m.amount) {
                        return sum + Number(m.amount);
                      } else if (m.percentage && estimate?.presentedTotal) {
                        return sum + (Number(estimate.presentedTotal) * Number(m.percentage) / 100);
                      }
                      return sum;
                    }, 0);
                    const quoteTotal = Number(estimate?.presentedTotal || totalAmount);
                    const difference = quoteTotal - milestoneTotal;
                    const isMatching = Math.abs(difference) < 1;
                    
                    return (
                      <div className={`p-3 rounded-lg border ${isMatching ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">
                            Milestone Total: ${milestoneTotal.toLocaleString()}
                          </span>
                          <span className={`text-sm ${isMatching ? 'text-green-600' : 'text-orange-600'}`}>
                            {isMatching ? (
                              '✓ Matches quote total'
                            ) : (
                              `${difference > 0 ? 'Under' : 'Over'} by $${Math.abs(difference).toLocaleString()}`
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Milestone list */}
                  <div className="space-y-2">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{milestone.name}</div>
                        {milestone.description && (
                          <div className="text-sm text-muted-foreground">{milestone.description}</div>
                        )}
                        <div className="text-sm mt-1">
                          {milestone.amount ? (
                            <span className="font-medium">${Number(milestone.amount).toLocaleString()}</span>
                          ) : milestone.percentage ? (
                            <span className="font-medium">{milestone.percentage}% of total</span>
                          ) : null}
                          {milestone.dueDate && (
                            <span className="text-muted-foreground ml-2">
                              Due: {new Date(milestone.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setEditingMilestone(milestone);
                            setShowMilestoneEditDialog(true);
                          }}
                          size="sm"
                          variant="ghost"
                          disabled={!isEditable}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={!isEditable}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="inputs" className="space-y-6">

          <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Estimate Inputs</CardTitle>
              <CardDescription>
                Add and manage estimate inputs with factor multipliers and confidence adjustments
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {estimate?.estimateType === 'detailed' && isEditable && (
                <Button onClick={() => setShowPMWizard(true)} variant="outline" data-testid="button-pm-wizard" disabled={!isEditable}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  PM Wizard
                </Button>
              )}
              <Button 
                onClick={() => setShowRecalcDialog(true)} 
                variant="outline" 
                data-testid="button-recalculate"
                disabled={!isEditable}
              >
                <Calculator className="h-4 w-4 mr-2" />
                Recalculate All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            {/* Two-column layout on wide screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Core Fields */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Description *</Label>
                  <Input
                    placeholder="Enter description"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    data-testid="input-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">{vocabulary.epic}</Label>
                    <Select
                      value={newItem.epicId}
                      onValueChange={(value) => setNewItem({ ...newItem, epicId: value })}
                    >
                      <SelectTrigger data-testid="select-epic">
                        <SelectValue placeholder={`Select ${vocabulary.epic}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {epics.filter(epic => epic.id && epic.id !== "").map((epic) => (
                          <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">{vocabulary.stage}</Label>
                    <Select
                      value={newItem.stageId}
                      onValueChange={(value) => setNewItem({ ...newItem, stageId: value })}
                    >
                      <SelectTrigger data-testid="select-stage">
                        <SelectValue placeholder={`Select ${vocabulary.stage}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {stages.filter(stage => stage.id && stage.id !== "").map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">{vocabulary.workstream}</Label>
                    <Input
                      placeholder={vocabulary.workstream}
                      value={newItem.workstream}
                      onChange={(e) => setNewItem({ ...newItem, workstream: e.target.value })}
                      data-testid="input-workstream"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Week #</Label>
                    <Input
                      placeholder="Week #"
                      type="number"
                      value={newItem.week}
                      onChange={(e) => setNewItem({ ...newItem, week: e.target.value })}
                      data-testid="input-week"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Resource</Label>
                  <Select
                    value={newItem.userId || "unassigned"}
                    onValueChange={(value) => {
                      const selectedUser = users.find((s: any) => s.id === value);
                      if (value === "unassigned") {
                        setNewItem({ ...newItem, userId: "", resourceName: "", rate: "0", costRate: "0" });
                      } else if (selectedUser) {
                        setNewItem({ 
                          ...newItem, 
                          userId: selectedUser.id, 
                          resourceName: selectedUser.name,
                          rate: selectedUser.defaultBillingRate?.toString() || "0",
                          costRate: selectedUser.defaultCostRate?.toString() || "0"
                        });
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-resource">
                      <SelectValue placeholder="Select Resource" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.filter((user: any) => user.isAssignable).map((member: any) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name} - ${member.defaultBillingRate}/hr
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Right Column - Metrics & Attributes */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Hours *</Label>
                    <Input
                      placeholder="Hours"
                      type="number"
                      value={newItem.baseHours}
                      onChange={(e) => setNewItem({ ...newItem, baseHours: e.target.value })}
                      data-testid="input-hours"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Factor</Label>
                    <Input
                      placeholder="Factor"
                      type="number"
                      value={newItem.factor}
                      onChange={(e) => setNewItem({ ...newItem, factor: e.target.value })}
                      title="Multiplier (e.g., 4 interviews × 3 hours)"
                      data-testid="input-factor"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Rate ($) *</Label>
                    <Input
                      placeholder="Rate"
                      type="number"
                      value={newItem.rate}
                      onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
                      data-testid="input-rate"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Size</Label>
                    <Select
                      value={newItem.size}
                      onValueChange={(value) => setNewItem({ ...newItem, size: value })}
                    >
                      <SelectTrigger data-testid="select-size">
                        <SelectValue placeholder="Size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Complexity</Label>
                    <Select
                      value={newItem.complexity}
                      onValueChange={(value) => setNewItem({ ...newItem, complexity: value })}
                    >
                      <SelectTrigger data-testid="select-complexity">
                        <SelectValue placeholder="Complexity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Confidence</Label>
                    <Select
                      value={newItem.confidence}
                      onValueChange={(value) => setNewItem({ ...newItem, confidence: value })}
                    >
                      <SelectTrigger data-testid="select-confidence">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Comments</Label>
                  <Input
                    placeholder="Optional comments"
                    value={newItem.comments}
                    onChange={(e) => setNewItem({ ...newItem, comments: e.target.value })}
                    data-testid="input-comments"
                  />
                </div>
              </div>
            </div>
          </div>
          <Button
            onClick={handleAddItem}
            disabled={!isEditable || !newItem.description || !newItem.baseHours || !newItem.rate || createLineItemMutation.isPending}
            className="mb-4"
            variant="default"
            size="default"
            data-testid="button-add-input"
          >
            <Plus className="h-4 w-4 mr-2" />
            {createLineItemMutation.isPending ? "Adding..." : "Add Input"}
          </Button>
          {!newItem.description && !newItem.baseHours && !newItem.rate && (
            <p className="text-sm text-muted-foreground mb-2">
              Fill in Description, Hours, and Rate to add a line item
            </p>
          )}

          {/* Compact Filter Bar */}
          <div className="mb-4 bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border">
            <div className="flex flex-wrap gap-2 items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px] max-w-[300px]">
                <Input
                  placeholder="🔍 Search descriptions..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Filter Dropdowns */}
              <Select value={filterEpic} onValueChange={setFilterEpic}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder={`All ${vocabulary.epic}s`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {vocabulary.epic}s</SelectItem>
                  <SelectItem value="none">No {vocabulary.epic}</SelectItem>
                  {[...epics].sort((a, b) => a.order - b.order).map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>#{epic.order} {epic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder={`All ${vocabulary.stage}s`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {vocabulary.stage}s</SelectItem>
                  <SelectItem value="none">No {vocabulary.stage}</SelectItem>
                  {[...stages].sort((a, b) => a.order - b.order).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>#{stage.order} {stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterWeek} onValueChange={setFilterWeek}>
                <SelectTrigger className="w-[110px] h-9">
                  <SelectValue placeholder="All Weeks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Weeks</SelectItem>
                  {(() => {
                    const weeks = Array.from(new Set(lineItems.map((item: EstimateLineItem) => item.week ?? 0))).sort((a, b) => Number(a) - Number(b));
                    return weeks.map((week) => (
                      <SelectItem key={week} value={week.toString()}>
                        Week {week}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>

              <Select value={filterResource} onValueChange={setFilterResource}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(() => {
                    const uniqueResources = Array.from(new Set(
                      lineItems
                        .map((item: EstimateLineItem) => item.resourceName)
                        .filter((name): name is string => !!name)
                    )).sort();
                    return uniqueResources.map((resource) => (
                      <SelectItem key={resource} value={resource}>{resource}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>

              {/* Workstream filter - can be hidden on small screens */}
              <Input
                placeholder={`${vocabulary.workstream}...`}
                value={filterWorkstream}
                onChange={(e) => setFilterWorkstream(e.target.value)}
                className="w-[120px] h-9 hidden lg:block"
              />

              {/* Toggle for resource summary */}
              <div className="flex items-center space-x-1.5 px-2">
                <Checkbox 
                  id="show-resource-summary"
                  checked={showResourceSummary}
                  onCheckedChange={(checked) => setShowResourceSummary(checked as boolean)}
                  className="h-4 w-4"
                />
                <Label htmlFor="show-resource-summary" className="text-sm font-normal cursor-pointer">
                  Summary
                </Label>
              </div>

              {/* Clear filters button - only show when filters are active */}
              {(filterText || filterEpic !== "all" || filterStage !== "all" || filterWorkstream || 
                filterWeek !== "all" || filterResource !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterText("");
                    setFilterEpic("all");
                    setFilterStage("all");
                    setFilterWorkstream("");
                    setFilterWeek("all");
                    setFilterResource("all");
                  }}
                  className="h-9 px-2"
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Clear</span>
                </Button>
              )}
            </div>

            {/* Active filter count indicator */}
            {(() => {
              const activeFilters = [
                filterText ? 1 : 0,
                filterEpic !== "all" ? 1 : 0,
                filterStage !== "all" ? 1 : 0,
                filterWorkstream ? 1 : 0,
                filterWeek !== "all" ? 1 : 0,
                filterResource !== "all" ? 1 : 0,
              ].reduce((sum, val) => sum + val, 0);
              
              return activeFilters > 0 ? (
                <div className="text-xs text-muted-foreground mt-1.5">
                  {activeFilters} active filter{activeFilters !== 1 ? 's' : ''} • {getFilteredLineItems().length} of {lineItems?.length || 0} items shown
                </div>
              ) : null;
            })()}
          </div>

          {showResourceSummary && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Resource Summary</CardTitle>
                <CardDescription>Total hours and costs by resource</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const resourceSummary = lineItems.reduce((acc: any, item) => {
                      const resource = item.resourceName || "Unassigned";
                      if (!acc[resource]) {
                        acc[resource] = {
                          hours: 0,
                          chargeAmount: 0,
                          costAmount: 0,
                          margin: 0,
                          count: 0
                        };
                      }
                      acc[resource].hours += Number(item.adjustedHours || 0);
                      acc[resource].chargeAmount += Number(item.totalAmount || 0);
                      acc[resource].costAmount += Number(item.totalCost || 0);
                      acc[resource].margin += Number(item.margin || 0);
                      acc[resource].count += 1;
                      return acc;
                    }, {});

                    return Object.entries(resourceSummary).map(([resource, data]: [string, any]) => (
                      <div key={resource} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">{resource}</div>
                          <div className="text-sm text-muted-foreground">{data.count} items</div>
                        </div>
                        <div className="flex gap-6 text-sm">
                          <div>
                            <div className="text-muted-foreground">Hours</div>
                            <div className="font-medium">{data.hours.toFixed(1)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Charge</div>
                            <div className="font-medium">${data.chargeAmount.toFixed(0)}</div>
                          </div>
                          {canViewCostMargins && (
                            <>
                              <div>
                                <div className="text-muted-foreground">Cost</div>
                                <div className="font-medium">${data.costAmount.toFixed(0)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Margin</div>
                                <div className="font-medium text-green-600">
                                  ${data.margin.toFixed(0)} ({data.chargeAmount > 0 ? ((data.margin / data.chargeAmount) * 100).toFixed(1) : 0}%)
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedItems.size > 0 && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="font-medium">{selectedItems.size} items selected</span>
                <div className="flex gap-2">
                  <Button onClick={() => setBulkEditDialog(true)} size="sm" disabled={!isEditable}>
                    Bulk Edit
                  </Button>
                  <Button onClick={() => setApplyUserRatesDialog(true)} size="sm" variant="outline" disabled={!isEditable}>
                    Assign Roles/Users
                  </Button>
                  <Button 
                    onClick={() => setSelectedItems(new Set())} 
                    variant="outline" 
                    size="sm"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border relative">
            <div className="overflow-auto max-h-[calc(100vh-400px)] relative">
              <table className="w-full caption-bottom text-sm min-w-[1200px]">
                <thead className="sticky top-0 bg-white dark:bg-slate-950 z-20 border-b shadow-sm">
                  <tr className="border-b hover:bg-transparent">
                    <TableHead className="w-8 px-2 py-2 text-xs bg-white dark:bg-slate-950"></TableHead>
                    <TableHead className="w-10 px-2 py-2 text-xs bg-white dark:bg-slate-950">
                      <input
                        type="checkbox"
                      checked={(() => {
                        const filteredItems = getFilteredLineItems();
                        return filteredItems.length > 0 && filteredItems.every(item => selectedItems.has(item.id));
                      })()}
                      onChange={(e) => {
                        const filteredItems = getFilteredLineItems();
                        if (e.target.checked) {
                          // Select only filtered/visible items
                          const newSelection = new Set(selectedItems);
                          filteredItems.forEach(item => newSelection.add(item.id));
                          setSelectedItems(newSelection);
                        } else {
                          // Deselect only filtered/visible items
                          const newSelection = new Set(selectedItems);
                          filteredItems.forEach(item => newSelection.delete(item.id));
                          setSelectedItems(newSelection);
                        }
                      }}
                    />
                    </TableHead>
                    <TableHead className="min-w-[250px] px-2 py-2 text-xs bg-white dark:bg-slate-950">Description</TableHead>
                    <TableHead className="w-32 px-2 py-2 text-xs bg-white dark:bg-slate-950">Epic / Stage</TableHead>
                    <TableHead className="w-28 px-2 py-2 text-xs bg-white dark:bg-slate-950">Resource</TableHead>
                    <TableHead className="w-20 px-2 py-2 text-xs bg-white dark:bg-slate-950 text-right">Hours</TableHead>
                    <TableHead className="w-24 px-2 py-2 text-xs bg-white dark:bg-slate-950 text-right">Total</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-xs bg-white dark:bg-slate-950">Actions</TableHead>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (lineItems || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center">
                      No line items yet
                    </TableCell>
                  </TableRow>
                ) : (
                  // Use consistent filtering logic
                  getFilteredLineItems().map((item: EstimateLineItem) => {
                    const epic = epics.find(e => e.id === item.epicId);
                    const stage = stages.find(s => s.id === item.stageId);
                    const isExpanded = expandedRows.has(item.id);
                    return (
                    <>
                    <TableRow key={item.id} className={`${selectedItems.has(item.id) ? "bg-blue-50" : ""} border-b`}>
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpandRow(item.id)}
                          className="h-6 w-6 p-0"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="py-2">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedItems);
                            if (e.target.checked) {
                              newSelected.add(item.id);
                            } else {
                              newSelected.delete(item.id);
                            }
                            setSelectedItems(newSelected);
                          }}
                        />
                      </TableCell>
                      <TableCell className="py-2 min-w-[250px]">
                        {editingField === `${item.id}-description` ? (
                          <Input
                            value={editingDraft[`${item.id}-description`] ?? ""}
                            onChange={(e) => updateFieldDraft(item.id, "description", e.target.value)}
                            onBlur={() => saveFieldDraft(item, "description")}
                            autoFocus
                          />
                        ) : (
                          <div 
                            onClick={() => startFieldEditing(item, "description")} 
                            className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                            title="Click to edit description"
                          >
                            <div className="font-medium">{item.description}</div>
                            {item.week !== null && item.week !== undefined && (
                              <div className="text-xs text-muted-foreground mt-1">Week {item.week}</div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm">
                          <div>{epic?.name || "No epic"}</div>
                          <div className="text-xs text-muted-foreground">{stage?.name || "No stage"}</div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm">{item.resourceName || "Unassigned"}</div>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="text-sm font-medium">{Number(item.adjustedHours || 0).toFixed(1)}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex justify-end gap-2 items-center">
                          <div className="text-sm font-medium" data-testid={`text-total-${item.id}`}>
                            ${Number(item.totalAmount || 0).toFixed(0)}
                          </div>
                          {ratesLoading ? (
                            <div className="h-5 w-16 bg-gray-200 animate-pulse rounded" data-testid="skeleton-rate-badge" />
                          ) : (
                            <RatePrecedenceBadge compact effectiveRate={effectiveRateById.get(item.id)} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setSplittingItem(item);
                              setShowSplitDialog(true);
                            }}
                            disabled={!isEditable}
                            title="Split item"
                            data-testid={`button-split-${item.id}`}
                          >
                            <Split className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this item?")) {
                                deleteLineItemMutation.mutate(item.id);
                              }
                            }}
                            disabled={!isEditable}
                            title="Delete item"
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-gray-50 dark:bg-slate-900 p-4">
                          <div className="grid grid-cols-3 gap-6">
                            {/* Left column - Additional details */}
                            <div className="space-y-4">
                              {/* Rate Breakdown Section */}
                              <div className="space-y-2" data-testid={`section-rate-breakdown-${item.id}`}>
                                <h4 className="text-sm font-medium">Rate Breakdown</h4>
                                {ratesLoading ? (
                                  <div className="space-y-2">
                                    <div className="h-6 w-32 bg-gray-200 animate-pulse rounded" />
                                    <div className="h-4 w-48 bg-gray-200 animate-pulse rounded" />
                                    <div className="h-4 w-40 bg-gray-200 animate-pulse rounded" />
                                  </div>
                                ) : effectiveRateById.get(item.id) ? (
                                  <RatePrecedenceBadge effectiveRate={effectiveRateById.get(item.id)} compact={false} />
                                ) : (
                                  <p className="text-sm text-muted-foreground" data-testid={`text-no-rate-${item.id}`}>
                                    No rate information available for this line item.
                                  </p>
                                )}
                              </div>
                              
                              {/* Details Section */}
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium mb-2">Details</h4>
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Workstream:</span>
                                  <span className="font-medium">{item.workstream || "-"}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Base Hours:</span>
                                  {editingField === `${item.id}-baseHours` ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editingDraft[`${item.id}-baseHours`] || 0}
                                      onChange={(e) => updateFieldDraft(item.id, 'baseHours', e.target.value)}
                                      onBlur={() => saveFieldDraft(item, 'baseHours')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveFieldDraft(item, 'baseHours');
                                        if (e.key === 'Escape') { setEditingField(null); setEditingDraft({}); }
                                      }}
                                      className="h-6 w-20 text-right"
                                      autoFocus
                                      disabled={!isEditable}
                                    />
                                  ) : (
                                    <span 
                                      className={`font-medium ${isEditable ? 'cursor-pointer hover:text-primary' : ''}`}
                                      onClick={() => isEditable && startFieldEditing(item, 'baseHours')}
                                      title={isEditable ? 'Click to edit base hours' : ''}
                                    >
                                      {Number(item.baseHours).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Factor:</span>
                                  {editingField === `${item.id}-factor` ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editingDraft[`${item.id}-factor`] || 1}
                                      onChange={(e) => updateFieldDraft(item.id, 'factor', e.target.value)}
                                      onBlur={() => saveFieldDraft(item, 'factor')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveFieldDraft(item, 'factor');
                                        if (e.key === 'Escape') { setEditingField(null); setEditingDraft({}); }
                                      }}
                                      className="h-6 w-20 text-right"
                                      autoFocus
                                      disabled={!isEditable}
                                    />
                                  ) : (
                                    <span 
                                      className={`font-medium ${isEditable ? 'cursor-pointer hover:text-primary' : ''}`}
                                      onClick={() => isEditable && startFieldEditing(item, 'factor')}
                                      title={isEditable ? 'Click to edit factor' : ''}
                                    >
                                      {Number(item.factor || 1).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex justify-between text-sm items-center">
                                  <span className="text-muted-foreground">Size:</span>
                                  <Select 
                                    value={item.size || "small"} 
                                    onValueChange={(value) => {
                                      if (!isEditable) return;
                                      
                                      setPendingAttributes(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], size: value }
                                      }));
                                      
                                      const baseHours = Number(item.baseHours || 0);
                                      const factor = Number(item.factor || 1);
                                      const rate = Number(item.rate || 0);
                                      const costRate = Number(item.costRate || 0);
                                      const pending = pendingAttributes[item.id] || {};
                                      const effectiveComplexity = pending.complexity || item.complexity;
                                      const effectiveConfidence = pending.confidence || item.confidence;
                                      const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
                                        baseHours, factor, rate, costRate, value, effectiveComplexity, effectiveConfidence
                                      );
                                      updateLineItemMutation.mutate({
                                        itemId: item.id,
                                        data: {
                                          size: value,
                                          adjustedHours: String(adjustedHours),
                                          totalAmount: String(totalAmount),
                                          totalCost: String(totalCost),
                                          margin: String(margin),
                                          marginPercent: String(marginPercent)
                                        }
                                      });
                                    }}
                                    disabled={!isEditable}
                                  >
                                    <SelectTrigger className="h-6 w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="small">Small</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="large">Large</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex justify-between text-sm items-center">
                                  <span className="text-muted-foreground">Complexity:</span>
                                  <Select 
                                    value={item.complexity || "small"} 
                                    onValueChange={(value) => {
                                      if (!isEditable) return;
                                      
                                      setPendingAttributes(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], complexity: value }
                                      }));
                                      
                                      const baseHours = Number(item.baseHours || 0);
                                      const factor = Number(item.factor || 1);
                                      const rate = Number(item.rate || 0);
                                      const costRate = Number(item.costRate || 0);
                                      const pending = pendingAttributes[item.id] || {};
                                      const effectiveSize = pending.size || item.size;
                                      const effectiveConfidence = pending.confidence || item.confidence;
                                      const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
                                        baseHours, factor, rate, costRate, effectiveSize, value, effectiveConfidence
                                      );
                                      updateLineItemMutation.mutate({
                                        itemId: item.id,
                                        data: {
                                          complexity: value,
                                          adjustedHours: String(adjustedHours),
                                          totalAmount: String(totalAmount),
                                          totalCost: String(totalCost),
                                          margin: String(margin),
                                          marginPercent: String(marginPercent)
                                        }
                                      });
                                    }}
                                    disabled={!isEditable}
                                  >
                                    <SelectTrigger className="h-6 w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="small">Small</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="large">Large</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex justify-between text-sm items-center">
                                  <span className="text-muted-foreground">Confidence:</span>
                                  <Select 
                                    value={item.confidence || "high"} 
                                    onValueChange={(value) => {
                                      if (!isEditable) return;
                                      
                                      setPendingAttributes(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], confidence: value }
                                      }));
                                      
                                      const baseHours = Number(item.baseHours || 0);
                                      const factor = Number(item.factor || 1);
                                      const rate = Number(item.rate || 0);
                                      const costRate = Number(item.costRate || 0);
                                      const pending = pendingAttributes[item.id] || {};
                                      const effectiveSize = pending.size || item.size;
                                      const effectiveComplexity = pending.complexity || item.complexity;
                                      const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
                                        baseHours, factor, rate, costRate, effectiveSize, effectiveComplexity, value
                                      );
                                      updateLineItemMutation.mutate({
                                        itemId: item.id,
                                        data: {
                                          confidence: value,
                                          adjustedHours: String(adjustedHours),
                                          totalAmount: String(totalAmount),
                                          totalCost: String(totalCost),
                                          margin: String(margin),
                                          marginPercent: String(marginPercent)
                                        }
                                      });
                                    }}
                                    disabled={!isEditable}
                                  >
                                    <SelectTrigger className="h-6 w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="high">High</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                            </div>
                            
                            {/* Middle column - Financial details */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium mb-2">Financial</h4>
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Rate:</span>
                                  <span className="font-medium">${Number(item.rate || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Adjusted Hours:</span>
                                  <span className="font-medium">{Number(item.adjustedHours || 0).toFixed(2)}</span>
                                </div>
                                {canViewCostMargins && (
                                  <>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Cost:</span>
                                      <span className="font-medium">${Number(item.totalCost || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Margin:</span>
                                      <span className="font-medium text-green-600">
                                        ${Number(item.margin || 0).toFixed(2)} 
                                        ({Number(item.totalAmount) > 0 ? ((Number(item.margin || 0) / Number(item.totalAmount)) * 100).toFixed(1) : 0}%)
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            
                            {/* Right column - Comments and Resource */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium mb-2">Resource & Notes</h4>
                              <div className="space-y-2">
                                <div>
                                  <span className="text-sm text-muted-foreground">Resource Assignment:</span>
                                  <Select 
                                    value={item.assignedUserId || (item.roleId ? `role-${item.roleId}` : (item.resourceName ? `generic-${item.resourceName}` : "unassigned"))} 
                                    onValueChange={(value) => {
                                      if (!isEditable) return;
                                      
                                      const updates: any = {};
                                      if (value === "unassigned") {
                                        updates.assignedUserId = null;
                                        updates.roleId = null;
                                        updates.resourceName = null;
                                        updates.rate = "0";
                                        updates.costRate = "0";
                                      } else if (value.startsWith("generic-")) {
                                        // Generic resource - preserve existing rates, no changes needed
                                        return;
                                      } else if (value.startsWith("role-")) {
                                        const roleId = value.replace("role-", "");
                                        const role = roles.find((r: any) => r.id === roleId);
                                        updates.assignedUserId = null;
                                        updates.roleId = roleId;
                                        updates.resourceName = role?.name || null;
                                        updates.rate = role?.defaultRackRate || "0";
                                        updates.costRate = role?.defaultCostRate || "0";
                                      } else {
                                        const user = assignableUsers.find((u: any) => u.id === value);
                                        updates.assignedUserId = value;
                                        updates.roleId = null;
                                        updates.resourceName = user?.name || null;
                                        updates.rate = user?.defaultBillingRate || "0";
                                        updates.costRate = user?.defaultCostRate || "0";
                                      }
                                      
                                      // Recalculate with new rate and cost rate
                                      const baseHours = Number(item.baseHours || 0);
                                      const factor = Number(item.factor || 1);
                                      const rate = Number(updates.rate || 0);
                                      const costRate = Number(updates.costRate || 0);
                                      const { adjustedHours, totalAmount, totalCost, margin, marginPercent } = calculateAdjustedValues(
                                        baseHours, factor, rate, costRate, item.size, item.complexity, item.confidence
                                      );
                                      
                                      updateLineItemMutation.mutate({
                                        itemId: item.id,
                                        data: {
                                          ...updates,
                                          adjustedHours: String(adjustedHours),
                                          totalAmount: String(totalAmount),
                                          totalCost: String(totalCost),
                                          margin: String(margin),
                                          marginPercent: String(marginPercent)
                                        }
                                      });
                                    }}
                                    disabled={!isEditable}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">Unassigned</SelectItem>
                                      {/* Show current generic resource if it exists and isn't linked to a role/user */}
                                      {item.resourceName && !item.assignedUserId && !item.roleId && (
                                        <SelectItem value={`generic-${item.resourceName}`}>
                                          {item.resourceName} (Generic)
                                        </SelectItem>
                                      )}
                                      {roles.map((role: any) => (
                                        <SelectItem key={`role-${role.id}`} value={`role-${role.id}`}>
                                          {role.name} (Role)
                                        </SelectItem>
                                      ))}
                                      {assignableUsers.map((user: any) => {
                                        const isInactive = !user.isAssignable || !user.isActive;
                                        return (
                                          <SelectItem key={user.id} value={user.id}>
                                            {user.name}{isInactive ? ' (Inactive)' : ''}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <span className="text-sm text-muted-foreground">Comments:</span>
                                  {editingField === `${item.id}-comments` ? (
                                    <Input
                                      className="mt-1"
                                      value={editingDraft[`${item.id}-comments`] || ""}
                                      onChange={(e) => updateFieldDraft(item.id, "comments", e.target.value)}
                                      onBlur={() => saveFieldDraft(item, "comments")}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          saveFieldDraft(item, "comments");
                                        } else if (e.key === 'Escape') {
                                          setEditingField(null);
                                          setEditingDraft({});
                                        }
                                      }}
                                      autoFocus
                                      disabled={!isEditable}
                                      data-testid={`input-comments-edit-${item.id}`}
                                    />
                                  ) : (
                                    <div 
                                      className={`mt-1 p-2 bg-white dark:bg-slate-800 rounded border text-sm ${isEditable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700' : ''}`}
                                      onClick={() => isEditable && startFieldEditing(item, "comments")}
                                      title={isEditable ? "Click to edit comments" : ""}
                                      data-testid={`text-comments-${item.id}`}
                                    >
                                      {item.comments || "No comments"}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          </div>

          {/* Week Subtotals */}
          {(() => {
            const weekTotals = getFilteredLineItems().reduce((acc: any, item) => {
              const week = (item.week ?? 0).toString();
              if (!acc[week]) {
                acc[week] = { hours: 0, amount: 0, count: 0 };
              }
              acc[week].hours += Number(item.adjustedHours);
              acc[week].amount += Number(item.totalAmount);
              acc[week].count += 1;
              return acc;
            }, {});

            const sortedWeeks = Object.entries(weekTotals)
              .sort(([a], [b]) => Number(a) - Number(b));

            if (sortedWeeks.length > 1 || (sortedWeeks.length === 1 && filterWeek === "all")) {
              return (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Subtotals by Week</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedWeeks.map(([week, data]: [string, any]) => (
                      <div key={week} className="flex justify-between p-2 bg-white rounded border">
                        <span className="font-medium">
                          Week {week}
                        </span>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">
                            {Math.round(data.hours)} hrs ({data.count} items)
                          </div>
                          <div className="font-semibold">
                            ${Math.round(data.amount).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="mt-4 flex justify-end">
            <div className="text-right space-y-1">
              <div className="text-sm text-muted-foreground">
                Total Hours: {Math.round(totalHours)}
              </div>
              {estimate?.presentedTotal && Number(estimate.presentedTotal) !== totalAmount ? (
                <>
                  <div className="text-sm text-muted-foreground">
                    Line Items Total: ${Math.round(totalAmount).toLocaleString()}
                  </div>
                  <div className="text-lg font-semibold text-blue-600">
                    Quote Total: ${Math.round(Number(estimate.presentedTotal)).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    (Override: {Number(estimate.presentedTotal) > totalAmount ? '+' : ''}{Math.round(Number(estimate.presentedTotal) - totalAmount).toLocaleString()})
                  </div>
                </>
              ) : (
                <div className="text-lg font-semibold">
                  Total Amount: ${Math.round(
                    estimate?.blockDollars ? Number(estimate.blockDollars) : 
                    (estimate?.presentedTotal ? Number(estimate.presentedTotal) : totalAmount)
                  ).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rate Overrides Section - Always visible to display existing overrides */}
      {id && <RateOverridesSection estimateId={id} isEditable={isEditable} />}
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources" className="space-y-6">
          <ResourcesView estimateId={id!} epics={epics} stages={stages} />
        </TabsContent>

        {/* Contingency Analysis Tab */}
        <TabsContent value="contingency" className="space-y-6">
          <ContingencyAnalysisView estimateId={id!} vocabulary={vocabulary} />
        </TabsContent>

        {/* Structure Management Tab */}
        <TabsContent value="management" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{vocabulary.epic} & {vocabulary.stage} Structure Management</CardTitle>
                  <CardDescription>
                    Organize your estimate structure and manage {vocabulary.epic.toLowerCase()}s and {vocabulary.stage.toLowerCase()}s
                  </CardDescription>
                </div>
                <Button onClick={() => setShowEpicDialog(true)} size="sm" disabled={!isEditable}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add {vocabulary.epic}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Structure Overview */}
              <div className="space-y-4">
                {epics.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No {vocabulary.epic.toLowerCase()}s created yet. Click "Add {vocabulary.epic}" to get started.
                  </div>
                ) : (
                  [...epics].sort((a, b) => a.order - b.order).map((epic) => {
                    // Get stages for this epic, sorted by order
                    const epicStages = stages.filter(stage => stage.epicId === epic.id).sort((a, b) => a.order - b.order);
                    
                    // Detect duplicate stages (same name within epic)
                    const stageNames = epicStages.map(s => s.name.toLowerCase().trim());
                    const duplicateNames = stageNames.filter((name, index) => stageNames.indexOf(name) !== index);
                    
                    return (
                      <div key={epic.id} className="border rounded-lg p-4">
                        {/* Epic Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-primary" />
                            {editingEpicId === epic.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingEpicName}
                                  onChange={(e) => setEditingEpicName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateEpicMutation.mutate({ epicId: epic.id, name: editingEpicName });
                                      setEditingEpicId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingEpicId(null);
                                    }
                                  }}
                                  className="h-8 w-48"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    updateEpicMutation.mutate({ epicId: epic.id, name: editingEpicName });
                                    setEditingEpicId(null);
                                  }}
                                  disabled={!isEditable}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingEpicId(null)}
                                  disabled={!isEditable}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm text-muted-foreground font-normal">#{epic.order}</span>
                                <h3 
                                  className="font-semibold text-lg cursor-pointer hover:underline" 
                                  onClick={() => {
                                    setEditingEpicId(epic.id);
                                    setEditingEpicName(epic.name);
                                  }}
                                  title="Click to edit"
                                >
                                  {epic.name}
                                </h3>
                                <Badge variant="secondary">
                                  {epicStages.length} stage{epicStages.length !== 1 ? 's' : ''}
                                </Badge>
                                {duplicateNames.length > 0 && (
                                  <Badge variant="destructive">
                                    {duplicateNames.length} duplicate{duplicateNames.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {/* Reorder buttons */}
                            <div className="flex flex-col gap-0.5 mr-2">
                              <Button
                                onClick={() => {
                                  const sortedEpics = [...epics].sort((a, b) => a.order - b.order);
                                  const currentIndex = sortedEpics.findIndex(e => e.id === epic.id);
                                  if (currentIndex > 0) {
                                    const prevEpic = sortedEpics[currentIndex - 1];
                                    updateEpicMutation.mutate({ epicId: epic.id, order: prevEpic.order });
                                    updateEpicMutation.mutate({ epicId: prevEpic.id, order: epic.order });
                                  }
                                }}
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                disabled={!isEditable || epic.order === 1}
                                title="Move up"
                                data-testid={`button-epic-up-${epic.id}`}
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={() => {
                                  const sortedEpics = [...epics].sort((a, b) => a.order - b.order);
                                  const currentIndex = sortedEpics.findIndex(e => e.id === epic.id);
                                  if (currentIndex < sortedEpics.length - 1) {
                                    const nextEpic = sortedEpics[currentIndex + 1];
                                    updateEpicMutation.mutate({ epicId: epic.id, order: nextEpic.order });
                                    updateEpicMutation.mutate({ epicId: nextEpic.id, order: epic.order });
                                  }
                                }}
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                disabled={!isEditable || [...epics].sort((a, b) => a.order - b.order).findIndex(e => e.id === epic.id) === epics.length - 1}
                                title="Move down"
                                data-testid={`button-epic-down-${epic.id}`}
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                            <Button
                              onClick={() => {
                                setSelectedEpicForStage(epic.id);
                                setShowStageDialog(true);
                              }}
                              size="sm"
                              variant="outline"
                              disabled={!isEditable}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add {vocabulary.stage}
                            </Button>
                            <Button
                              onClick={() => {
                                setEditingEpicId(epic.id);
                                setEditingEpicName(epic.name);
                              }}
                              size="sm"
                              variant="ghost"
                              title="Edit epic name"
                              disabled={!isEditable}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => {
                                // Check if epic has stages or line items
                                const epicLineItems = lineItems.filter(item => item.epicId === epic.id);
                                if (epicStages.length > 0) {
                                  toast({
                                    title: "Cannot delete epic",
                                    description: `This epic has ${epicStages.length} stage(s). Delete or reassign them first.`,
                                    variant: "destructive"
                                  });
                                } else if (epicLineItems.length > 0) {
                                  toast({
                                    title: "Cannot delete epic",
                                    description: `This epic has ${epicLineItems.length} line item(s). Reassign them first.`,
                                    variant: "destructive"
                                  });
                                } else {
                                  deleteEstimateEpicMutation.mutate(epic.id);
                                }
                              }}
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={!isEditable || deleteEstimateEpicMutation.isPending}
                              title="Delete epic"
                            >
                              {deleteEstimateEpicMutation.isPending ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Stages List */}
                        <div className="space-y-2 ml-6">
                          {epicStages.length === 0 ? (
                            <div className="text-muted-foreground text-sm py-2">
                              No stages in this epic yet
                            </div>
                          ) : (
                            epicStages.map((stage) => {
                              // Count line items assigned to this stage
                              const lineItemCount = lineItems.filter(item => item.stageId === stage.id).length;
                              const isDuplicate = duplicateNames.includes(stage.name.toLowerCase().trim());
                              
                              return (
                                <div
                                  key={stage.id}
                                  className={`flex items-center justify-between p-3 rounded border ${
                                    isDuplicate ? 'border-red-200 bg-red-50' : 'border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-0.5 bg-gray-300"></div>
                                    {editingStageId === stage.id ? (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={editingStageName}
                                          onChange={(e) => setEditingStageName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              updateStageMutation.mutate({ stageId: stage.id, name: editingStageName });
                                              setEditingStageId(null);
                                            } else if (e.key === 'Escape') {
                                              setEditingStageId(null);
                                            }
                                          }}
                                          className="h-8 w-64"
                                          autoFocus
                                          data-testid={`input-stage-name-${stage.id}`}
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            updateStageMutation.mutate({ stageId: stage.id, name: editingStageName });
                                            setEditingStageId(null);
                                          }}
                                          data-testid={`button-save-stage-${stage.id}`}
                                          disabled={!isEditable}
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setEditingStageId(null)}
                                          data-testid={`button-cancel-stage-${stage.id}`}
                                          disabled={!isEditable}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <>
                                        <span className="text-xs text-muted-foreground">#{stage.order}</span>
                                        <span className="font-medium">{stage.name}</span>
                                        <Badge variant={lineItemCount > 0 ? "default" : "outline"}>
                                          {lineItemCount} line item{lineItemCount !== 1 ? 's' : ''}
                                        </Badge>
                                        {isDuplicate && (
                                          <Badge variant="destructive" className="text-xs">
                                            DUPLICATE
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  <div className="flex gap-1 items-center">
                                    {/* Stage reorder buttons */}
                                    {!editingStageId && (
                                      <div className="flex flex-col gap-0.5 mr-1">
                                        <Button
                                          onClick={() => {
                                            const currentIndex = epicStages.findIndex(s => s.id === stage.id);
                                            if (currentIndex > 0) {
                                              const prevStage = epicStages[currentIndex - 1];
                                              updateStageMutation.mutate({ stageId: stage.id, order: prevStage.order });
                                              updateStageMutation.mutate({ stageId: prevStage.id, order: stage.order });
                                            }
                                          }}
                                          size="sm"
                                          variant="ghost"
                                          className="h-4 w-4 p-0"
                                          disabled={!isEditable || epicStages.findIndex(s => s.id === stage.id) === 0}
                                          title="Move up"
                                          data-testid={`button-stage-up-${stage.id}`}
                                        >
                                          <ArrowUp className="h-2.5 w-2.5" />
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            const currentIndex = epicStages.findIndex(s => s.id === stage.id);
                                            if (currentIndex < epicStages.length - 1) {
                                              const nextStage = epicStages[currentIndex + 1];
                                              updateStageMutation.mutate({ stageId: stage.id, order: nextStage.order });
                                              updateStageMutation.mutate({ stageId: nextStage.id, order: stage.order });
                                            }
                                          }}
                                          size="sm"
                                          variant="ghost"
                                          className="h-4 w-4 p-0"
                                          disabled={!isEditable || epicStages.findIndex(s => s.id === stage.id) === epicStages.length - 1}
                                          title="Move down"
                                          data-testid={`button-stage-down-${stage.id}`}
                                        >
                                          <ArrowDown className="h-2.5 w-2.5" />
                                        </Button>
                                      </div>
                                    )}
                                    {!editingStageId && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingStageId(stage.id);
                                          setEditingStageName(stage.name);
                                        }}
                                        data-testid={`button-edit-stage-${stage.id}`}
                                        disabled={!isEditable}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {isDuplicate && !editingStageId && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        disabled={!isEditable || mergeStagesMutation.isPending}
                                        onClick={() => {
                                          // Find the first non-duplicate stage with the same name to merge with
                                          const keepStage = epicStages.find(s => 
                                            s.name.toLowerCase().trim() === stage.name.toLowerCase().trim() && 
                                            s.id !== stage.id
                                          );
                                          
                                          if (keepStage) {
                                            mergeStagesMutation.mutate({
                                              keepStageId: keepStage.id,
                                              deleteStageId: stage.id
                                            });
                                          } else {
                                            toast({
                                              title: "Cannot merge stage",
                                              description: "Could not find a stage to merge with",
                                              variant: "destructive"
                                            });
                                          }
                                        }}
                                        data-testid={`button-merge-stage-${stage.id}`}
                                      >
                                        {mergeStagesMutation.isPending ? "Merging..." : "Merge"}
                                      </Button>
                                    )}
                                    {!editingStageId && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={!isEditable || lineItemCount > 0 || deleteEstimateStageMutation.isPending}
                                        onClick={() => {
                                          if (lineItemCount > 0) {
                                            toast({
                                              title: "Cannot delete stage",
                                              description: `This stage has ${lineItemCount} line items. Reassign them first.`,
                                              variant: "destructive"
                                            });
                                          } else {
                                            deleteEstimateStageMutation.mutate(stage.id);
                                          }
                                        }}
                                        data-testid={`button-delete-stage-${stage.id}`}
                                      >
                                        {deleteEstimateStageMutation.isPending ? (
                                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* Summary Section */}
              {epics.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Structure Summary</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Total Epics</div>
                      <div className="font-medium">{epics.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Stages</div>
                      <div className="font-medium">{stages.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Duplicates Found</div>
                      <div className="font-medium text-red-600">
                        {(() => {
                          let duplicateCount = 0;
                          epics.forEach(epic => {
                            const epicStages = stages.filter(s => s.epicId === epic.id);
                            const stageNames = epicStages.map(s => s.name.toLowerCase().trim());
                            const duplicates = stageNames.filter((name, index) => stageNames.indexOf(name) !== index);
                            duplicateCount += duplicates.length;
                          });
                          return duplicateCount;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}

    {/* Epic Creation Dialog */}
    <Dialog open={showEpicDialog} onOpenChange={setShowEpicDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New {vocabulary.epic}</DialogTitle>
          <DialogDescription>
            Add a new {vocabulary.epic.toLowerCase()} to organize your estimate line items
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="epic-name">Epic Name</Label>
            <Input
              id="epic-name"
              value={newEpicName}
              onChange={(e) => setNewEpicName(e.target.value)}
              placeholder="Enter epic name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEpicDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (newEpicName.trim()) {
                createEpicMutation.mutate({ name: newEpicName.trim() });
              }
            }}
            disabled={!isEditable || !newEpicName.trim() || createEpicMutation.isPending}
          >
            {createEpicMutation.isPending ? "Creating..." : `Create ${vocabulary.epic}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Stage Creation Dialog */}
    <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New {vocabulary.stage}</DialogTitle>
          <DialogDescription>
            Add a new {vocabulary.stage.toLowerCase()} to a {vocabulary.epic.toLowerCase()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="stage-epic">Select Epic</Label>
            <Select value={selectedEpicForStage} onValueChange={setSelectedEpicForStage}>
              <SelectTrigger>
                <SelectValue placeholder="Select an epic" />
              </SelectTrigger>
              <SelectContent>
                {epics.filter(epic => epic.id && epic.id !== "").map((epic) => (
                  <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="stage-name">Stage Name</Label>
            <Input
              id="stage-name"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Enter stage name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowStageDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (selectedEpicForStage && newStageName.trim()) {
                createStageMutation.mutate({ 
                  epicId: selectedEpicForStage, 
                  name: newStageName.trim() 
                });
              }
            }}
            disabled={!isEditable || !selectedEpicForStage || !newStageName.trim() || createStageMutation.isPending}
          >
            {createStageMutation.isPending ? "Creating..." : `Create ${vocabulary.stage}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Milestone Creation Dialog */}
    <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Milestone Payment</DialogTitle>
          <DialogDescription>
            Define a payment milestone for the customer
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="milestone-name">Name</Label>
            <Input
              id="milestone-name"
              placeholder="e.g., Project Kickoff, Phase 1 Completion"
              value={newMilestone.name}
              onChange={(e) => setNewMilestone({ ...newMilestone, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="milestone-description">Description</Label>
            <Input
              id="milestone-description"
              placeholder="Optional description"
              value={newMilestone.description}
              onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="milestone-amount">Fixed Amount ($)</Label>
              <Input
                id="milestone-amount"
                type="number"
                placeholder="0.00"
                value={newMilestone.amount}
                onChange={(e) => setNewMilestone({ ...newMilestone, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="milestone-percentage">Or Percentage (%)</Label>
              <Input
                id="milestone-percentage"
                type="number"
                placeholder="0"
                value={newMilestone.percentage}
                onChange={(e) => setNewMilestone({ ...newMilestone, percentage: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="milestone-due">Due Date</Label>
            <Input
              id="milestone-due"
              type="date"
              value={newMilestone.dueDate}
              onChange={(e) => setNewMilestone({ ...newMilestone, dueDate: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowMilestoneDialog(false);
              setNewMilestone({ name: "", description: "", amount: "", percentage: "", dueDate: "" });
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Calculate sort order based on existing milestones
              const sortOrder = milestones.length + 1;
              
              createMilestoneMutation.mutate({
                name: newMilestone.name,
                description: newMilestone.description || null,
                amount: newMilestone.amount ? String(newMilestone.amount) : null,
                percentage: newMilestone.percentage ? String(newMilestone.percentage) : null,
                dueDate: newMilestone.dueDate || null,
                sortOrder
              });
            }}
            disabled={
              !isEditable ||
              !newMilestone.name?.trim() || 
              ((!newMilestone.amount?.trim()) && (!newMilestone.percentage?.trim())) || 
              (!!newMilestone.amount?.trim() && !!newMilestone.percentage?.trim()) || 
              createMilestoneMutation.isPending
            }
          >
            {createMilestoneMutation.isPending ? "Creating..." : "Add Milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Milestone Edit Dialog */}
    <Dialog open={showMilestoneEditDialog} onOpenChange={setShowMilestoneEditDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Milestone Payment</DialogTitle>
          <DialogDescription>
            Update the milestone payment details
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-milestone-name">Name</Label>
            <Input
              id="edit-milestone-name"
              placeholder="e.g., Project Kickoff, Phase 1 Completion"
              value={editingMilestone?.name || ""}
              onChange={(e) => setEditingMilestone({ ...editingMilestone, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="edit-milestone-description">Description</Label>
            <Input
              id="edit-milestone-description"
              placeholder="Optional description"
              value={editingMilestone?.description || ""}
              onChange={(e) => setEditingMilestone({ ...editingMilestone, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-milestone-amount">Fixed Amount ($)</Label>
              <Input
                id="edit-milestone-amount"
                type="number"
                placeholder="0.00"
                value={editingMilestone?.amount || ""}
                onChange={(e) => setEditingMilestone({ ...editingMilestone, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-milestone-percentage">Or Percentage (%)</Label>
              <Input
                id="edit-milestone-percentage"
                type="number"
                placeholder="0"
                value={editingMilestone?.percentage || ""}
                onChange={(e) => setEditingMilestone({ ...editingMilestone, percentage: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-milestone-due">Due Date</Label>
            <Input
              id="edit-milestone-due"
              type="date"
              value={editingMilestone?.dueDate || ""}
              onChange={(e) => setEditingMilestone({ ...editingMilestone, dueDate: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowMilestoneEditDialog(false);
              setEditingMilestone(null);
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              updateMilestoneMutation.mutate({
                milestoneId: editingMilestone.id,
                data: {
                  name: editingMilestone.name,
                  description: editingMilestone.description || null,
                  amount: editingMilestone.amount ? parseFloat(editingMilestone.amount) : null,
                  percentage: editingMilestone.percentage ? parseFloat(editingMilestone.percentage) : null,
                  dueDate: editingMilestone.dueDate || null
                }
              });
              setShowMilestoneEditDialog(false);
              setEditingMilestone(null);
            }}
            disabled={!isEditable || !editingMilestone?.name || (!editingMilestone?.amount && !editingMilestone?.percentage) || !!(editingMilestone?.amount && editingMilestone?.percentage) || updateMilestoneMutation.isPending}
          >
            {updateMilestoneMutation.isPending ? "Updating..." : "Update Milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Bulk Edit Dialog */}
    <Dialog open={bulkEditDialog} onOpenChange={setBulkEditDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Edit Line Items</DialogTitle>
          <DialogDescription>
            Edit {selectedItems.size} selected line items. Only fields with values will be updated.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-epic">{vocabulary.epic}</Label>
              <Select value={bulkEditData.epicId} onValueChange={(value) => setBulkEditData({...bulkEditData, epicId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Epic</SelectItem>
                  {[...epics].sort((a, b) => a.order - b.order).map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>#{epic.order} {epic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-stage">{vocabulary.stage}</Label>
              <Select value={bulkEditData.stageId} onValueChange={(value) => setBulkEditData({...bulkEditData, stageId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Stage</SelectItem>
                  {[...stages].sort((a, b) => a.order - b.order).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>#{stage.order} {stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-workstream">{vocabulary.workstream}</Label>
              <Input
                id="bulk-workstream"
                placeholder="Keep current values"
                value={bulkEditData.workstream}
                onChange={(e) => setBulkEditData({...bulkEditData, workstream: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-week">Week</Label>
              <Input
                id="bulk-week"
                type="number"
                placeholder="Keep current values"
                value={bulkEditData.week}
                onChange={(e) => setBulkEditData({...bulkEditData, week: e.target.value})}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-size">Size</Label>
              <Select value={bulkEditData.size} onValueChange={(value) => setBulkEditData({...bulkEditData, size: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-complexity">Complexity</Label>
              <Select value={bulkEditData.complexity} onValueChange={(value) => setBulkEditData({...bulkEditData, complexity: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Simple</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Complex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-confidence">Confidence</Label>
              <Select value={bulkEditData.confidence} onValueChange={(value) => setBulkEditData({...bulkEditData, confidence: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-rate">Rate ($)</Label>
              <Input
                id="bulk-rate"
                type="number"
                placeholder="Keep current values"
                value={bulkEditData.rate}
                onChange={(e) => setBulkEditData({...bulkEditData, rate: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              {/* Category field hidden per requirements */}
              <Label htmlFor="bulk-workstream">{vocabulary.workstream}</Label>
              <Input
                id="bulk-workstream"
                placeholder="Keep current values"
                value={bulkEditData.workstream}
                onChange={(e) => setBulkEditData({...bulkEditData, workstream: e.target.value})}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBulkEditDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const updates: any = {};
              if (bulkEditData.epicId) {
                updates.epicId = bulkEditData.epicId === "none" ? null : bulkEditData.epicId;
              }
              if (bulkEditData.stageId) {
                updates.stageId = bulkEditData.stageId === "none" ? null : bulkEditData.stageId;
              }
              if (bulkEditData.workstream) updates.workstream = bulkEditData.workstream;
              if (bulkEditData.week) updates.week = String(bulkEditData.week);
              if (bulkEditData.size) updates.size = bulkEditData.size;
              if (bulkEditData.complexity) updates.complexity = bulkEditData.complexity;
              if (bulkEditData.confidence) updates.confidence = bulkEditData.confidence;
              if (bulkEditData.rate) updates.rate = String(bulkEditData.rate);
              // Category field hidden per requirements
              
              if (Object.keys(updates).length > 0) {
                bulkUpdateMutation.mutate({
                  itemIds: Array.from(selectedItems),
                  updates
                });
              }
            }}
            disabled={!isEditable || bulkUpdateMutation.isPending || Object.values(bulkEditData).every(v => !v)}
          >
            {bulkUpdateMutation.isPending ? "Updating..." : "Update Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Assign Roles/Users Dialog */}
    <Dialog open={applyUserRatesDialog} onOpenChange={setApplyUserRatesDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Roles/Users</DialogTitle>
          <DialogDescription>
            Select a role or user to assign to {selectedItems.size} selected line items.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="resource">Resource Assignment</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select role or user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Generic Roles</div>
                {roles.map((role: any) => (
                  <SelectItem key={`role-${role.id}`} value={`role-${role.id}`}>
                    {role.name} (${role.defaultRackRate}/hr)
                  </SelectItem>
                ))}
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Specific Staff</div>
                {users.filter((user: any) => user.isAssignable).map((member: any) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} - {member.role} (${member.defaultBillingRate}/hr)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setApplyUserRatesDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedUserId) {
                let updates: any = {};
                
                if (selectedUserId === "unassigned") {
                  updates = {
                    assignedUserId: null,
                    roleId: null,
                    resourceName: null,
                    rate: "0",
                    costRate: "0"
                  };
                } else if (selectedUserId.startsWith("role-")) {
                  const roleId = selectedUserId.substring(5);
                  const selectedRole = roles.find((r: any) => r.id === roleId);
                  if (selectedRole) {
                    updates = {
                      assignedUserId: null,
                      roleId: selectedRole.id,
                      resourceName: selectedRole.name,
                      rate: selectedRole.defaultRackRate?.toString() || "0",
                      costRate: selectedRole.defaultCostRate?.toString() || "0"
                    };
                  }
                } else {
                  const selectedUser = users.find((s: any) => s.id === selectedUserId);
                  if (selectedUser) {
                    updates = {
                      assignedUserId: selectedUser.id,
                      roleId: null,
                      resourceName: selectedUser.name,
                      rate: selectedUser.defaultBillingRate?.toString() || "0",
                      costRate: selectedUser.defaultCostRate?.toString() || "0"
                    };
                  }
                }
                
                if (Object.keys(updates).length > 0) {
                  bulkUpdateMutation.mutate({
                    itemIds: Array.from(selectedItems),
                    updates
                  });
                  setApplyUserRatesDialog(false);
                  setSelectedUserId("");
                }
              }
            }}
            disabled={!isEditable || !selectedUserId || bulkUpdateMutation.isPending}
          >
            {bulkUpdateMutation.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Split Line Item Dialog */}
    <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split Line Item</DialogTitle>
          <DialogDescription>
            Split "{splittingItem?.description}" into two separate line items with different hour allocations
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-2">Original Item:</div>
            <div className="font-medium">{splittingItem?.description}</div>
            <div className="text-sm">Total Hours: {Number(splittingItem?.adjustedHours || splittingItem?.baseHours || 0)}</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first-hours">First Item Hours</Label>
              <Input
                id="first-hours"
                type="number"
                step="0.5"
                min="0"
                value={splitHours.first}
                onChange={(e) => setSplitHours({...splitHours, first: e.target.value})}
                placeholder="Hours for first item"
              />
            </div>
            <div>
              <Label htmlFor="second-hours">Second Item Hours</Label>
              <Input
                id="second-hours"
                type="number"
                step="0.5"
                min="0"
                value={splitHours.second}
                onChange={(e) => setSplitHours({...splitHours, second: e.target.value})}
                placeholder="Hours for second item"
              />
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Total allocated: {Number(splitHours.first || 0) + Number(splitHours.second || 0)} hours
            {Number(splitHours.first || 0) + Number(splitHours.second || 0) !== Number(splittingItem?.adjustedHours || splittingItem?.baseHours || 0) && (
              <span className="text-amber-600 ml-2">
                (differs from original {Number(splittingItem?.adjustedHours || splittingItem?.baseHours || 0)} hours)
              </span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowSplitDialog(false);
              setSplittingItem(null);
              setSplitHours({ first: "", second: "" });
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (splittingItem && splitHours.first && splitHours.second) {
                splitLineItemMutation.mutate({
                  itemId: splittingItem.id,
                  firstHours: Number(splitHours.first),
                  secondHours: Number(splitHours.second)
                });
              }
            }}
            disabled={!isEditable || !splitHours.first || !splitHours.second || splitLineItemMutation.isPending}
          >
            {splitLineItemMutation.isPending ? "Splitting..." : "Split Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Approval Dialog */}
    <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{estimate?.status === 'approved' ? 'Create Project from Estimate' : 'Approve Estimate'}</DialogTitle>
          <DialogDescription>
            {estimate?.status === 'approved' 
              ? 'Create a new project from this approved estimate.'
              : 'Approve this estimate and optionally create a project from it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="create-project"
              checked={shouldCreateProject}
              onChange={(e) => setShouldCreateProject(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="create-project">Create project from this estimate</Label>
          </div>
          
          {shouldCreateProject && (
            <div className="flex items-center space-x-2 ml-6">
              <input
                type="checkbox"
                id="copy-assignments"
                checked={shouldCopyAssignments}
                onChange={(e) => setShouldCopyAssignments(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                data-testid="checkbox-copy-assignments"
              />
              <Label htmlFor="copy-assignments">Copy resource assignments from estimate</Label>
            </div>
          )}
          
          {shouldCreateProject && estimate?.blockDollars && (
            <div>
              <Label htmlFor="block-description">
                Block Hour Line Item Description
                <span className="text-sm text-muted-foreground ml-2">
                  (for invoicing)
                </span>
              </Label>
              <Input
                id="block-description"
                placeholder="e.g., Professional Services - Q1 2025"
                value={blockHourDescription}
                onChange={(e) => setBlockHourDescription(e.target.value)}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                This description will appear on invoices for block hour billing
              </p>
            </div>
          )}
          
          {shouldCreateProject && (
            <>
              <div>
                <Label htmlFor="kickoff-date">
                  Kickoff Meeting Date (Optional)
                  <span className="text-sm text-muted-foreground ml-2">
                    Week 1 activities will start from Monday of this week
                  </span>
                </Label>
                <Input
                  id="kickoff-date"
                  type="date"
                  value={kickoffDate}
                  onChange={(e) => setKickoffDate(e.target.value)}
                  className="mt-1"
                  data-testid="input-kickoff-date"
                />
                {kickoffDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Week 0: Week of {new Date(new Date(kickoffDate).getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • 
                    Week 1: Week of {new Date(kickoffDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-sm mb-2">Project will be created with:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• All epics, stages, and activities from this estimate</li>
                  <li>• Rate overrides from resource allocations</li>
                  <li>• Resource assignments transferred from line items</li>
                  <li>• Time tracking phase templates</li>
                  <li>• Budget: {estimate?.presentedTotal || estimate?.totalFees || estimate?.blockDollars || '0'}</li>
                  {kickoffDate && <li>• Activities scheduled based on kickoff date</li>}
                </ul>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowApprovalDialog(false);
              setBlockHourDescription("");
              setKickoffDate("");
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              approveEstimateMutation.mutate({ 
                createProject: shouldCreateProject,
                copyAssignments: shouldCopyAssignments,
                blockHourDescription: blockHourDescription || undefined,
                kickoffDate: kickoffDate || undefined
              });
            }}
            disabled={approveEstimateMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {approveEstimateMutation.isPending 
              ? (estimate?.status === 'approved' ? "Creating Project..." : "Approving...") 
              : (estimate?.status === 'approved' ? "Create Project" : "Approve Estimate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Missing Roles Wizard Dialog */}
    <Dialog open={showMissingRolesWizard} onOpenChange={(open) => {
      setShowMissingRolesWizard(open);
      if (!open) {
        setMissingRoles([]);
        // Only clear pending file if user closes without action (not when proceeding)
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Unrecognized Resources Found
          </DialogTitle>
          <DialogDescription>
            The following resource names in your CSV don't match any existing roles or users. 
            Please set their billing and cost rates to create them as new roles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Resource Name</th>
                  <th className="text-center p-3 font-medium">Used</th>
                  <th className="text-right p-3 font-medium">Billing Rate</th>
                  <th className="text-right p-3 font-medium">Cost Rate</th>
                </tr>
              </thead>
              <tbody>
                {missingRoles.map((role, index) => (
                  <tr key={role.name} className="border-t">
                    <td className="p-3 font-medium">{role.name}</td>
                    <td className="p-3 text-center text-muted-foreground">{role.usageCount}x</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={role.billingRate}
                          onChange={(e) => updateMissingRoleRate(index, 'billingRate', e.target.value)}
                          className="w-24 text-right"
                          data-testid={`input-billing-rate-${index}`}
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={role.costRate}
                          onChange={(e) => updateMissingRoleRate(index, 'costRate', e.target.value)}
                          className="w-24 text-right"
                          data-testid={`input-cost-rate-${index}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            These roles will be created in your system and can be managed from the Roles page.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowMissingRolesWizard(false);
              setMissingRoles([]);
              setPendingImportFile(null);
            }}
            data-testid="button-cancel-missing-roles"
          >
            Cancel Import
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowMissingRolesWizard(false);
              setShowImportConfirmDialog(true);
            }}
            data-testid="button-skip-roles"
          >
            Skip (Import Anyway)
          </Button>
          <Button
            onClick={handleCreateMissingRoles}
            data-testid="button-create-roles"
          >
            Create Roles & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Excel Import Confirmation Dialog */}
    <Dialog open={showImportConfirmDialog} onOpenChange={(open) => {
      setShowImportConfirmDialog(open);
      // Clear pending file if dialog is closed without import
      if (!open) {
        setPendingImportFile(null);
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Excel File</DialogTitle>
          <DialogDescription>
            Would you like to remove all existing line items or keep them and add the imported items?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Choose how to handle your existing {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}:
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 border rounded-lg hover:bg-gray-50">
              <div className="flex-1">
                <p className="font-medium">Remove and Replace</p>
                <p className="text-sm text-muted-foreground">Delete all existing items and import new ones</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 border rounded-lg hover:bg-gray-50">
              <div className="flex-1">
                <p className="font-medium">Keep and Add</p>
                <p className="text-sm text-muted-foreground">Keep existing items and add imported ones</p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowImportConfirmDialog(false);
              setPendingImportFile(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => executeImport(false)}
            data-testid="button-import-keep-add"
          >
            Keep and Add
          </Button>
          <Button
            onClick={() => executeImport(true)}
            data-testid="button-import-remove-replace"
          >
            Remove and Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Recalculate Confirmation Dialog */}
    <Dialog open={showRecalcDialog} onOpenChange={setShowRecalcDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recalculate All Values?</DialogTitle>
          <DialogDescription>
            This will update all line items with the following changes:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Lookup current billing and cost rates for each assigned resource</li>
            <li>Reapply size, complexity, and confidence factor multipliers</li>
            <li>Recalculate adjusted hours, amounts, costs, and margins</li>
            <li>Update estimate totals</li>
          </ul>
          <p className="text-sm font-medium text-orange-600 mt-4">
            This will overwrite any manual rate adjustments you may have made.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowRecalcDialog(false)}
            data-testid="button-cancel-recalc"
          >
            Cancel
          </Button>
          <Button
            onClick={() => recalculateEstimateMutation.mutate()}
            disabled={!isEditable || recalculateEstimateMutation.isPending}
            data-testid="button-confirm-recalc"
          >
            {recalculateEstimateMutation.isPending ? "Recalculating..." : "Recalculate All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Proposal Narrative Dialog */}
    <Dialog open={showNarrativeDialog} onOpenChange={setShowNarrativeDialog}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Proposal Narrative
          </DialogTitle>
          <DialogDescription>
            AI-generated proposal narrative addressing scope, deliverables, staffing, KPIs, and client dependencies for each Epic.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          {generateNarrativeMutation.isPending ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Generating comprehensive proposal narrative...</p>
              <p className="text-sm text-muted-foreground">This may take 1-2 minutes for large estimates.</p>
            </div>
          ) : narrativeError ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-destructive font-medium">Generation Failed</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">{narrativeError}</p>
              <Button 
                onClick={handleGenerateNarrative}
                variant="outline"
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : generatedNarrative ? (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div 
                  className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ 
                    __html: generatedNarrative
                      .replace(/^### (.*?)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
                      .replace(/^## (.*?)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3 border-b pb-2">$1</h2>')
                      .replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/^- (.*?)$/gm, '<li class="ml-4">$1</li>')
                      .replace(/(<li.*?<\/li>\n?)+/g, '<ul class="list-disc space-y-1 my-2">$&</ul>')
                  }}
                />
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p>No narrative generated yet.</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {generatedNarrative && (
            <Button
              variant="outline"
              onClick={handleCopyNarrative}
              data-testid="button-copy-narrative"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowNarrativeDialog(false)}
          >
            Close
          </Button>
          {generatedNarrative && (
            <Button
              onClick={handleGenerateNarrative}
              disabled={generateNarrativeMutation.isPending}
            >
              {generateNarrativeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* PM Wizard Dialog */}
    {id && (
      <PMWizardDialog
        estimateId={id}
        open={showPMWizard}
        onOpenChange={setShowPMWizard}
      />
    )}

    </div>
    </div>
    </Layout>
  );
}

// ResourcesView Component
interface ResourcesViewProps {
  estimateId: string;
  epics: EstimateEpic[];
  stages: EstimateStage[];
}

function ResourcesView({ estimateId, epics, stages }: ResourcesViewProps) {
  const vocabulary = useVocabulary();
  const [filterEpic, setFilterEpic] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [showWeekColumns, setShowWeekColumns] = useState(false);

  // Fetch line items instead of summary to build weekly view
  const { data: lineItems, isLoading } = useQuery({
    queryKey: [`/api/estimates/${estimateId}/line-items`],
    // Don't provide queryFn - use the default fetcher configured in queryClient
  });

  const filteredStages = filterEpic === 'all' 
    ? stages 
    : stages.filter(s => String(s.epicId) === filterEpic);
  
  // Process line items to create weekly resource allocation
  const resourceWeeklyData = useMemo(() => {
    if (!lineItems) return { resources: [], weeks: [], totalByWeek: {} };
    
    // Filter line items based on epic and stage
    let filtered = lineItems as any[];
    if (filterEpic !== 'all') {
      const epicStages = stages.filter(s => String(s.epicId) === filterEpic);
      const stageIds = epicStages.map(s => s.id);
      filtered = filtered.filter((item: any) => stageIds.includes(item.stageId));
    }
    if (filterStage !== 'all') {
      filtered = filtered.filter((item: any) => String(item.stageId) === filterStage);
    }
    
    // Get unique weeks from all line items
    const allWeeks = new Set<string>();
    filtered.forEach((item: any) => {
      if (item.week !== null && item.week !== undefined) {
        allWeeks.add(`Week ${item.week}`);
      }
    });
    const sortedWeeks = Array.from(allWeeks).sort((a, b) => {
      const weekA = parseInt(a.replace('Week ', ''));
      const weekB = parseInt(b.replace('Week ', ''));
      return weekA - weekB;
    });
    
    // Group line items by resource
    const resourceMap = new Map<string, Map<string, number>>();
    const resourceNames = new Map<string, string>();
    
    filtered.forEach((item: any) => {
      // Determine resource identifier and name
      let resourceId = 'unassigned';
      let resourceName = 'Unassigned';
      
      if (item.assignedUserId && item.assignedUser) {
        resourceId = `user-${item.assignedUserId}`;
        resourceName = item.assignedUser.name || 'Unknown User';
      } else if (item.roleId && item.role) {
        resourceId = `role-${item.roleId}`;
        resourceName = `[Role] ${item.role.name}`;
      } else if (item.resourceName) {
        resourceId = `resource-${item.resourceName}`;
        resourceName = item.resourceName;
      }
      
      // Initialize resource if not exists
      if (!resourceMap.has(resourceId)) {
        resourceMap.set(resourceId, new Map<string, number>());
        resourceNames.set(resourceId, resourceName);
      }
      
      // Add hours to the appropriate week
      if (item.week !== null && item.week !== undefined) {
        const weekKey = `Week ${item.week}`;
        const currentHours = resourceMap.get(resourceId)!.get(weekKey) || 0;
        resourceMap.get(resourceId)!.set(weekKey, currentHours + parseFloat(item.adjustedHours || 0));
      }
    });
    
    // Convert to array format for display
    const resources = Array.from(resourceMap.entries()).map(([resourceId, weekData]) => {
      const totalHours = Array.from(weekData.values()).reduce((sum, hours) => sum + hours, 0);
      return {
        resourceId,
        resourceName: resourceNames.get(resourceId) || 'Unknown',
        weekData: Object.fromEntries(weekData),
        totalHours
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
    
    // Calculate total by week
    const totalByWeek: Record<string, number> = {};
    sortedWeeks.forEach(week => {
      totalByWeek[week] = resources.reduce((sum, resource) => 
        sum + (resource.weekData[week] || 0), 0
      );
    });
    
    return { resources, weeks: sortedWeeks, totalByWeek };
  }, [lineItems, filterEpic, filterStage, stages]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Resource Summary</CardTitle>
            <CardDescription>Total hours allocation by resource</CardDescription>
          </div>
          <div className="flex gap-4">
            <div className="w-48">
              <Label htmlFor="epic-filter" className="text-sm">Filter by {vocabulary.epic}</Label>
              <Select value={filterEpic} onValueChange={setFilterEpic}>
                <SelectTrigger id="epic-filter" data-testid="select-epic-filter">
                  <SelectValue placeholder={`All ${vocabulary.epic}s`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {vocabulary.epic}s</SelectItem>
                  {[...epics].sort((a, b) => a.order - b.order).map(epic => (
                    <SelectItem key={epic.id} value={String(epic.id)}>#{epic.order} {epic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label htmlFor="stage-filter" className="text-sm">Filter by {vocabulary.stage}</Label>
              <Select value={filterStage} onValueChange={setFilterStage} disabled={filterEpic === 'all'}>
                <SelectTrigger id="stage-filter" data-testid="select-stage-filter">
                  <SelectValue placeholder={`All ${vocabulary.stage}s`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {vocabulary.stage}s</SelectItem>
                  {filteredStages.map(stage => (
                    <SelectItem key={stage.id} value={String(stage.id)}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading resource allocation...</div>
        ) : !lineItems || (lineItems as any[]).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No line items in this estimate yet.
          </div>
        ) : resourceWeeklyData.resources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No resources assigned to line items yet.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toggle for week columns */}
            {resourceWeeklyData.weeks.length > 0 && (
              <div className="flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWeekColumns(!showWeekColumns)}
                  className="flex items-center gap-2"
                  data-testid="button-toggle-weeks"
                >
                  {showWeekColumns ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Hide Week Breakdown ({resourceWeeklyData.weeks.length} weeks)
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4" />
                      Show Week Breakdown ({resourceWeeklyData.weeks.length} weeks)
                    </>
                  )}
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Resource Name</TableHead>
                    {showWeekColumns && resourceWeeklyData.weeks.map(week => (
                      <TableHead key={week} className="text-center min-w-[100px]">
                        {week}
                      </TableHead>
                    ))}
                    <TableHead className="text-right min-w-[100px] font-semibold">Total Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resourceWeeklyData.resources.map((resource: any) => {
                    const grandTotal = resourceWeeklyData.resources.reduce((sum, r) => sum + r.totalHours, 0);
                    const percentage = grandTotal > 0 ? ((resource.totalHours / grandTotal) * 100).toFixed(1) : '0';
                    
                    return (
                      <TableRow key={resource.resourceId} data-testid={`resource-row-${resource.resourceId}`}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium">
                          {resource.resourceName}
                        </TableCell>
                        {showWeekColumns && resourceWeeklyData.weeks.map(week => {
                          const hours = resource.weekData[week] || 0;
                          return (
                            <TableCell key={week} className="text-center">
                              {hours > 0 ? hours.toFixed(1) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-semibold">
                          {resource.totalHours.toFixed(1)}
                          <span className="text-muted-foreground text-xs ml-2">
                            ({percentage}%)
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Total row */}
                  <TableRow className="border-t-2 font-semibold bg-muted/50">
                    <TableCell className="sticky left-0 bg-muted/50 z-10">
                      Total
                    </TableCell>
                    {showWeekColumns && resourceWeeklyData.weeks.map(week => (
                      <TableCell key={week} className="text-center">
                        {resourceWeeklyData.totalByWeek[week]?.toFixed(1) || '0'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      {resourceWeeklyData.resources.reduce((sum, r) => sum + r.totalHours, 0).toFixed(1)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            {resourceWeeklyData.weeks.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                No week numbers assigned to line items. Add week numbers in the Inputs tab to see weekly allocation.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ContingencyAnalysisView Component
interface ContingencyAnalysisViewProps {
  estimateId: string;
  vocabulary: { epic: string; stage: string; workstream: string; activity: string };
}

interface ContingencyBreakdown {
  baseHours: number;
  sizeContingencyHours: number;
  complexityContingencyHours: number;
  confidenceContingencyHours: number;
  totalContingencyHours: number;
  adjustedHours: number;
  baseFees: number;
  sizeContingencyFees: number;
  complexityContingencyFees: number;
  confidenceContingencyFees: number;
  totalContingencyFees: number;
  adjustedFees: number;
  baseCost: number;
  totalContingencyCost: number;
  adjustedCost: number;
}

interface ContingencyInsightsResponse {
  overallTotals: ContingencyBreakdown & { contingencyPercent: string };
  multipliers: {
    size: { small: number; medium: number; large: number };
    complexity: { small: number; medium: number; large: number };
    confidence: { high: number; medium: number; low: number };
  };
  byEpic: Array<{ id: string; name: string; breakdown: ContingencyBreakdown }>;
  byStage: Array<{ id: string; name: string; epicName: string; breakdown: ContingencyBreakdown }>;
  byWorkstream: Array<{ id: string; name: string; breakdown: ContingencyBreakdown }>;
  byRole: Array<{ id: string; name: string; breakdown: ContingencyBreakdown }>;
}

function ContingencyAnalysisView({ estimateId, vocabulary }: ContingencyAnalysisViewProps) {
  const [viewBy, setViewBy] = useState<'epic' | 'stage' | 'workstream' | 'role'>('epic');

  const { data: insights, isLoading } = useQuery<ContingencyInsightsResponse>({
    queryKey: [`/api/estimates/${estimateId}/contingency-insights`],
  });

  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString()}`;
  const formatHours = (value: number) => value.toFixed(1);
  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contingency Analysis</CardTitle>
          <CardDescription>Loading factor impact analysis...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contingency Analysis</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { overallTotals, multipliers } = insights;

  const getCurrentBreakdown = () => {
    switch (viewBy) {
      case 'epic': return insights.byEpic;
      case 'stage': return insights.byStage;
      case 'workstream': return insights.byWorkstream;
      case 'role': return insights.byRole;
    }
  };

  const currentBreakdown = getCurrentBreakdown();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Base Hours</div>
            <div className="text-2xl font-bold">{formatHours(overallTotals.baseHours)}</div>
            <div className="text-sm text-muted-foreground mt-1">Before contingency</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Contingency Hours</div>
            <div className="text-2xl font-bold text-orange-600">+{formatHours(overallTotals.totalContingencyHours)}</div>
            <div className="text-sm text-muted-foreground mt-1">{overallTotals.contingencyPercent}% added</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Adjusted Hours</div>
            <div className="text-2xl font-bold text-green-600">{formatHours(overallTotals.adjustedHours)}</div>
            <div className="text-sm text-muted-foreground mt-1">After contingency</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Contingency Value</div>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(overallTotals.totalContingencyFees)}</div>
            <div className="text-sm text-muted-foreground mt-1">Added to quote</div>
          </CardContent>
        </Card>
      </div>

      {/* Factor Breakdown Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Factor Contribution</CardTitle>
          <CardDescription>How each contingency factor adds to the estimate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Size Factor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Size Factor</span>
                <span className="text-muted-foreground">
                  +{formatHours(overallTotals.sizeContingencyHours)} hrs ({formatCurrency(overallTotals.sizeContingencyFees)})
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${overallTotals.totalContingencyHours > 0 ? (overallTotals.sizeContingencyHours / overallTotals.totalContingencyHours * 100) : 0}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Small: {multipliers.size.small}x</span>
                <span>Medium: {multipliers.size.medium}x</span>
                <span>Large: {multipliers.size.large}x</span>
              </div>
            </div>

            {/* Complexity Factor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Complexity Factor</span>
                <span className="text-muted-foreground">
                  +{formatHours(overallTotals.complexityContingencyHours)} hrs ({formatCurrency(overallTotals.complexityContingencyFees)})
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${overallTotals.totalContingencyHours > 0 ? (overallTotals.complexityContingencyHours / overallTotals.totalContingencyHours * 100) : 0}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Small: {multipliers.complexity.small}x</span>
                <span>Medium: {multipliers.complexity.medium}x</span>
                <span>Large: {multipliers.complexity.large}x</span>
              </div>
            </div>

            {/* Confidence Factor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Confidence Factor</span>
                <span className="text-muted-foreground">
                  +{formatHours(overallTotals.confidenceContingencyHours)} hrs ({formatCurrency(overallTotals.confidenceContingencyFees)})
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-500 rounded-full transition-all"
                  style={{ width: `${overallTotals.totalContingencyHours > 0 ? (overallTotals.confidenceContingencyHours / overallTotals.totalContingencyHours * 100) : 0}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>High: {multipliers.confidence.high}x</span>
                <span>Medium: {multipliers.confidence.medium}x</span>
                <span>Low: {multipliers.confidence.low}x</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown by Dimension */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detailed Breakdown</CardTitle>
              <CardDescription>Contingency impact by organizational dimension</CardDescription>
            </div>
            <Select value={viewBy} onValueChange={(v: 'epic' | 'stage' | 'workstream' | 'role') => setViewBy(v)}>
              <SelectTrigger className="w-40" data-testid="select-contingency-view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="epic">By {vocabulary.epic}</SelectItem>
                <SelectItem value="stage">By {vocabulary.stage}</SelectItem>
                <SelectItem value="workstream">By Workstream</SelectItem>
                <SelectItem value="role">By Role</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Name</TableHead>
                  <TableHead className="text-right">Base Hrs</TableHead>
                  <TableHead className="text-right text-blue-600">+Size</TableHead>
                  <TableHead className="text-right text-purple-600">+Complexity</TableHead>
                  <TableHead className="text-right text-orange-600">+Confidence</TableHead>
                  <TableHead className="text-right font-semibold">Total Hrs</TableHead>
                  <TableHead className="text-right">Contingency %</TableHead>
                  <TableHead className="text-right">Contingency $</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentBreakdown.map((item) => {
                  const contingencyPercent = item.breakdown.baseHours > 0 
                    ? (item.breakdown.totalContingencyHours / item.breakdown.baseHours * 100) 
                    : 0;
                  return (
                    <TableRow key={item.id} data-testid={`row-contingency-${item.id}`}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{formatHours(item.breakdown.baseHours)}</TableCell>
                      <TableCell className="text-right text-blue-600">
                        {item.breakdown.sizeContingencyHours > 0 ? `+${formatHours(item.breakdown.sizeContingencyHours)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-purple-600">
                        {item.breakdown.complexityContingencyHours > 0 ? `+${formatHours(item.breakdown.complexityContingencyHours)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {item.breakdown.confidenceContingencyHours > 0 ? `+${formatHours(item.breakdown.confidenceContingencyHours)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatHours(item.breakdown.adjustedHours)}</TableCell>
                      <TableCell className="text-right">{formatPercent(contingencyPercent)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.breakdown.totalContingencyFees)}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="border-t-2 font-semibold bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatHours(overallTotals.baseHours)}</TableCell>
                  <TableCell className="text-right text-blue-600">+{formatHours(overallTotals.sizeContingencyHours)}</TableCell>
                  <TableCell className="text-right text-purple-600">+{formatHours(overallTotals.complexityContingencyHours)}</TableCell>
                  <TableCell className="text-right text-orange-600">+{formatHours(overallTotals.confidenceContingencyHours)}</TableCell>
                  <TableCell className="text-right">{formatHours(overallTotals.adjustedHours)}</TableCell>
                  <TableCell className="text-right">{overallTotals.contingencyPercent}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(overallTotals.totalContingencyFees)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main component with VocabularyProvider wrapper
export default function EstimateDetail() {
  const { id } = useParams();
  
  // Fetch estimate to get clientId for vocabulary context
  const { data: estimate } = useQuery<Estimate>({
    queryKey: ['/api/estimates', id],
    enabled: !!id,
  });
  
  return (
    <VocabularyProvider estimateId={id} clientId={estimate?.clientId}>
      <EstimateDetailContent />
    </VocabularyProvider>
  );
}