import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { 
  ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Clock, 
  DollarSign, Users, Calendar, CheckCircle, AlertCircle, Activity,
  Target, Zap, Briefcase, FileText, Plus, Edit, Trash2, ExternalLink,
  Check, X, FileCheck, Lock, Filter
} from "lucide-react";
import { TimeEntryManagementDialog } from "@/components/time-entry-management-dialog";
import { format, startOfMonth, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProjectAnalytics {
  project: any;
  monthlyMetrics: {
    month: string;
    billableHours: number;
    nonBillableHours: number;
    revenue: number;
    expenseAmount: number;
  }[];
  burnRate: {
    totalBudget: number;
    consumedBudget: number;
    burnRatePercentage: number;
    estimatedHours: number;
    actualHours: number;
    hoursVariance: number;
    projectedCompletion: Date | null;
  };
  teamHours: {
    personId: string;
    personName: string;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    revenue: number;
  }[];
}

interface Sow {
  id: string;
  projectId: string;
  type: "initial" | "change_order";
  name: string;
  description?: string;
  value: string;
  hours?: string;
  documentUrl?: string;
  documentName?: string;
  signedDate?: string;
  effectiveDate: string;
  expirationDate?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const sowFormSchema = z.object({
  type: z.enum(["initial", "change_order"]),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  value: z.string().min(1, "Value is required"),
  hours: z.string().optional(),
  documentUrl: z.string().url().optional().or(z.literal("")),
  documentName: z.string().optional(),
  signedDate: z.string().optional(),
  effectiveDate: z.string().min(1, "Effective date is required"),
  expirationDate: z.string().optional(),
  status: z.enum(["draft", "pending", "approved", "rejected", "expired"]),
  notes: z.string().optional()
});

type SowFormData = z.infer<typeof sowFormSchema>;

// Milestone schema
const milestoneFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetHours: z.string().optional(),
  status: z.enum(["not-started", "in-progress", "completed"]),
  projectEpicId: z.string().min(1, "Epic is required"),
  order: z.number().int().default(0)
});

type MilestoneFormData = z.infer<typeof milestoneFormSchema>;

// Workstream schema
const workstreamFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  budgetHours: z.string().optional(),
  order: z.number().int().default(0)
});

type WorkstreamFormData = z.infer<typeof workstreamFormSchema>;

// Epic schema
const epicFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  order: z.number().int().default(0)
});

type EpicFormData = z.infer<typeof epicFormSchema>;

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [showSowDialog, setShowSowDialog] = useState(false);
  const [editingSow, setEditingSow] = useState<Sow | null>(null);
  const [deletingSowId, setDeletingSowId] = useState<string | null>(null);
  
  // Milestone state
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any>(null);
  const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);
  
  // Workstream state
  const [showWorkstreamDialog, setShowWorkstreamDialog] = useState(false);
  const [editingWorkstream, setEditingWorkstream] = useState<any>(null);
  const [deletingWorkstreamId, setDeletingWorkstreamId] = useState<string | null>(null);
  
  // Epic state
  const [showEpicDialog, setShowEpicDialog] = useState(false);
  const [editingEpic, setEditingEpic] = useState<any>(null);
  const [deletingEpicId, setDeletingEpicId] = useState<string | null>(null);
  
  // Time entries state
  const [timeGrouping, setTimeGrouping] = useState<"none" | "month" | "workstream" | "stage">("none");
  const [timeFilters, setTimeFilters] = useState({
    startDate: "",
    endDate: "",
    personId: "all",
    billableFilter: "all" as "all" | "billable" | "non-billable"
  });
  const [selectedTimeEntry, setSelectedTimeEntry] = useState<any>(null);
  const [timeEntryDialogOpen, setTimeEntryDialogOpen] = useState(false);
  const [timeEntryToDelete, setTimeEntryToDelete] = useState<any>(null);
  const [deleteTimeEntryDialogOpen, setDeleteTimeEntryDialogOpen] = useState(false);
  
  const { toast } = useToast();
  
  // Check if user can view Time tab
  const canViewTime = user ? ['admin', 'billing-admin', 'pm', 'executive'].includes(user.role) : false;
  
  // Check if user can manage time entries
  const canManageTimeEntries = user ? ['admin', 'billing-admin'].includes(user.role) : false;

  const { data: analytics, isLoading } = useQuery<ProjectAnalytics>({
    queryKey: [`/api/projects/${id}/analytics`],
    enabled: !!id,
  });

  // Check if user can manage time entries for this project (after analytics is loaded)
  const canManageProjectTimeEntries = user ? (
    ['admin', 'billing-admin'].includes(user.role) ||
    (user.role === 'pm' && analytics?.project?.pm === user.id)
  ) : false;

  const { data: sows = [], refetch: refetchSows } = useQuery<Sow[]>({
    queryKey: [`/api/projects/${id}/sows`],
    enabled: !!id,
  });

  const { data: estimates = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/estimates`],
    enabled: !!id,
  });
  
  // Project structure queries
  const { data: milestones = [], refetch: refetchMilestones } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/milestones`],
    enabled: !!id,
  });
  
  const { data: workstreams = [], refetch: refetchWorkstreams } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/workstreams`],
    enabled: !!id,
  });
  
  const { data: epics = [], refetch: refetchEpics } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/epics`],
    enabled: !!id,
  });
  
  // Time entries query - fetch time entries for this project
  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<any[]>({
    queryKey: [`/api/time-entries?projectId=${id}`],
    enabled: !!id && canViewTime,
  });
  
  // Processed time entries with filtering and grouping
  const processedTimeEntries = useMemo(() => {
    if (!timeEntries || timeEntries.length === 0) return { groups: [], summary: null };
    
    // Validate and clean time entries data
    const validEntries = timeEntries.filter(entry => {
      // Check if entry has valid date
      if (!entry.date || typeof entry.date !== 'string') return false;
      // Check if date is valid ISO format
      try {
        const testDate = parseISO(entry.date);
        return !isNaN(testDate.getTime());
      } catch {
        return false;
      }
    }).map(entry => ({
      ...entry,
      hours: Number(entry.hours || 0),
      billingRate: Number(entry.billingRate || 0),
      costRate: Number(entry.costRate || 0),
      isBillable: Boolean(entry.isBillable || entry.billable),
      isLocked: Boolean(entry.isLocked || entry.locked)
    }));
    
    // Apply filters
    let filtered = [...validEntries];
    
    if (timeFilters.startDate) {
      filtered = filtered.filter(entry => entry.date >= timeFilters.startDate);
    }
    
    if (timeFilters.endDate) {
      filtered = filtered.filter(entry => entry.date <= timeFilters.endDate);
    }
    
    if (timeFilters.personId && timeFilters.personId !== "all") {
      filtered = filtered.filter(entry => entry.personId === timeFilters.personId);
    }
    
    if (timeFilters.billableFilter !== "all") {
      const isBillable = timeFilters.billableFilter === "billable";
      filtered = filtered.filter(entry => entry.isBillable === isBillable);
    }
    
    // Calculate summary
    const summary = {
      totalHours: filtered.reduce((sum, entry) => sum + entry.hours, 0),
      billableHours: filtered.filter(e => e.isBillable).reduce((sum, entry) => sum + entry.hours, 0),
      nonBillableHours: filtered.filter(e => !e.isBillable).reduce((sum, entry) => sum + entry.hours, 0),
      totalRevenue: filtered.filter(e => e.isBillable).reduce((sum, entry) => sum + (entry.hours * entry.billingRate), 0),
      lockedCount: filtered.filter(e => e.isLocked).length,
      unlockedCount: filtered.filter(e => !e.isLocked).length,
      dateRange: filtered.length > 0 ? {
        start: filtered.reduce((min, e) => e.date < min ? e.date : min, filtered[0].date),
        end: filtered.reduce((max, e) => e.date > max ? e.date : max, filtered[0].date)
      } : null
    };
    
    // Group entries
    let groups: any[] = [];
    
    if (timeGrouping === "none") {
      groups = [{
        name: "All Entries",
        entries: filtered.sort((a, b) => b.date.localeCompare(a.date))
      }];
    } else if (timeGrouping === "month") {
      const monthMap = new Map<string, any[]>();
      filtered.forEach(entry => {
        try {
          const monthKey = format(startOfMonth(parseISO(entry.date)), "MMMM yyyy");
          if (!monthMap.has(monthKey)) {
            monthMap.set(monthKey, []);
          }
          monthMap.get(monthKey)!.push(entry);
        } catch (error) {
          console.warn('Invalid date in entry:', entry.date);
        }
      });
      
      groups = Array.from(monthMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, entries]) => ({
          name: month,
          entries: entries.sort((a, b) => b.date.localeCompare(a.date))
        }));
    } else if (timeGrouping === "workstream") {
      const workstreamMap = new Map<string, any[]>();
      filtered.forEach(entry => {
        const workstream = entry.workstream || "No Workstream";
        if (!workstreamMap.has(workstream)) {
          workstreamMap.set(workstream, []);
        }
        workstreamMap.get(workstream)!.push(entry);
      });
      
      groups = Array.from(workstreamMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([workstream, entries]) => ({
          name: workstream,
          entries: entries.sort((a, b) => b.date.localeCompare(a.date))
        }));
    } else if (timeGrouping === "stage") {
      const stageMap = new Map<string, any[]>();
      filtered.forEach(entry => {
        const stage = entry.stage || "No Stage";
        if (!stageMap.has(stage)) {
          stageMap.set(stage, []);
        }
        stageMap.get(stage)!.push(entry);
      });
      
      groups = Array.from(stageMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([stage, entries]) => ({
          name: stage,
          entries: entries.sort((a, b) => b.date.localeCompare(a.date))
        }));
    }
    
    // Add group summaries
    groups = groups.map(group => ({
      ...group,
      summary: {
        totalHours: group.entries.reduce((sum: number, entry: any) => sum + entry.hours, 0),
        billableHours: group.entries.filter((e: any) => e.isBillable).reduce((sum: number, entry: any) => sum + entry.hours, 0),
        nonBillableHours: group.entries.filter((e: any) => !e.isBillable).reduce((sum: number, entry: any) => sum + entry.hours, 0),
        revenue: group.entries.filter((e: any) => e.isBillable).reduce((sum: number, entry: any) => sum + (entry.hours * entry.billingRate), 0)
      }
    }));
    
    return { groups, summary };
  }, [timeEntries, timeGrouping, timeFilters]);
  
  // Get unique people from time entries
  const uniquePeople = useMemo(() => {
    const peopleMap = new Map<string, string>();
    timeEntries.forEach((entry: any) => {
      if (entry.personId && entry.personName) {
        peopleMap.set(entry.personId, entry.personName);
      }
    });
    return Array.from(peopleMap.entries()).map(([id, name]) => ({ id, name }));
  }, [timeEntries]);

  const sowForm = useForm<SowFormData>({
    resolver: zodResolver(sowFormSchema),
    defaultValues: {
      type: "initial",
      name: "",
      description: "",
      value: "",
      hours: "",
      documentUrl: "",
      documentName: "",
      signedDate: "",
      effectiveDate: new Date().toISOString().split('T')[0],
      expirationDate: "",
      status: "draft",
      notes: ""
    }
  });
  
  const milestoneForm = useForm<MilestoneFormData>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      budgetHours: "",
      status: "not-started",
      projectEpicId: "",
      order: 0
    }
  });
  
  const workstreamForm = useForm<WorkstreamFormData>({
    resolver: zodResolver(workstreamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      budgetHours: "",
      order: 0
    }
  });
  
  const epicForm = useForm<EpicFormData>({
    resolver: zodResolver(epicFormSchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0
    }
  });

  const createSowMutation = useMutation({
    mutationFn: async (data: SowFormData) => {
      // Convert empty date strings to null
      const processedData = {
        ...data,
        signedDate: data.signedDate || null,
        expirationDate: data.expirationDate || null,
        documentUrl: data.documentUrl || null,
        documentName: data.documentName || null,
        description: data.description || null,
        hours: data.hours || null,
        notes: data.notes || null
      };
      
      return apiRequest(`/api/projects/${id}/sows`, {
        method: "POST",
        body: JSON.stringify(processedData)
      });
    },
    onSuccess: () => {
      toast({
        title: "SOW created",
        description: "The SOW has been created successfully."
      });
      setShowSowDialog(false);
      sowForm.reset();
      refetchSows();
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/analytics`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create SOW",
        variant: "destructive"
      });
    }
  });

  const updateSowMutation = useMutation({
    mutationFn: async ({ id: sowId, data }: { id: string; data: SowFormData }) => {
      // Convert empty date strings to null
      const processedData = {
        ...data,
        signedDate: data.signedDate || null,
        expirationDate: data.expirationDate || null,
        documentUrl: data.documentUrl || null,
        documentName: data.documentName || null,
        description: data.description || null,
        hours: data.hours || null,
        notes: data.notes || null
      };
      
      return apiRequest(`/api/sows/${sowId}`, {
        method: "PATCH",
        body: JSON.stringify(processedData)
      });
    },
    onSuccess: () => {
      toast({
        title: "SOW updated",
        description: "The SOW has been updated successfully."
      });
      setShowSowDialog(false);
      setEditingSow(null);
      sowForm.reset();
      refetchSows();
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/analytics`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update SOW",
        variant: "destructive"
      });
    }
  });

  const deleteSowMutation = useMutation({
    mutationFn: async (sowId: string) => {
      return apiRequest(`/api/sows/${sowId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "SOW deleted",
        description: "The SOW has been deleted successfully."
      });
      setDeletingSowId(null);
      refetchSows();
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/analytics`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete SOW",
        variant: "destructive"
      });
    }
  });

  // Milestone mutations
  const createMilestoneMutation = useMutation({
    mutationFn: async (data: MilestoneFormData) => {
      return apiRequest(`/api/projects/${id}/milestones`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Milestone created",
        description: "The milestone has been created successfully."
      });
      setShowMilestoneDialog(false);
      milestoneForm.reset();
      refetchMilestones();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create milestone",
        variant: "destructive"
      });
    }
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async ({ id: milestoneId, data }: { id: string; data: MilestoneFormData }) => {
      return apiRequest(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Milestone updated",
        description: "The milestone has been updated successfully."
      });
      setShowMilestoneDialog(false);
      setEditingMilestone(null);
      milestoneForm.reset();
      refetchMilestones();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update milestone",
        variant: "destructive"
      });
    }
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      return apiRequest(`/api/milestones/${milestoneId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Milestone deleted",
        description: "The milestone has been deleted successfully."
      });
      setDeletingMilestoneId(null);
      refetchMilestones();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete milestone",
        variant: "destructive"
      });
    }
  });

  // Workstream mutations
  const createWorkstreamMutation = useMutation({
    mutationFn: async (data: WorkstreamFormData) => {
      return apiRequest(`/api/projects/${id}/workstreams`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Workstream created",
        description: "The workstream has been created successfully."
      });
      setShowWorkstreamDialog(false);
      workstreamForm.reset();
      refetchWorkstreams();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create workstream",
        variant: "destructive"
      });
    }
  });

  const updateWorkstreamMutation = useMutation({
    mutationFn: async ({ id: workstreamId, data }: { id: string; data: WorkstreamFormData }) => {
      return apiRequest(`/api/workstreams/${workstreamId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Workstream updated",
        description: "The workstream has been updated successfully."
      });
      setShowWorkstreamDialog(false);
      setEditingWorkstream(null);
      workstreamForm.reset();
      refetchWorkstreams();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update workstream",
        variant: "destructive"
      });
    }
  });

  const deleteWorkstreamMutation = useMutation({
    mutationFn: async (workstreamId: string) => {
      return apiRequest(`/api/workstreams/${workstreamId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Workstream deleted",
        description: "The workstream has been deleted successfully."
      });
      setDeletingWorkstreamId(null);
      refetchWorkstreams();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete workstream",
        variant: "destructive"
      });
    }
  });

  // Epic mutations
  const createEpicMutation = useMutation({
    mutationFn: async (data: EpicFormData) => {
      return apiRequest(`/api/projects/${id}/epics`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Epic created",
        description: "The epic has been created successfully."
      });
      setShowEpicDialog(false);
      epicForm.reset();
      refetchEpics();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create epic",
        variant: "destructive"
      });
    }
  });

  const updateEpicMutation = useMutation({
    mutationFn: async ({ id: epicId, data }: { id: string; data: EpicFormData }) => {
      return apiRequest(`/api/epics/${epicId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Epic updated",
        description: "The epic has been updated successfully."
      });
      setShowEpicDialog(false);
      setEditingEpic(null);
      epicForm.reset();
      refetchEpics();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update epic",
        variant: "destructive"
      });
    }
  });

  const deleteEpicMutation = useMutation({
    mutationFn: async (epicId: string) => {
      return apiRequest(`/api/epics/${epicId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Epic deleted",
        description: "The epic has been deleted successfully."
      });
      setDeletingEpicId(null);
      refetchEpics();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete epic",
        variant: "destructive"
      });
    }
  });

  const approveSowMutation = useMutation({
    mutationFn: async (sowId: string) => {
      return apiRequest(`/api/sows/${sowId}/approve`, {
        method: "POST"
      });
    },
    onSuccess: () => {
      toast({
        title: "SOW approved",
        description: "The SOW has been approved successfully."
      });
      refetchSows();
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/analytics`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve SOW",
        variant: "destructive"
      });
    }
  });

  // Time entry mutations
  const deleteTimeEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return apiRequest(`/api/time-entries/${entryId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Time entry deleted",
        description: "The time entry has been deleted successfully."
      });
      setDeleteTimeEntryDialogOpen(false);
      setTimeEntryToDelete(null);
      queryClient.invalidateQueries({ queryKey: [`/api/time-entries?projectId=${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/analytics`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete time entry",
        variant: "destructive"
      });
    }
  });

  const handleOpenSowDialog = (sow?: Sow) => {
    if (sow) {
      setEditingSow(sow);
      sowForm.reset({
        type: sow.type,
        name: sow.name,
        description: sow.description || "",
        value: sow.value,
        hours: sow.hours || "",
        documentUrl: sow.documentUrl || "",
        documentName: sow.documentName || "",
        signedDate: sow.signedDate || "",
        effectiveDate: sow.effectiveDate,
        expirationDate: sow.expirationDate || "",
        status: sow.status,
        notes: sow.notes || ""
      });
    } else {
      setEditingSow(null);
      sowForm.reset();
    }
    setShowSowDialog(true);
  };

  const handleSubmitSow = (data: SowFormData) => {
    if (editingSow) {
      updateSowMutation.mutate({ id: editingSow.id, data });
    } else {
      createSowMutation.mutate(data);
    }
  };

  const handleSubmitMilestone = (data: MilestoneFormData) => {
    if (editingMilestone) {
      updateMilestoneMutation.mutate({ id: editingMilestone.id, data });
    } else {
      createMilestoneMutation.mutate(data);
    }
  };

  const handleSubmitWorkstream = (data: WorkstreamFormData) => {
    if (editingWorkstream) {
      updateWorkstreamMutation.mutate({ id: editingWorkstream.id, data });
    } else {
      createWorkstreamMutation.mutate(data);
    }
  };

  const handleSubmitEpic = (data: EpicFormData) => {
    if (editingEpic) {
      updateEpicMutation.mutate({ id: editingEpic.id, data });
    } else {
      createEpicMutation.mutate(data);
    }
  };

  const calculateTotalBudget = () => {
    return sows
      .filter(sow => sow.status === "approved")
      .reduce((total, sow) => total + parseFloat(sow.value || "0"), 0);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "approved": return "default";
      case "pending": return "secondary";
      case "rejected": return "destructive";
      case "expired": return "outline";
      default: return "outline";
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!analytics) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold">Project not found</h2>
          <Link href="/projects">
            <Button className="mt-4" data-testid="button-back-to-projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const { project, monthlyMetrics, burnRate, teamHours } = analytics;

  // Calculate project health status
  const getProjectHealth = () => {
    if (burnRate.burnRatePercentage > 100) return { status: "critical", color: "bg-red-500", icon: AlertCircle };
    if (burnRate.burnRatePercentage > 80) return { status: "warning", color: "bg-yellow-500", icon: AlertTriangle };
    return { status: "healthy", color: "bg-green-500", icon: CheckCircle };
  };

  const health = getProjectHealth();

  // Format monthly data for charts
  const monthlyChartData = monthlyMetrics.map(m => ({
    ...m,
    month: format(new Date(m.month + "-01"), "MMM yyyy"),
    totalHours: m.billableHours + m.nonBillableHours,
    efficiency: m.billableHours > 0 ? ((m.billableHours / (m.billableHours + m.nonBillableHours)) * 100).toFixed(1) : 0
  }));

  // Calculate cumulative burn
  let cumulativeRevenue = 0;
  const cumulativeBurnData = monthlyMetrics.map(m => {
    cumulativeRevenue += m.revenue + m.expenseAmount;
    return {
      month: format(new Date(m.month + "-01"), "MMM yyyy"),
      cumulative: cumulativeRevenue,
      budget: burnRate.totalBudget,
      projected: burnRate.totalBudget * (cumulativeRevenue / burnRate.consumedBudget)
    };
  });

  // Team hours chart data
  const teamChartData = teamHours.map(t => ({
    name: t.personName.split(' ')[0], // First name only for chart
    billable: t.billableHours,
    nonBillable: t.nonBillableHours,
    total: t.totalHours
  })).slice(0, 10); // Top 10 contributors

  // Gauge chart data for burn rate
  const gaugeData = [
    { name: "Consumed", value: burnRate.burnRatePercentage, fill: health.color },
    { name: "Remaining", value: Math.max(0, 100 - burnRate.burnRatePercentage), fill: "#e5e7eb" }
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/projects">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h2 className="text-3xl font-bold" data-testid="project-name">{project.name}</h2>
              <Badge variant={project.status === "active" ? "default" : "secondary"} data-testid="project-status">
                {project.status}
              </Badge>
            </div>
            <p className="text-muted-foreground" data-testid="client-name">
              {project.client.name} • {project.type}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${health.color} text-white`} data-testid="health-status">
              <health.icon className="w-3 h-3 mr-1" />
              {health.status}
            </Badge>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Budget Used</p>
                  <p className="text-2xl font-bold" data-testid="budget-percentage">
                    {burnRate.burnRatePercentage.toFixed(1)}%
                  </p>
                </div>
                <Target className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
              <Progress value={burnRate.burnRatePercentage} className="mt-3" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Budget</p>
                  <p className="text-2xl font-bold" data-testid="total-budget">
                    ${(burnRate.totalBudget || 0).toLocaleString()}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hours Used</p>
                  <p className="text-2xl font-bold" data-testid="hours-used">
                    {burnRate.actualHours.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    of {burnRate.estimatedHours.toFixed(0)}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hours Variance</p>
                  <p className={`text-2xl font-bold ${burnRate.hoursVariance > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="hours-variance">
                    {burnRate.hoursVariance > 0 ? '+' : ''}{burnRate.hoursVariance.toFixed(0)}
                  </p>
                </div>
                {burnRate.hoursVariance > 0 ? (
                  <TrendingUp className="w-8 h-8 text-red-600 opacity-50" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-green-600 opacity-50" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Team Size</p>
                  <p className="text-2xl font-bold" data-testid="team-size">{teamHours.length}</p>
                  <p className="text-xs text-muted-foreground">contributors</p>
                </div>
                <Users className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {burnRate.burnRatePercentage > 80 && (
          <Alert variant={burnRate.burnRatePercentage > 100 ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Budget Alert</AlertTitle>
            <AlertDescription>
              {burnRate.burnRatePercentage > 100 
                ? `Project is ${(burnRate.burnRatePercentage - 100).toFixed(1)}% over budget. Immediate action required.`
                : `Project has consumed ${burnRate.burnRatePercentage.toFixed(1)}% of budget. Monitor closely.`
              }
            </AlertDescription>
          </Alert>
        )}

        {burnRate.projectedCompletion && (
          <Alert>
            <Calendar className="h-4 w-4" />
            <AlertTitle>Projected Completion</AlertTitle>
            <AlertDescription>
              Based on current burn rate, the project is estimated to complete on{" "}
              {format(new Date(burnRate.projectedCompletion), "MMMM d, yyyy")}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly">Monthly Trends</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">Team Performance</TabsTrigger>
            <TabsTrigger value="burndown" data-testid="tab-burndown">Burn Rate</TabsTrigger>
            <TabsTrigger value="sows" data-testid="tab-sows">SOWs & Change Orders</TabsTrigger>
            <TabsTrigger value="milestones" data-testid="tab-milestones">Milestones</TabsTrigger>
            <TabsTrigger value="workstreams" data-testid="tab-workstreams">Workstreams</TabsTrigger>
            {canViewTime && (
              <TabsTrigger value="time" data-testid="tab-time">Time</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hours Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Hours Distribution</CardTitle>
                  <CardDescription>Billable vs Non-billable hours breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Billable", value: teamHours.reduce((sum, t) => sum + t.billableHours, 0) },
                          { name: "Non-billable", value: teamHours.reduce((sum, t) => sum + t.nonBillableHours, 0) }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="hsl(var(--primary))" />
                        <Cell fill="hsl(var(--muted))" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Budget Gauge */}
              <Card>
                <CardHeader>
                  <CardTitle>Budget Consumption</CardTitle>
                  <CardDescription>Current budget utilization</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={gaugeData}
                        cx="50%"
                        cy="50%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={60}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {gaugeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center -mt-32">
                    <p className="text-4xl font-bold">{burnRate.burnRatePercentage.toFixed(0)}%</p>
                    <p className="text-sm text-muted-foreground">of budget consumed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Estimates Section */}
            {estimates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Related Estimates</CardTitle>
                  <CardDescription>View estimates associated with this project</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {estimates.map((estimate) => (
                      <div key={estimate.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium">{estimate.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Version {estimate.version} • {estimate.status} • ${Number(estimate.totalFees || 0).toLocaleString()}
                          </p>
                        </div>
                        <Link href={`/estimates/${estimate.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-view-estimate-${estimate.id}`}>
                            <ExternalLink className="w-4 h-4 mr-1" />
                            View Estimate
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Project Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-semibold">
                      ${monthlyMetrics.reduce((sum, m) => sum + m.revenue, 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-xl font-semibold">
                      ${monthlyMetrics.reduce((sum, m) => sum + m.expenseAmount, 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Monthly Burn</p>
                    <p className="text-xl font-semibold">
                      ${monthlyMetrics.length > 0 
                        ? (burnRate.consumedBudget / monthlyMetrics.length).toLocaleString()
                        : '0'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Efficiency Rate</p>
                    <p className="text-xl font-semibold">
                      {teamHours.length > 0 
                        ? ((teamHours.reduce((sum, t) => sum + t.billableHours, 0) / 
                           teamHours.reduce((sum, t) => sum + t.totalHours, 0)) * 100).toFixed(1)
                        : '0'
                      }%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-6">
            {/* Monthly Hours Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Monthly Hours Breakdown</CardTitle>
                <CardDescription>Billable vs non-billable hours by month</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="billableHours" name="Billable Hours" fill="hsl(var(--primary))" />
                    <Bar dataKey="nonBillableHours" name="Non-billable Hours" fill="hsl(var(--muted))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Revenue & Expenses */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue & Expenses Trend</CardTitle>
                <CardDescription>Monthly financial performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `$${Number(value).toLocaleString()}`} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      name="Revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="expenseAmount" 
                      name="Expenses" 
                      stroke="hsl(var(--destructive))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            {/* Team Hours Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Team Contribution</CardTitle>
                <CardDescription>Hours logged by team members</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={teamChartData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="billable" name="Billable" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="nonBillable" name="Non-billable" stackId="a" fill="hsl(var(--muted))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Team Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Team Performance Details</CardTitle>
                <CardDescription>Individual contribution breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Member</TableHead>
                      <TableHead className="text-right">Billable Hours</TableHead>
                      <TableHead className="text-right">Non-billable Hours</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Efficiency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamHours.map((member) => (
                      <TableRow key={member.personId} data-testid={`team-member-${member.personId}`}>
                        <TableCell className="font-medium">{member.personName}</TableCell>
                        <TableCell className="text-right">{member.billableHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{member.nonBillableHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{member.totalHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">${member.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={member.billableHours / member.totalHours > 0.8 ? "default" : "secondary"}>
                            {((member.billableHours / member.totalHours) * 100).toFixed(0)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="burndown" className="space-y-6">
            {/* Cumulative Burn Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Burn Rate</CardTitle>
                <CardDescription>Cumulative budget consumption over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={cumulativeBurnData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => `$${Number(value).toLocaleString()}`} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="cumulative" 
                      name="Actual Spend" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary))" 
                      fillOpacity={0.6}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="budget" 
                      name="Total Budget" 
                      stroke="hsl(var(--destructive))" 
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Burn Rate Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Burn Rate Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget Allocated</span>
                    <span className="font-semibold">${burnRate.totalBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget Consumed</span>
                    <span className="font-semibold">${burnRate.consumedBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget Remaining</span>
                    <span className="font-semibold">
                      ${Math.max(0, burnRate.totalBudget - burnRate.consumedBudget).toLocaleString()}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Burn Rate</span>
                    <Badge className={health.color}>
                      {burnRate.burnRatePercentage.toFixed(1)}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hours Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Estimated Hours</span>
                    <span className="font-semibold">{burnRate.estimatedHours.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Actual Hours</span>
                    <span className="font-semibold">{burnRate.actualHours.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Hours Remaining</span>
                    <span className="font-semibold">
                      {Math.max(0, burnRate.estimatedHours - burnRate.actualHours).toFixed(0)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Variance</span>
                    <Badge variant={burnRate.hoursVariance > 0 ? "destructive" : "default"}>
                      {burnRate.hoursVariance > 0 ? '+' : ''}{burnRate.hoursVariance.toFixed(0)} hours
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sows" className="space-y-6">
            {/* SOW Summary Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Statements of Work</CardTitle>
                    <CardDescription>Manage project SOWs and change orders</CardDescription>
                  </div>
                  <Button onClick={() => handleOpenSowDialog()} data-testid="button-add-sow">
                    <Plus className="w-4 h-4 mr-2" />
                    Add SOW
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Budget</p>
                          <p className="text-2xl font-bold" data-testid="sow-total-budget">
                            ${calculateTotalBudget().toLocaleString()}
                          </p>
                        </div>
                        <DollarSign className="w-6 h-6 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Active SOWs</p>
                          <p className="text-2xl font-bold" data-testid="sow-active-count">
                            {sows.filter(s => s.status === "approved").length}
                          </p>
                        </div>
                        <FileCheck className="w-6 h-6 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Change Orders</p>
                          <p className="text-2xl font-bold" data-testid="sow-change-order-count">
                            {sows.filter(s => s.type === "change_order").length}
                          </p>
                        </div>
                        <FileText className="w-6 h-6 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* SOWs Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No SOWs found. Click "Add SOW" to create one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sows.map((sow) => (
                        <TableRow key={sow.id} data-testid={`sow-row-${sow.id}`}>
                          <TableCell>
                            <Badge variant={sow.type === "initial" ? "default" : "secondary"}>
                              {sow.type === "initial" ? "Initial" : "Change Order"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{sow.name}</TableCell>
                          <TableCell>${parseFloat(sow.value).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(sow.status)}>
                              {sow.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(sow.effectiveDate), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            {sow.documentUrl ? (
                              <a
                                href={sow.documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                                data-testid={`sow-document-link-${sow.id}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                                {sow.documentName || "View"}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {sow.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveSowMutation.mutate(sow.id)}
                                  data-testid={`button-approve-sow-${sow.id}`}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenSowDialog(sow)}
                                data-testid={`button-edit-sow-${sow.id}`}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeletingSowId(sow.id)}
                                data-testid={`button-delete-sow-${sow.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Milestones Tab */}
          <TabsContent value="milestones" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Project Milestones</CardTitle>
                  <Button
                    onClick={() => {
                      setEditingMilestone(null);
                      milestoneForm.reset();
                      setShowMilestoneDialog(true);
                    }}
                    data-testid="button-add-milestone"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Epic</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Budget Hours</TableHead>
                      <TableHead>Actual Hours</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No milestones found. Click "Add Milestone" to create one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      milestones.map((milestone: any) => (
                        <TableRow key={milestone.id} data-testid={`milestone-row-${milestone.id}`}>
                          <TableCell className="font-medium">{milestone.name}</TableCell>
                          <TableCell>{milestone.epic?.name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={
                              milestone.status === "completed" ? "default" : 
                              milestone.status === "in-progress" ? "secondary" : "outline"
                            }>
                              {milestone.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{milestone.startDate ? format(new Date(milestone.startDate), "MMM d, yyyy") : '-'}</TableCell>
                          <TableCell>{milestone.endDate ? format(new Date(milestone.endDate), "MMM d, yyyy") : '-'}</TableCell>
                          <TableCell>{milestone.budgetHours || '-'}</TableCell>
                          <TableCell>{milestone.actualHours || '0'}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingMilestone(milestone);
                                  milestoneForm.reset({
                                    name: milestone.name,
                                    description: milestone.description || '',
                                    startDate: milestone.startDate || '',
                                    endDate: milestone.endDate || '',
                                    budgetHours: milestone.budgetHours?.toString() || '',
                                    status: milestone.status,
                                    projectEpicId: milestone.projectEpicId,
                                    order: milestone.order
                                  });
                                  setShowMilestoneDialog(true);
                                }}
                                data-testid={`button-edit-milestone-${milestone.id}`}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeletingMilestoneId(milestone.id)}
                                data-testid={`button-delete-milestone-${milestone.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workstreams Tab */}
          <TabsContent value="workstreams" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Project Workstreams</CardTitle>
                  <Button
                    onClick={() => {
                      setEditingWorkstream(null);
                      workstreamForm.reset();
                      setShowWorkstreamDialog(true);
                    }}
                    data-testid="button-add-workstream"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Workstream
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Budget Hours</TableHead>
                      <TableHead>Actual Hours</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workstreams.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No workstreams found. Click "Add Workstream" to create one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      workstreams.map((workstream: any) => {
                        const variance = (workstream.budgetHours || 0) - (workstream.actualHours || 0);
                        return (
                          <TableRow key={workstream.id} data-testid={`workstream-row-${workstream.id}`}>
                            <TableCell className="font-medium">{workstream.name}</TableCell>
                            <TableCell>{workstream.description || '-'}</TableCell>
                            <TableCell>{workstream.budgetHours || '-'}</TableCell>
                            <TableCell>{workstream.actualHours || '0'}</TableCell>
                            <TableCell>
                              {workstream.budgetHours ? (
                                <span className={variance < 0 ? "text-destructive" : "text-green-600"}>
                                  {variance > 0 ? '+' : ''}{variance.toFixed(1)}h
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingWorkstream(workstream);
                                    workstreamForm.reset({
                                      name: workstream.name,
                                      description: workstream.description || '',
                                      budgetHours: workstream.budgetHours?.toString() || '',
                                      order: workstream.order
                                    });
                                    setShowWorkstreamDialog(true);
                                  }}
                                  data-testid={`button-edit-workstream-${workstream.id}`}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeletingWorkstreamId(workstream.id)}
                                  data-testid={`button-delete-workstream-${workstream.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Time Tab */}
          {canViewTime && (
            <TabsContent value="time" className="space-y-6">
              {/* Overall Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Time Entries Summary</CardTitle>
                  <CardDescription>
                    Overview of all time entries for this project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timeEntriesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : processedTimeEntries.summary ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Total Hours</p>
                        <p className="text-2xl font-bold">{processedTimeEntries.summary.totalHours.toFixed(1)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Billable / Non-Billable</p>
                        <p className="text-lg font-semibold">
                          <span className="text-green-600">{processedTimeEntries.summary.billableHours.toFixed(1)}</span>
                          {" / "}
                          <span className="text-orange-600">{processedTimeEntries.summary.nonBillableHours.toFixed(1)}</span>
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                        <p className="text-2xl font-bold text-green-600">
                          ${processedTimeEntries.summary.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Locked / Unlocked</p>
                        <p className="text-lg font-semibold">
                          <span className="inline-flex items-center gap-1">
                            <Lock className="w-4 h-4" />
                            {processedTimeEntries.summary.lockedCount}
                          </span>
                          {" / "}
                          <span>{processedTimeEntries.summary.unlockedCount}</span>
                        </p>
                      </div>
                      {processedTimeEntries.summary.dateRange && (
                        <div className="col-span-full pt-2 border-t">
                          <p className="text-sm text-muted-foreground">
                            Date Range: {format(parseISO(processedTimeEntries.summary.dateRange.start), "MMM d, yyyy")} - {format(parseISO(processedTimeEntries.summary.dateRange.end), "MMM d, yyyy")}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No time entries found</p>
                  )}
                </CardContent>
              </Card>

              {/* Filters and Grouping */}
              <Card>
                <CardHeader>
                  <CardTitle>Filters & Grouping</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Grouping Options */}
                  <div className="space-y-3">
                    <Label>Group By</Label>
                    <RadioGroup
                      value={timeGrouping}
                      onValueChange={(value: any) => setTimeGrouping(value)}
                      className="flex flex-wrap gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="none" id="group-none" />
                        <Label htmlFor="group-none" className="cursor-pointer">No Grouping</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="month" id="group-month" />
                        <Label htmlFor="group-month" className="cursor-pointer">By Month</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="workstream" id="group-workstream" />
                        <Label htmlFor="group-workstream" className="cursor-pointer">By Workstream</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="stage" id="group-stage" />
                        <Label htmlFor="group-stage" className="cursor-pointer">By Stage</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="filter-start-date">Start Date</Label>
                      <Input
                        id="filter-start-date"
                        type="date"
                        value={timeFilters.startDate}
                        onChange={(e) => setTimeFilters(prev => ({ ...prev, startDate: e.target.value }))}
                        data-testid="input-filter-start-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="filter-end-date">End Date</Label>
                      <Input
                        id="filter-end-date"
                        type="date"
                        value={timeFilters.endDate}
                        onChange={(e) => setTimeFilters(prev => ({ ...prev, endDate: e.target.value }))}
                        data-testid="input-filter-end-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="filter-person">Person</Label>
                      <Select
                        value={timeFilters.personId}
                        onValueChange={(value) => setTimeFilters(prev => ({ ...prev, personId: value }))}
                      >
                        <SelectTrigger id="filter-person" data-testid="select-filter-person">
                          <SelectValue placeholder="All People" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All People</SelectItem>
                          {uniquePeople.map(person => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="filter-billable">Billable Status</Label>
                      <Select
                        value={timeFilters.billableFilter}
                        onValueChange={(value: any) => setTimeFilters(prev => ({ ...prev, billableFilter: value }))}
                      >
                        <SelectTrigger id="filter-billable" data-testid="select-filter-billable">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Entries</SelectItem>
                          <SelectItem value="billable">Billable Only</SelectItem>
                          <SelectItem value="non-billable">Non-Billable Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(timeFilters.startDate || timeFilters.endDate || (timeFilters.personId && timeFilters.personId !== "all") || timeFilters.billableFilter !== "all") && (
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Filters applied</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTimeFilters({
                          startDate: "",
                          endDate: "",
                          personId: "all",
                          billableFilter: "all"
                        })}
                        data-testid="button-clear-filters"
                      >
                        Clear all
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Time Entries Groups */}
              {timeEntriesLoading ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </CardContent>
                </Card>
              ) : processedTimeEntries.groups.length === 0 ? (
                <Card>
                  <CardContent className="py-16">
                    <div className="text-center space-y-3">
                      <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
                      <h3 className="text-lg font-semibold">No Time Entries</h3>
                      <p className="text-muted-foreground">
                        No time entries found for the selected filters.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {processedTimeEntries.groups.map((group, groupIndex) => (
                    <Card key={groupIndex}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>{group.name}</CardTitle>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">
                              Total: <span className="font-semibold text-foreground">{group.summary.totalHours.toFixed(1)}h</span>
                            </span>
                            <span className="text-muted-foreground">
                              Billable: <span className="font-semibold text-green-600">{group.summary.billableHours.toFixed(1)}h</span>
                            </span>
                            <span className="text-muted-foreground">
                              Non-Billable: <span className="font-semibold text-orange-600">{group.summary.nonBillableHours.toFixed(1)}h</span>
                            </span>
                            {group.summary.revenue > 0 && (
                              <span className="text-muted-foreground">
                                Revenue: <span className="font-semibold text-green-600">
                                  ${group.summary.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Person</TableHead>
                              <TableHead>Hours</TableHead>
                              <TableHead>Description</TableHead>
                              {timeGrouping !== "workstream" && <TableHead>Workstream</TableHead>}
                              {timeGrouping !== "stage" && <TableHead>Stage</TableHead>}
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              {canManageProjectTimeEntries && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.entries.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center text-muted-foreground">
                                  No entries in this group
                                </TableCell>
                              </TableRow>
                            ) : (
                              group.entries.map((entry: any, index: number) => (
                                <TableRow key={entry.id || index} data-testid={`time-entry-${entry.id}`}>
                                  <TableCell>
                                    {format(parseISO(entry.date), "MMM d, yyyy")}
                                  </TableCell>
                                  <TableCell>{entry.personName || "Unknown"}</TableCell>
                                  <TableCell>{entry.hours.toFixed(1)}</TableCell>
                                  <TableCell className="max-w-xs truncate" title={entry.description}>
                                    {entry.description || "-"}
                                  </TableCell>
                                  {timeGrouping !== "workstream" && (
                                    <TableCell>{entry.workstream || "-"}</TableCell>
                                  )}
                                  {timeGrouping !== "stage" && (
                                    <TableCell>{entry.stage || "-"}</TableCell>
                                  )}
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={entry.isBillable ? "default" : "secondary"}>
                                        {entry.isBillable ? "Billable" : "Non-Billable"}
                                      </Badge>
                                      {entry.isLocked && (
                                        <Lock className="w-4 h-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {entry.isBillable && entry.billingRate ? (
                                      <span className="font-medium text-green-600">
                                        ${(entry.hours * entry.billingRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                  {canManageProjectTimeEntries && (
                                    <TableCell className="text-right">
                                      {!entry.isLocked && (
                                        <div className="flex justify-end gap-1">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            onClick={() => {
                                              setSelectedTimeEntry(entry);
                                              setTimeEntryDialogOpen(true);
                                            }}
                                            data-testid={`button-edit-time-entry-${entry.id}`}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => {
                                              setTimeEntryToDelete(entry);
                                              setDeleteTimeEntryDialogOpen(true);
                                            }}
                                            data-testid={`button-delete-time-entry-${entry.id}`}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      )}
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* SOW Dialog */}
        <Dialog open={showSowDialog} onOpenChange={setShowSowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingSow ? "Edit SOW" : "Add New SOW"}
              </DialogTitle>
              <DialogDescription>
                {editingSow 
                  ? "Update the statement of work details." 
                  : "Create a new statement of work or change order for this project."}
              </DialogDescription>
            </DialogHeader>
            <Form {...sowForm}>
              <form onSubmit={sowForm.handleSubmit(handleSubmitSow)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={sowForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sow-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="initial">Initial SOW</SelectItem>
                            <SelectItem value="change_order">Change Order</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={sowForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sow-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={sowForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Initial SOW, Change Order #1" data-testid="input-sow-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={sowForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Description of the work..." data-testid="textarea-sow-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={sowForm.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Value ($)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-sow-value" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={sowForm.control}
                    name="hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hours (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0" data-testid="input-sow-hours" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={sowForm.control}
                    name="effectiveDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-sow-effective-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={sowForm.control}
                    name="signedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signed Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-sow-signed-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={sowForm.control}
                    name="expirationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiration Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-sow-expiration-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={sowForm.control}
                    name="documentUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document URL</FormLabel>
                        <FormControl>
                          <Input {...field} type="url" placeholder="https://..." data-testid="input-sow-document-url" />
                        </FormControl>
                        <FormDescription>Link to the SOW document</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={sowForm.control}
                    name="documentName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="SOW Document.pdf" data-testid="input-sow-document-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={sowForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Additional notes..." data-testid="textarea-sow-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowSowDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createSowMutation.isPending || updateSowMutation.isPending}
                    data-testid="button-submit-sow"
                  >
                    {editingSow ? "Update" : "Create"} SOW
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingSowId} onOpenChange={() => setDeletingSowId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete SOW</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this SOW? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingSowId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingSowId) {
                    deleteSowMutation.mutate(deletingSowId);
                  }
                }}
                disabled={deleteSowMutation.isPending}
                data-testid="button-confirm-delete-sow"
              >
                Delete SOW
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Milestone Dialog */}
        <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingMilestone ? "Edit Milestone" : "Add New Milestone"}
              </DialogTitle>
              <DialogDescription>
                {editingMilestone 
                  ? "Update the milestone details." 
                  : "Create a new milestone for this project."}
              </DialogDescription>
            </DialogHeader>
            <Form {...milestoneForm}>
              <form onSubmit={milestoneForm.handleSubmit(handleSubmitMilestone)} className="space-y-4">
                <FormField
                  control={milestoneForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Phase 1 Completion" data-testid="input-milestone-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={milestoneForm.control}
                  name="projectEpicId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Epic</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-milestone-epic">
                            <SelectValue placeholder="Select an epic" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {epics.map((epic: any) => (
                            <SelectItem key={epic.id} value={epic.id}>
                              {epic.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={milestoneForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Milestone description..." data-testid="textarea-milestone-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={milestoneForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-milestone-start-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={milestoneForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-milestone-end-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={milestoneForm.control}
                    name="budgetHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Budget Hours</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.5" placeholder="0" data-testid="input-milestone-budget-hours" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={milestoneForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-milestone-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="not-started">Not Started</SelectItem>
                            <SelectItem value="in-progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowMilestoneDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMilestoneMutation.isPending || updateMilestoneMutation.isPending}>
                    {editingMilestone ? "Update" : "Create"} Milestone
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Milestone Confirmation Dialog */}
        <Dialog open={!!deletingMilestoneId} onOpenChange={() => setDeletingMilestoneId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Milestone</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this milestone? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingMilestoneId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingMilestoneId) {
                    deleteMilestoneMutation.mutate(deletingMilestoneId);
                  }
                }}
                disabled={deleteMilestoneMutation.isPending}
                data-testid="button-confirm-delete-milestone"
              >
                Delete Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Workstream Dialog */}
        <Dialog open={showWorkstreamDialog} onOpenChange={setShowWorkstreamDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingWorkstream ? "Edit Workstream" : "Add New Workstream"}
              </DialogTitle>
              <DialogDescription>
                {editingWorkstream 
                  ? "Update the workstream details." 
                  : "Create a new workstream for this project."}
              </DialogDescription>
            </DialogHeader>
            <Form {...workstreamForm}>
              <form onSubmit={workstreamForm.handleSubmit(handleSubmitWorkstream)} className="space-y-4">
                <FormField
                  control={workstreamForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Frontend Development" data-testid="input-workstream-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={workstreamForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Workstream description..." data-testid="textarea-workstream-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={workstreamForm.control}
                  name="budgetHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget Hours</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.5" placeholder="0" data-testid="input-workstream-budget-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowWorkstreamDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createWorkstreamMutation.isPending || updateWorkstreamMutation.isPending}>
                    {editingWorkstream ? "Update" : "Create"} Workstream
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Workstream Confirmation Dialog */}
        <Dialog open={!!deletingWorkstreamId} onOpenChange={() => setDeletingWorkstreamId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Workstream</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this workstream? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingWorkstreamId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingWorkstreamId) {
                    deleteWorkstreamMutation.mutate(deletingWorkstreamId);
                  }
                }}
                disabled={deleteWorkstreamMutation.isPending}
                data-testid="button-confirm-delete-workstream"
              >
                Delete Workstream
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Time Entry Management Dialog */}
        <TimeEntryManagementDialog
          isOpen={timeEntryDialogOpen}
          onOpenChange={setTimeEntryDialogOpen}
          timeEntry={selectedTimeEntry}
          projectId={id || ""}
        />

        {/* Delete Time Entry Confirmation Dialog */}
        <AlertDialog open={deleteTimeEntryDialogOpen} onOpenChange={setDeleteTimeEntryDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this time entry?
                {timeEntryToDelete && (
                  <div className="mt-2 text-sm space-y-1">
                    <div><strong>Date:</strong> {format(parseISO(timeEntryToDelete.date), "PPP")}</div>
                    <div><strong>Hours:</strong> {timeEntryToDelete.hours.toFixed(1)}</div>
                    <div><strong>Person:</strong> {timeEntryToDelete.personName || "Unknown"}</div>
                    {timeEntryToDelete.description && (
                      <div><strong>Description:</strong> {timeEntryToDelete.description}</div>
                    )}
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-time-entry">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => timeEntryToDelete && deleteTimeEntryMutation.mutate(timeEntryToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-time-entry"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}