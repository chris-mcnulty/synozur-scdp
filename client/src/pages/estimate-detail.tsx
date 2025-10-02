import { useState, useRef, useEffect } from "react";
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
import { ArrowLeft, Plus, Trash2, Download, Upload, Save, FileDown, Edit, Split, Check, X, FileCheck, Briefcase, FileText, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { EstimateLineItem, Estimate, EstimateEpic, EstimateStage, EstimateMilestone, Project } from "@shared/schema";
import { PMWizardDialog } from "@/components/pm-wizard-dialog";

export default function EstimateDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<string | null>(null); // format: "itemId-fieldName"
  const [editingDraft, setEditingDraft] = useState<Record<string, any>>({});
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
  const [filterUnresourced, setFilterUnresourced] = useState(false);
  const [filterResource, setFilterResource] = useState("all");
  const [showResourceSummary, setShowResourceSummary] = useState(false);
  const [showEpicManagement, setShowEpicManagement] = useState(false);
  const [showStageManagement, setShowStageManagement] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splittingItem, setSplittingItem] = useState<EstimateLineItem | null>(null);
  const [splitHours, setSplitHours] = useState({ first: "", second: "" });
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [blockHourDescription, setBlockHourDescription] = useState("");
  const [shouldCreateProject, setShouldCreateProject] = useState(true);
  const [fixedPriceInput, setFixedPriceInput] = useState<string>("");
  const [showPMWizard, setShowPMWizard] = useState(false);
  const [blockHoursInput, setBlockHoursInput] = useState<string>("");
  const [blockDollarsInput, setBlockDollarsInput] = useState<string>("");
  const [blockDescriptionInput, setBlockDescriptionInput] = useState<string>("");
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [editingEpicName, setEditingEpicName] = useState<string>("");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState<string>("");
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

  const assignableUsers = users.filter((u: any) => u.isAssignable && u.isActive);

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
      const matchesUnresourced = !filterUnresourced || (!item.assignedUserId && !item.roleId);
      const matchesResource = filterResource === "all" || 
        (filterResource === "unassigned" && !item.assignedUserId && !item.roleId) ||
        (filterResource !== "unassigned" && item.resourceName === filterResource);
      
      return matchesText && matchesEpic && matchesStage && matchesWorkstream && matchesWeek && matchesUnresourced && matchesResource;
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
      toast({ title: "Epic created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create epic", 
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
      toast({ title: "Stage created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create stage", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const updateEpicMutation = useMutation({
    mutationFn: async ({ epicId, name }: { epicId: string; name: string }) => {
      return apiRequest(`/api/estimates/${id}/epics/${epicId}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
      // Also refresh line items since they may display epic names
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: "Epic updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update epic", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ stageId, name }: { stageId: string; name: string }) => {
      return apiRequest(`/api/estimates/${id}/stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      // Also refresh line items since they may display stage names
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      toast({ title: "Stage updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update stage", 
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
      toast({ title: "Stage deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete stage", 
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
      toast({ title: "Stages merged successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to merge stages", 
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
      setEditingField(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
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
    mutationFn: async ({ createProject, blockHourDescription }: { createProject: boolean; blockHourDescription?: string }) => {
      return apiRequest(`/api/estimates/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ createProject, blockHourDescription }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      setShowApprovalDialog(false);
      setBlockHourDescription("");
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

  const calculateAdjustedValues = (baseHours: number, factor: number, rate: number, size: string, complexity: string, confidence: string) => {
    if (!estimate) return { adjustedHours: 0, totalAmount: 0 };
    
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
    
    return { adjustedHours, totalAmount };
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
    
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, factor, rate, newItem.size, newItem.complexity, newItem.confidence
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
      sortOrder: lineItems?.length || 0
    };
    
    createLineItemMutation.mutate(lineItemData);
  };

  // Start editing a specific field
  const startFieldEditing = (item: EstimateLineItem, fieldName: string) => {
    const fieldKey = `${item.id}-${fieldName}`;
    setEditingField(fieldKey);
    setEditingDraft({
      [fieldKey]: item[fieldName as keyof EstimateLineItem] || (fieldName === 'factor' ? 1 : "")
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
    if (['baseHours', 'factor', 'rate'].includes(fieldName)) {
      const baseHours = fieldName === 'baseHours' ? Number(draftValue) : Number(item.baseHours);
      const factor = fieldName === 'factor' ? Number(draftValue) : Number(item.factor) || 1;
      const rate = fieldName === 'rate' ? Number(draftValue) : Number(item.rate);
      
      const { adjustedHours, totalAmount } = calculateAdjustedValues(
        baseHours, factor, rate, item.size, item.complexity, item.confidence
      );
      
      finalData = {
        ...updateData,
        adjustedHours: String(adjustedHours),
        totalAmount: String(totalAmount)
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
    const { adjustedHours, totalAmount } = calculateAdjustedValues(
      baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
    );
    
    // Send numeric fields as strings - backend Zod validation expects strings
    // Convert all numeric fields to strings
    const dataToSend: any = {};
    for (const [key, value] of Object.entries(updatedItem)) {
      if (['baseHours', 'factor', 'rate', 'costRate', 'week', 'adjustedHours', 'totalAmount'].includes(key)) {
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
        totalAmount: String(totalAmount)
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

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result?.toString().split(",")[1];
      try {
        const response = await apiRequest(`/api/estimates/${id}/import-excel`, {
          method: "POST",
          body: JSON.stringify({ file: base64 })
        });
        toast({ title: `Successfully imported ${response.itemsCreated} line items` });
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'line-items'] });
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'epics'] });
        queryClient.invalidateQueries({ queryKey: ['/api/estimates', id, 'stages'] });
      } catch (error) {
        toast({ title: "Failed to import Excel file", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
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
      <div className="container mx-auto py-8 px-4 max-w-7xl">
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
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Back to Draft
                  </Button>
                </>
              )}
              
              {estimate?.status === 'approved' && !estimate?.projectId && (
                <Button 
                  onClick={() => {
                    setShouldCreateProject(true);
                    setShowApprovalDialog(true);
                  }}
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Create Project
                </Button>
              )}
              
              {estimate?.status === 'approved' && estimate?.projectId && (
                <Button 
                  onClick={() => {
                    setLocation(`/projects/${estimate.projectId}`);
                  }}
                  variant="outline"
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  View Project
                </Button>
              )}
            </>
          )}
          
          <Button onClick={handleDownloadTemplate} variant="outline">
            <FileDown className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <Button onClick={handleExportExcel} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="outputs">Quotes</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="factors">Factors</TabsTrigger>
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
            </CardContent>
          </Card>

          {/* Summary by Workstream and Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Summary by Workstream & Stage</CardTitle>
              <CardDescription>Effort and billing breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="workstream">
                <TabsList className="mb-4">
                  <TabsTrigger value="workstream">By Workstream</TabsTrigger>
                  <TabsTrigger value="stage">By Stage</TabsTrigger>
                </TabsList>
                
                <TabsContent value="workstream">
                  {(() => {
                    // Group by workstream
                    const workstreamTotals = lineItems?.reduce((acc: any, item) => {
                      const workstream = item.workstream || "Unassigned";
                      if (!acc[workstream]) {
                        acc[workstream] = { hours: 0, amount: 0, count: 0 };
                      }
                      acc[workstream].hours += Number(item.adjustedHours);
                      acc[workstream].amount += Number(item.totalAmount);
                      acc[workstream].count += 1;
                      return acc;
                    }, {});

                    return (
                      <div className="space-y-3">
                        {Object.entries(workstreamTotals || {}).sort(([a], [b]) => a.localeCompare(b)).map(([workstream, data]: [string, any]) => (
                          <div key={workstream} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{workstream}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6">
                              <span className="text-muted-foreground">{Math.round(data.hours)} hrs</span>
                              <span className="font-semibold">${Math.round(data.amount).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6">
                              <span>{Math.round(totalHours)} hrs</span>
                              <span>${Math.round(totalAmount).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
                
                <TabsContent value="stage">
                  {(() => {
                    // Group by stage
                    const stageTotals = lineItems?.reduce((acc: any, item) => {
                      const stage = item.stageId ? (stages?.find(s => s.id === item.stageId)?.name || "Unassigned") : "Unassigned";
                      if (!acc[stage]) {
                        acc[stage] = { hours: 0, amount: 0, count: 0 };
                      }
                      acc[stage].hours += Number(item.adjustedHours);
                      acc[stage].amount += Number(item.totalAmount);
                      acc[stage].count += 1;
                      return acc;
                    }, {});

                    return (
                      <div className="space-y-3">
                        {Object.entries(stageTotals || {}).sort(([a], [b]) => {
                          if (a === "Unassigned") return 1;
                          if (b === "Unassigned") return -1;
                          return a.localeCompare(b);
                        }).map(([stage, data]: [string, any]) => (
                          <div key={stage} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{stage}</span>
                              <span className="text-sm text-muted-foreground ml-2">({data.count} items)</span>
                            </div>
                            <div className="flex gap-6">
                              <span className="text-muted-foreground">{Math.round(data.hours)} hrs</span>
                              <span className="font-semibold">${Math.round(data.amount).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <div className="flex gap-6">
                              <span>{Math.round(totalHours)} hrs</span>
                              <span>${Math.round(totalAmount).toLocaleString()}</span>
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
                <Button onClick={() => setShowMilestoneDialog(true)} size="sm">
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
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
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

        <TabsContent value="factors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Factor Multipliers</CardTitle>
              <CardDescription>
                Configure the multipliers for size, complexity, and confidence factors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Size</h4>
                  <div className="space-y-1 text-sm">
                    <div>Small: {estimate?.sizeSmallMultiplier || "1.00"}x</div>
                    <div>Medium: {estimate?.sizeMediumMultiplier || "1.05"}x</div>
                    <div>Large: {estimate?.sizeLargeMultiplier || "1.10"}x</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Complexity</h4>
                  <div className="space-y-1 text-sm">
                    <div>Small: {estimate?.complexitySmallMultiplier || "1.00"}x</div>
                    <div>Medium: {estimate?.complexityMediumMultiplier || "1.05"}x</div>
                    <div>Large: {estimate?.complexityLargeMultiplier || "1.10"}x</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Confidence</h4>
                  <div className="space-y-1 text-sm">
                    <div>High: {estimate?.confidenceHighMultiplier || "1.00"}x</div>
                    <div>Medium: {estimate?.confidenceMediumMultiplier || "1.10"}x</div>
                    <div>Low: {estimate?.confidenceLowMultiplier || "1.20"}x</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inputs" className="space-y-6">

          {/* Epic and Stage Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Epics
                  <Button onClick={() => setShowEpicDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Epic
                  </Button>
                </CardTitle>
                <CardDescription>
                  Manage estimate epics to organize your work structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                {epics.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No epics created yet</p>
                ) : (
                  <div className="space-y-2">
                    {epics.map((epic, index) => (
                      <div key={epic.id} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
                        {editingEpicId === epic.id ? (
                          <div className="flex items-center gap-2 flex-1">
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
                              className="h-7 text-sm"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                updateEpicMutation.mutate({ epicId: epic.id, name: editingEpicName });
                                setEditingEpicId(null);
                              }}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingEpicId(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <span 
                              className="font-medium cursor-pointer hover:underline" 
                              onClick={() => {
                                setEditingEpicId(epic.id);
                                setEditingEpicName(epic.name);
                              }}
                              title="Click to edit"
                            >
                              {epic.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingEpicId(epic.id);
                                  setEditingEpicName(epic.name);
                                }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Stages
                  <Button onClick={() => setShowStageDialog(true)} size="sm" disabled={epics.length === 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </Button>
                </CardTitle>
                <CardDescription>
                  Manage stages within epics for detailed project phases
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {epics.length === 0 ? "Create an epic first to add stages" : "No stages created yet"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stages.sort((a, b) => a.name.localeCompare(b.name)).map((stage, index) => {
                      const epic = epics.find(e => e.id === stage.epicId);
                      const lineItemCount = lineItems.filter(item => item.stageId === stage.id).length;
                      return (
                        <div key={stage.id} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
                          {editingStageId === stage.id ? (
                            <div className="flex items-center gap-2 flex-1">
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
                                className="h-7 text-sm flex-1"
                                autoFocus
                              />
                              <span className="text-xs text-muted-foreground">
                                (Epic: {epic?.name || 'Unknown'})
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  updateStageMutation.mutate({ stageId: stage.id, name: editingStageName });
                                  setEditingStageId(null);
                                }}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingStageId(null)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between w-full">
                              <div>
                                <span 
                                  className="font-medium cursor-pointer hover:underline" 
                                  onClick={() => {
                                    setEditingStageId(stage.id);
                                    setEditingStageName(stage.name);
                                  }}
                                  title="Click to edit"
                                >
                                  {stage.name}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  (Epic: {epic?.name || 'Unknown'})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingStageId(stage.id);
                                    setEditingStageName(stage.name);
                                  }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={lineItemCount > 0 || deleteEstimateStageMutation.isPending}
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
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Estimate Inputs</CardTitle>
              <CardDescription>
                Add and manage estimate inputs with factor multipliers and confidence adjustments
              </CardDescription>
            </div>
            {estimate?.estimateType === 'detailed' && estimate?.status === 'draft' && (
              <Button onClick={() => setShowPMWizard(true)} variant="outline" data-testid="button-pm-wizard">
                <Wand2 className="h-4 w-4 mr-2" />
                PM Wizard
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-7 gap-2">
              <div className="flex gap-1">
                <Select
                  value={newItem.epicId}
                  onValueChange={(value) => setNewItem({ ...newItem, epicId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Epic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {epics.filter(epic => epic.id && epic.id !== "").map((epic) => (
                      <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowEpicDialog(true)}
                  title="Add new Epic"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-1">
                <Select
                  value={newItem.stageId}
                  onValueChange={(value) => setNewItem({ ...newItem, stageId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {stages.filter(stage => stage.id && stage.id !== "").map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowStageDialog(true)}
                  title="Add new Stage"
                  disabled={epics.length === 0}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Workstream"
                value={newItem.workstream}
                onChange={(e) => setNewItem({ ...newItem, workstream: e.target.value })}
              />
              <Input
                placeholder="Week #"
                type="number"
                value={newItem.week}
                onChange={(e) => setNewItem({ ...newItem, week: e.target.value })}
              />
              <Input
                placeholder="Hours"
                type="number"
                value={newItem.baseHours}
                onChange={(e) => setNewItem({ ...newItem, baseHours: e.target.value })}
              />
              <Input
                placeholder="Factor"
                type="number"
                value={newItem.factor}
                onChange={(e) => setNewItem({ ...newItem, factor: e.target.value })}
                title="Multiplier (e.g., 4 interviews × 3 hours)"
              />
              <Input
                placeholder="Rate ($)"
                type="number"
                value={newItem.rate}
                onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-6 gap-2">
              <Input
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="col-span-2"
              />
              <Select
                value={newItem.size}
                onValueChange={(value) => setNewItem({ ...newItem, size: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newItem.complexity}
                onValueChange={(value) => setNewItem({ ...newItem, complexity: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Complexity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={newItem.confidence}
              onValueChange={(value) => setNewItem({ ...newItem, confidence: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
              <SelectTrigger>
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
            <Input
              placeholder="Comments (optional)"
              value={newItem.comments}
              onChange={(e) => setNewItem({ ...newItem, comments: e.target.value })}
            />
          </div>
        </div>
          <Button
            onClick={handleAddItem}
            disabled={!newItem.description || !newItem.baseHours || !newItem.rate || createLineItemMutation.isPending}
            className="mb-4"
            variant="default"
            size="default"
          >
            <Plus className="h-4 w-4 mr-2" />
            {createLineItemMutation.isPending ? "Adding..." : "Add Input"}
          </Button>
          {!newItem.description && !newItem.baseHours && !newItem.rate && (
            <p className="text-sm text-muted-foreground mb-2">
              Fill in Description, Hours, and Rate to add a line item
            </p>
          )}

          {/* Filter Controls */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
            <h4 className="font-medium mb-3">Filter Line Items</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="filter-text">Description</Label>
                <Input
                  id="filter-text"
                  placeholder="Search descriptions..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-epic">Epic</Label>
                <Select value={filterEpic} onValueChange={setFilterEpic}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Epics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Epics</SelectItem>
                    <SelectItem value="none">No Epic</SelectItem>
                    {epics.map((epic) => (
                      <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-stage">Stage</Label>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="none">No Stage</SelectItem>
                    {stages.sort((a, b) => a.name.localeCompare(b.name)).map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-workstream">Workstream</Label>
                <Input
                  id="filter-workstream"
                  placeholder="Filter by workstream..."
                  value={filterWorkstream}
                  onChange={(e) => setFilterWorkstream(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-week">Week</Label>
                <Select value={filterWeek} onValueChange={setFilterWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Weeks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Weeks</SelectItem>
                    {(() => {
                      // Include week 0 and all other weeks
                      const weeks = Array.from(new Set(lineItems.map((item: EstimateLineItem) => item.week ?? 0))).sort((a, b) => Number(a) - Number(b));
                      return weeks.map((week) => (
                        <SelectItem key={week} value={week.toString()}>
                          Week {week}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex-1">
                <Label htmlFor="filter-resource">Resource</Label>
                <Select value={filterResource} onValueChange={setFilterResource}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Resources" />
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
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  id="show-resource-summary"
                  checked={showResourceSummary}
                  onChange={(e) => setShowResourceSummary(e.target.checked)}
                />
                <Label htmlFor="show-resource-summary">Show Resource Summary</Label>
              </div>
            </div>
            {(filterText || filterEpic !== "all" || filterStage !== "all" || filterWorkstream || filterWeek !== "all" || filterUnresourced || filterResource !== "all") && (
              <div className="mt-3">
                <Button
                  onClick={() => {
                    setFilterText("");
                    setFilterEpic("all");
                    setFilterStage("all");
                    setFilterWorkstream("");
                    setFilterWeek("all");
                    setFilterUnresourced(false);
                    setFilterResource("all");
                  }}
                  variant="outline"
                  size="sm"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
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
                  <Button onClick={() => setBulkEditDialog(true)} size="sm">
                    Bulk Edit
                  </Button>
                  <Button onClick={() => setApplyUserRatesDialog(true)} size="sm" variant="outline">
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
                    <TableHead className="w-16 px-2 py-2 text-xs bg-white dark:bg-slate-950">Epic</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-xs bg-white dark:bg-slate-950">Stage</TableHead>
                    <TableHead className="w-20 px-2 py-2 text-xs bg-white dark:bg-slate-950">Workstream</TableHead>
                    <TableHead className="w-12 px-2 py-2 text-xs bg-white dark:bg-slate-950">Week</TableHead>
                    <TableHead className="min-w-[180px] px-2 py-2 text-xs bg-white dark:bg-slate-950">Description</TableHead>
                    <TableHead className="w-14 px-2 py-2 text-xs bg-white dark:bg-slate-950">Hours</TableHead>
                    <TableHead className="w-14 px-2 py-2 text-xs bg-white dark:bg-slate-950">Factor</TableHead>
                    <TableHead className="w-20 px-2 py-2 text-xs bg-white dark:bg-slate-950">Resource</TableHead>
                    <TableHead className="w-14 px-2 py-2 text-xs bg-white dark:bg-slate-950">Rate</TableHead>
                    <TableHead className="w-14 px-2 py-2 text-xs bg-white dark:bg-slate-950">Cost</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-xs bg-white dark:bg-slate-950">Adjust</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-xs bg-white dark:bg-slate-950">Adj.Hrs</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-xs bg-white dark:bg-slate-950">Total</TableHead>
                    <TableHead className="w-20 px-2 py-2 text-xs bg-white dark:bg-slate-950">Margin</TableHead>
                    <TableHead className="w-20 px-2 py-2 text-xs bg-white dark:bg-slate-950">Comments</TableHead>
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
                    return (
                    <TableRow key={item.id} className={`${selectedItems.has(item.id) ? "bg-blue-50" : ""} h-10`}>
                      <TableCell>
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
                      <TableCell>{epic?.name || "-"}</TableCell>
                      <TableCell>{stage?.name || "-"}</TableCell>
                      <TableCell>
                        {editingField === `${item.id}-workstream` ? (
                          <Input
                            value={editingDraft[`${item.id}-workstream`] ?? ""}
                            onChange={(e) => updateFieldDraft(item.id, "workstream", e.target.value)}
                            onBlur={() => saveFieldDraft(item, "workstream")}
                            placeholder="Workstream"
                            className="min-w-[120px]"
                            autoFocus
                          />
                        ) : (
                          <div 
                            onClick={() => startFieldEditing(item, "workstream")} 
                            className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                            title="Click to edit workstream"
                          >
                            {item.workstream || "-"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{item.week ?? "0"}</TableCell>
                      <TableCell className="min-w-[200px]">
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
                            {item.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingField === `${item.id}-baseHours` ? (
                          <Input
                            type="number"
                            step="0.1"
                            value={editingDraft[`${item.id}-baseHours`] ?? ""}
                            onChange={(e) => updateFieldDraft(item.id, "baseHours", e.target.value)}
                            onBlur={() => saveFieldDraft(item, "baseHours")}
                            className="w-20"
                            autoFocus
                          />
                        ) : (
                          <div 
                            onClick={() => startFieldEditing(item, "baseHours")} 
                            className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200 text-center w-20"
                            title="Click to edit hours"
                          >
                            {Number(item.baseHours).toFixed(2)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingField === `${item.id}-factor` ? (
                          <Input
                            type="number"
                            step="0.1"
                            value={editingDraft[`${item.id}-factor`] ?? ""}
                            onChange={(e) => updateFieldDraft(item.id, "factor", e.target.value)}
                            onBlur={() => saveFieldDraft(item, "factor")}
                            className="w-20"
                            autoFocus
                          />
                        ) : (
                          <div 
                            onClick={() => startFieldEditing(item, "factor")} 
                            className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200 text-center w-20"
                            title="Click to edit factor"
                          >
                            {Number(item.factor || 1)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select 
                            value={item.assignedUserId || (item.roleId ? `role-${item.roleId}` : "unassigned")} 
                            onValueChange={(value) => {
                              if (value === "unassigned") {
                                // Clear assignment
                                const updatedItem = { 
                                  ...item, 
                                  assignedUserId: null,
                                  roleId: null,
                                  resourceName: "" 
                                };
                                const baseHours = Number(updatedItem.baseHours);
                                const factor = Number(updatedItem.factor) || 1;
                                const rate = Number(updatedItem.rate);
                                const { adjustedHours, totalAmount } = calculateAdjustedValues(
                                  baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
                                );
                                
                                updateLineItemMutation.mutate({
                                  itemId: item.id,
                                  data: {
                                    assignedUserId: null,
                                    roleId: null,
                                    resourceName: "",
                                    adjustedHours: adjustedHours,
                                    totalAmount: totalAmount
                                  }
                                });
                              } else if (value.startsWith("role-")) {
                                // Generic role selected
                                const roleId = value.substring(5);
                                const selectedRole = roles.find((r: any) => r.id === roleId);
                                if (selectedRole) {
                                  const updatedItem = { 
                                    ...item, 
                                    assignedUserId: null,
                                    roleId: selectedRole.id, 
                                    resourceName: selectedRole.name,
                                    rate: selectedRole.defaultRackRate
                                  };
                                  const baseHours = Number(updatedItem.baseHours);
                                  const factor = Number(updatedItem.factor) || 1;
                                  const rate = Number(selectedRole.defaultRackRate);
                                  const { adjustedHours, totalAmount } = calculateAdjustedValues(
                                    baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
                                  );
                                  
                                  updateLineItemMutation.mutate({
                                    itemId: item.id,
                                    data: {
                                      assignedUserId: null,
                                      roleId: selectedRole.id,
                                      resourceName: selectedRole.name,
                                      rate: Number(selectedRole.defaultRackRate),
                                      adjustedHours: adjustedHours,
                                      totalAmount: totalAmount
                                    }
                                  });
                                }
                              } else {
                                // Specific user selected
                                const selectedUser = assignableUsers.find((u: any) => u.id === value);
                                if (selectedUser) {
                                  const updatedItem = { 
                                    ...item, 
                                    assignedUserId: selectedUser.id,
                                    roleId: null,
                                    resourceName: selectedUser.name,
                                    rate: selectedUser.defaultBillingRate,
                                    costRate: selectedUser.defaultCostRate
                                  };
                                  const baseHours = Number(updatedItem.baseHours);
                                  const factor = Number(updatedItem.factor) || 1;
                                  const rate = Number(selectedUser.defaultBillingRate);
                                  const { adjustedHours, totalAmount } = calculateAdjustedValues(
                                    baseHours, factor, rate, updatedItem.size, updatedItem.complexity, updatedItem.confidence
                                  );
                                  
                                  updateLineItemMutation.mutate({
                                    itemId: item.id,
                                    data: {
                                      assignedUserId: selectedUser.id,
                                      roleId: null,
                                      resourceName: selectedUser.name,
                                      rate: Number(selectedUser.defaultBillingRate),
                                      costRate: Number(selectedUser.defaultCostRate),
                                      adjustedHours: adjustedHours,
                                      totalAmount: totalAmount
                                    }
                                  });
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Generic Roles</div>
                              {roles.map((role: any) => (
                                <SelectItem key={`role-${role.id}`} value={`role-${role.id}`}>
                                  {role.name} (Role)
                                </SelectItem>
                              ))}
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Specific Users</div>
                              {assignableUsers.map((member: any) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                      </TableCell>
                      <TableCell>
                        <span className="cursor-pointer">
                          ${Math.round(Number(item.rate))}
                        </span>
                      </TableCell>
                      <TableCell>
                        {canViewCostMargins && item.costRate ? (
                          <span className="text-muted-foreground">
                            ${Math.round(Number(item.costRate))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Select value={item.size} onValueChange={(value) => handleUpdateItem(item, "size", value)}>
                            <SelectTrigger className="w-16 h-7 px-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="small">S</SelectItem>
                              <SelectItem value="medium">M</SelectItem>
                              <SelectItem value="large">L</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={item.complexity} onValueChange={(value) => handleUpdateItem(item, "complexity", value)}>
                            <SelectTrigger className="w-16 h-7 px-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="small">Sim</SelectItem>
                              <SelectItem value="medium">Med</SelectItem>
                              <SelectItem value="large">Cplx</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={item.confidence} onValueChange={(value) => handleUpdateItem(item, "confidence", value)}>
                            <SelectTrigger className="w-16 h-7 px-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">Hi</SelectItem>
                                <SelectItem value="medium">Med</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                              </SelectContent>
                            </Select>
                        </div>
                      </TableCell>
                      <TableCell>{Number(item.adjustedHours).toFixed(2)}</TableCell>
                      <TableCell>${Math.round(Number(item.totalAmount)).toLocaleString()}</TableCell>
                      <TableCell>
                        {canViewCostMargins && item.margin ? (
                          <span className={Number(item.marginPercent) > 0 ? "text-green-600" : "text-red-600"}>
                            ${Math.round(Number(item.margin))} ({Number(item.marginPercent).toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        {editingField === `${item.id}-comments` ? (
                          <Input
                            value={editingDraft[`${item.id}-comments`] ?? ""}
                            onChange={(e) => updateFieldDraft(item.id, "comments", e.target.value)}
                            onBlur={() => saveFieldDraft(item, "comments")}
                            placeholder="Comments"
                            className="min-w-[200px]"
                            autoFocus
                          />
                        ) : (
                          <div 
                            onClick={() => startFieldEditing(item, "comments")} 
                            className="cursor-pointer hover:bg-gray-50 p-1 rounded text-sm"
                            title={item.comments || "Click to add comments"}
                          >
                            {item.comments ? (
                              <span className="truncate block">
                                {item.comments.length > 20 ? `${item.comments.substring(0, 20)}...` : item.comments}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSplittingItem(item);
                              setSplitHours({ first: Math.floor(Number(item.adjustedHours || item.baseHours || 0) / 2).toString(), second: Math.ceil(Number(item.adjustedHours || item.baseHours || 0) / 2).toString() });
                              setShowSplitDialog(true);
                            }}
                            title="Split this line item"
                          >
                            <Split className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLineItemMutation.mutate(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})
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
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                Total Hours: {Math.round(totalHours)}
              </div>
              <div className="text-lg font-semibold">
                Total Amount: ${Math.round(
                  estimate?.blockDollars ? Number(estimate.blockDollars) : 
                  (estimate?.presentedTotal ? Number(estimate.presentedTotal) : totalAmount)
                ).toLocaleString()}
              </div>
              {estimate?.blockDollars && totalAmount > 0 && (
                <div className="text-sm text-muted-foreground">
                  (Line Items Total: ${Math.round(totalAmount).toLocaleString()})
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* Structure Management Tab */}
        <TabsContent value="management" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Epic & Stage Structure Management</CardTitle>
              <CardDescription>
                Manage your estimate structure, identify and merge duplicate stages
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Structure Overview */}
              <div className="space-y-4">
                {epics.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No epics created yet. Add your first epic to get started.
                    <div className="mt-2">
                      <Button onClick={() => setShowEpicDialog(true)} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Epic
                      </Button>
                    </div>
                  </div>
                ) : (
                  epics.map((epic) => {
                    // Get stages for this epic
                    const epicStages = stages.filter(stage => stage.epicId === epic.id);
                    
                    // Detect duplicate stages (same name within epic)
                    const stageNames = epicStages.map(s => s.name.toLowerCase().trim());
                    const duplicateNames = stageNames.filter((name, index) => stageNames.indexOf(name) !== index);
                    
                    return (
                      <div key={epic.id} className="border rounded-lg p-4">
                        {/* Epic Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-lg">{epic.name}</h3>
                            <Badge variant="secondary">
                              {epicStages.length} stage{epicStages.length !== 1 ? 's' : ''}
                            </Badge>
                            {duplicateNames.length > 0 && (
                              <Badge variant="destructive">
                                {duplicateNames.length} duplicate{duplicateNames.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setSelectedEpicForStage(epic.id);
                                setShowStageDialog(true);
                              }}
                              size="sm"
                              variant="outline"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add Stage
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
                                    <span className="font-medium">{stage.name}</span>
                                    <Badge variant={lineItemCount > 0 ? "default" : "outline"}>
                                      {lineItemCount} line item{lineItemCount !== 1 ? 's' : ''}
                                    </Badge>
                                    {isDuplicate && (
                                      <Badge variant="destructive" className="text-xs">
                                        DUPLICATE
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    {isDuplicate && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        disabled={mergeStagesMutation.isPending}
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
                                      >
                                        {mergeStagesMutation.isPending ? "Merging..." : "Merge"}
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={lineItemCount > 0 || deleteEstimateStageMutation.isPending}
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
                                    >
                                      {deleteEstimateStageMutation.isPending ? (
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                    </Button>
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
          <DialogTitle>Create New Epic</DialogTitle>
          <DialogDescription>
            Add a new epic to organize your estimate line items
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
            disabled={!newEpicName.trim() || createEpicMutation.isPending}
          >
            {createEpicMutation.isPending ? "Creating..." : "Create Epic"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Stage Creation Dialog */}
    <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Stage</DialogTitle>
          <DialogDescription>
            Add a new stage to an epic
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
            disabled={!selectedEpicForStage || !newStageName.trim() || createStageMutation.isPending}
          >
            {createStageMutation.isPending ? "Creating..." : "Create Stage"}
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
            disabled={!editingMilestone?.name || (!editingMilestone?.amount && !editingMilestone?.percentage) || !!(editingMilestone?.amount && editingMilestone?.percentage) || updateMilestoneMutation.isPending}
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
              <Label htmlFor="bulk-epic">Epic</Label>
              <Select value={bulkEditData.epicId} onValueChange={(value) => setBulkEditData({...bulkEditData, epicId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Epic</SelectItem>
                  {epics.map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-stage">Stage</Label>
              <Select value={bulkEditData.stageId} onValueChange={(value) => setBulkEditData({...bulkEditData, stageId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Stage</SelectItem>
                  {stages.sort((a, b) => a.name.localeCompare(b.name)).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-workstream">Workstream</Label>
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
              <Label htmlFor="bulk-workstream">Workstream</Label>
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
            disabled={bulkUpdateMutation.isPending || Object.values(bulkEditData).every(v => !v)}
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
            disabled={!selectedUserId || bulkUpdateMutation.isPending}
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
            disabled={!splitHours.first || !splitHours.second || splitLineItemMutation.isPending}
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
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Project will be created with:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• All epics, stages, and activities from this estimate</li>
                <li>• Rate overrides from resource allocations</li>
                <li>• Time tracking phase templates</li>
                <li>• Budget: {estimate?.presentedTotal || estimate?.totalFees || estimate?.blockDollars || '0'}</li>
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setShowApprovalDialog(false);
              setBlockHourDescription("");
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              approveEstimateMutation.mutate({ 
                createProject: shouldCreateProject,
                blockHourDescription: blockHourDescription || undefined
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