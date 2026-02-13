// v2.1 - Safe date parsing for production stability
import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout/layout";
import { RaiddLogTab } from "@/components/raidd-log-tab";
import { Button } from "@/components/ui/button";

// Error Boundary for catching render errors
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ProjectDetailErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PROJECT_DETAIL_ERROR] Render error caught:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 dark:bg-red-900/20 rounded-lg m-4">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
            Something went wrong loading project details
          </h2>
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium">Error Details (click to expand)</summary>
            <pre className="mt-2 p-4 bg-white dark:bg-gray-800 rounded text-xs overflow-auto max-h-64">
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { ProjectRateOverridesSection } from "@/components/ProjectRateOverridesSection";
import { ProjectRetainerManagement } from "@/components/ProjectRetainerManagement";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  DollarSign, Users, User, Calendar, CheckCircle, AlertCircle, Activity,
  Target, Zap, Briefcase, FileText, Plus, Edit, Trash2, ExternalLink,
  Check, X, FileCheck, Lock, Filter, Download, Upload, Pencil, FolderOpen, Building, UserPlus, Sparkles
} from "lucide-react";
import { TimeEntryManagementDialog } from "@/components/time-entry-management-dialog";
import { PlannerStatusPanel } from "@/components/planner/PlannerStatusPanel";
import { SubSOWGenerator } from "@/components/sub-sow-generator";
import { StatusReportDialog } from "@/components/status-report-dialog";
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
  projectEpicId: z.string().optional(),
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

// Assignment schema  
const assignmentFormSchema = z.object({
  personId: z.string().min(1, "Person is required"),
  roleId: z.string().optional(),
  projectWorkstreamId: z.string().optional(),
  projectEpicId: z.string().optional(),
  projectStageId: z.string().optional(),
  hours: z.string().min(1, "Hours is required"),
  pricingMode: z.enum(["role", "person", "resource_name"]).default("person"), // Auto-determined based on assignment
  rackRate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  taskDescription: z.string().optional(),
  notes: z.string().optional()
});

type AssignmentFormData = z.infer<typeof assignmentFormSchema>;

export default function ProjectDetail() {
  const { id } = useParams();
  const { user, canViewPricing } = useAuth();
  const [location, navigate] = useLocation();
  const searchString = useSearch();
  
  const validTabs = ['overview', 'analytics', 'delivery', 'contracts', 'time', 'invoices', 'raidd'];
  
  const selectedTab = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const tab = params.get('tab');
    return tab && validTabs.includes(tab) ? tab : 'overview';
  }, [searchString]);
  
  // Check for edit parameter to auto-open edit dialog
  const shouldOpenEditDialog = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('edit') === 'true';
  }, [searchString]);
  
  // Check for assignmentId parameter (from Planner task links)
  const highlightedAssignmentId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('assignmentId');
  }, [searchString]);
  
  const handleTabChange = (newTab: string) => {
    const params = new URLSearchParams(searchString);
    if (newTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', newTab);
    }
    const queryString = params.toString();
    navigate(`/projects/${id}${queryString ? `?${queryString}` : ''}`, { replace: true });
  };
  
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
  
  // Assignment state
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importError, setImportError] = useState<string | null>(null);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  
  // Edit project state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);
  
  // Time entries state
  const [timeGrouping, setTimeGrouping] = useState<"none" | "month" | "workstream" | "stage">("none");
  const [timeFilters, setTimeFilters] = useState({
    startDate: "",
    endDate: "",
    personId: "all",
    billableFilter: "all" as "all" | "billable" | "non-billable"
  });
  
  // Team assignments filter state
  const [allocationStatusFilter, setAllocationStatusFilter] = useState<string>('all');
  const [allocationResourceFilter, setAllocationResourceFilter] = useState<string>('all');
  const [allocationStageFilter, setAllocationStageFilter] = useState<string>('all');
  const [selectedTimeEntry, setSelectedTimeEntry] = useState<any>(null);
  const [timeEntryDialogOpen, setTimeEntryDialogOpen] = useState(false);
  const [timeEntryToDelete, setTimeEntryToDelete] = useState<any>(null);
  const [deleteTimeEntryDialogOpen, setDeleteTimeEntryDialogOpen] = useState(false);
  
  // Budget approval confirmation state
  const [approvingSow, setApprovingSow] = useState<Sow | null>(null);
  const [showBudgetImpactDialog, setShowBudgetImpactDialog] = useState(false);
  
  // Payment milestone state
  const [showPaymentMilestoneDialog, setShowPaymentMilestoneDialog] = useState(false);
  const [editingPaymentMilestone, setEditingPaymentMilestone] = useState<any>(null);
  
  // Payment milestone invoice state
  const [generatingInvoiceForMilestone, setGeneratingInvoiceForMilestone] = useState<any>(null);
  const [showMilestoneInvoiceDialog, setShowMilestoneInvoiceDialog] = useState(false);
  const [milestoneInvoiceDates, setMilestoneInvoiceDates] = useState({ startDate: '', endDate: '' });
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  
  // Status report dialog state
  const [showStatusReport, setShowStatusReport] = useState(false);

  // Export report state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<'all' | 'month' | 'custom'>('all');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  
  // Engagement completion confirmation state
  const [engagementToComplete, setEngagementToComplete] = useState<{
    userId: string;
    userName: string;
    hasActiveAllocations: boolean;
  } | null>(null);
  
  // Track the last completion attempt for error recovery
  const [lastCompletionAttempt, setLastCompletionAttempt] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  
  const { toast } = useToast();
  
  // Check if user can view Time tab
  const canViewTime = user ? ['admin', 'billing-admin', 'pm', 'executive'].includes(user.role) : false;
  
  // Check if user can manage time entries
  const canManageTimeEntries = user ? ['admin', 'billing-admin'].includes(user.role) : false;

  const { data: analytics, isLoading } = useQuery<ProjectAnalytics>({
    queryKey: [`/api/projects/${id}/analytics`],
    enabled: !!id,
  });

  // Auto-open edit dialog when ?edit=true is in the URL
  useEffect(() => {
    if (shouldOpenEditDialog && analytics?.project && !isLoading) {
      setProjectToEdit(analytics.project);
      setEditDialogOpen(true);
      // Clear the edit param from URL
      const params = new URLSearchParams(searchString);
      params.delete('edit');
      const queryString = params.toString();
      navigate(`/projects/${id}${queryString ? `?${queryString}` : ''}`, { replace: true });
    }
  }, [shouldOpenEditDialog, analytics?.project, isLoading, id, navigate, searchString]);

  // Check if user can manage time entries for this project (after analytics is loaded)
  const canManageProjectTimeEntries = user ? (
    ['admin', 'billing-admin'].includes(user.role) ||
    (user.role === 'pm' && analytics?.project?.pm === user.id)
  ) : false;

  const { data: sows = [], refetch: refetchSows } = useQuery<Sow[]>({
    queryKey: [`/api/projects/${id}/sows`],
    enabled: !!id,
  });
  
  // Project structure queries
  const { data: milestones = [], refetch: refetchMilestones } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/milestones`],
    enabled: !!id,
  });
  
  const { data: paymentMilestones = [], isLoading: paymentMilestonesLoading, refetch: refetchPaymentMilestones } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/payment-milestones`],
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
  
  const { data: stages = [], refetch: refetchStages } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/stages`],
    enabled: !!id,
  });

  // Users and roles for assignment dialog and edit project dialog
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });
  
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ['/api/roles'],
  });
  
  // Clients for edit project dialog
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['/api/clients'],
  });
  
  // Vocabulary catalog queries
  const { data: vocabularyCatalog = [] } = useQuery<any[]>({
    queryKey: ['/api/vocabulary/catalog'],
  });
  
  const { data: orgVocabulary } = useQuery<any>({
    queryKey: ['/api/vocabulary/organization'],
  });
  
  const { data: retainerUtil } = useQuery<any>({
    queryKey: [`/api/projects/${id}/retainer-utilization`],
    enabled: !!id,
  });

  // Get client vocabulary overrides for current project's client
  const currentClientId = analytics?.project?.clientId;
  const { data: currentClient } = useQuery<any>({
    queryKey: [`/api/clients/${currentClientId}`],
    enabled: !!currentClientId,
  });

  // Budget history query
  const { data: budgetHistory = [], isLoading: budgetHistoryLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/budget-history`],
    enabled: !!id,
  });
  
  // Time entries query - fetch time entries for this project
  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<any[]>({
    queryKey: [`/api/time-entries?projectId=${id}`],
    enabled: !!id && canViewTime,
  });

  // Project allocations query - fetch resource assignments
  const { data: allocations = [], isLoading: allocationsLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/allocations`],
    enabled: !!id,
  });

  // Project engagements query - fetch team member engagement status
  const { data: engagements = [], isLoading: engagementsLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/engagements`],
    enabled: !!id,
  });

  // Invoice batches query - fetch invoice batches for the project's client
  const { data: invoiceBatches = [], isLoading: invoiceBatchesLoading } = useQuery<any[]>({
    queryKey: [`/api/clients/${currentClientId}/invoice-batches`],
    enabled: !!currentClientId,
  });
  
  // Group vocabulary catalog terms by type
  const vocabularyTermsByType = useMemo(() => {
    const epicTerms = vocabularyCatalog.filter((term: any) => term.termType === 'epic');
    const stageTerms = vocabularyCatalog.filter((term: any) => term.termType === 'stage');
    const activityTerms = vocabularyCatalog.filter((term: any) => term.termType === 'activity');
    const workstreamTerms = vocabularyCatalog.filter((term: any) => term.termType === 'workstream');
    return { epicTerms, stageTerms, activityTerms, workstreamTerms };
  }, [vocabularyCatalog]);
  
  // Compute effective defaults for project vocabulary (client overrides or org defaults)
  const effectiveClientDefaults = useMemo(() => {
    if (!currentClient || !orgVocabulary) return {};
    return {
      epicTermId: currentClient.epicTermId || orgVocabulary.epicTermId,
      stageTermId: currentClient.stageTermId || orgVocabulary.stageTermId,
      activityTermId: currentClient.activityTermId || orgVocabulary.activityTermId,
      workstreamTermId: currentClient.workstreamTermId || orgVocabulary.workstreamTermId,
    };
  }, [currentClient, orgVocabulary]);
  
  // Get term value by ID for display
  const getTermValueById = (termId: string | null) => {
    if (!termId) return null;
    const term = vocabularyCatalog.find((t: any) => t.id === termId);
    return term?.termValue || null;
  };
  
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
    }).map(entry => {
      // Resolve workstream name from workstreamId
      const workstream = entry.workstreamId ? workstreams.find(w => w.id === entry.workstreamId) : null;
      
      return {
        ...entry,
        hours: Number(entry.hours || 0),
        billingRate: Number(entry.billingRate || 0),
        costRate: Number(entry.costRate || 0),
        isBillable: Boolean(entry.isBillable || entry.billable),
        isLocked: Boolean(entry.isLocked || entry.locked),
        workstream: workstream?.name || null,
        stage: entry.phase || null // Also populate stage from phase field
      };
    });
    
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
  }, [timeEntries, timeGrouping, timeFilters, workstreams]);
  
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

  // Edit project mutation
  const editProject = useMutation({
    mutationFn: ({ data }: { data: any }) => apiRequest(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/analytics`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditDialogOpen(false);
      setProjectToEdit(null);
      toast({
        title: "Success",
        description: "Project updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Project edit error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update project. Please check your permissions and try again.",
        variant: "destructive",
      });
    },
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

  const uploadSowDocumentMutation = useMutation({
    mutationFn: async ({ sowId, file }: { sowId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/sows/${sowId}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document uploaded",
        description: "The SOW document has been uploaded successfully."
      });
      refetchSows();
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document",
        variant: "destructive"
      });
    }
  });

  const handleSowUpload = (sowId: string, file: File) => {
    uploadSowDocumentMutation.mutate({ sowId, file });
  };

  // Milestone mutations
  const createMilestoneMutation = useMutation({
    mutationFn: async (data: MilestoneFormData) => {
      const processedData = {
        ...data,
        budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null,
        projectEpicId: data.projectEpicId || null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        description: data.description || null
      };
      return apiRequest(`/api/projects/${id}/milestones`, {
        method: "POST",
        body: JSON.stringify(processedData)
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
      const processedData = {
        ...data,
        budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null,
        projectEpicId: data.projectEpicId || null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        description: data.description || null
      };
      return apiRequest(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify(processedData)
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
      const processedData = {
        ...data,
        budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null,
        description: data.description || null
      };
      return apiRequest(`/api/projects/${id}/workstreams`, {
        method: "POST",
        body: JSON.stringify(processedData)
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
      const processedData = {
        ...data,
        budgetHours: data.budgetHours ? parseFloat(data.budgetHours) : null,
        description: data.description || null
      };
      return apiRequest(`/api/workstreams/${workstreamId}`, {
        method: "PATCH",
        body: JSON.stringify(processedData)
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
      const processedData = {
        ...data,
        description: data.description || null
      };
      return apiRequest(`/api/projects/${id}/epics`, {
        method: "POST",
        body: JSON.stringify(processedData)
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
      const processedData = {
        ...data,
        description: data.description || null
      };
      return apiRequest(`/api/epics/${epicId}`, {
        method: "PATCH",
        body: JSON.stringify(processedData)
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

  // Assignment mutations
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: AssignmentFormData) => {
      const processedData = {
        ...data,
        projectId: id,
        hours: data.hours ? parseFloat(data.hours) : undefined,
        roleId: data.roleId === 'none' ? null : (data.roleId || null),
        projectWorkstreamId: data.projectWorkstreamId === 'none' ? null : (data.projectWorkstreamId || null),
        projectEpicId: data.projectEpicId === 'none' ? null : (data.projectEpicId || null),
        projectStageId: data.projectStageId === 'none' ? null : (data.projectStageId || null),
        plannedStartDate: data.startDate || null,
        plannedEndDate: data.endDate || null,
        taskDescription: data.taskDescription || null,
        notes: data.notes || null,
        pricingMode: data.pricingMode || 'role',
        status: 'open'
      };
      return apiRequest(`/api/projects/${id}/allocations`, {
        method: "POST",
        body: JSON.stringify(processedData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/allocations`] });
      setShowAssignmentDialog(false);
      setEditingAssignment(null);
      toast({
        title: "Success",
        description: "Assignment created successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create assignment",
        variant: "destructive"
      });
    }
  });

  const importAssignmentsMutation = useMutation({
    mutationFn: async (data: { file: string; removeExisting: boolean }) => {
      return apiRequest(`/api/projects/${id}/allocations/import`, {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/allocations`] });
      setShowImportDialog(false);
      setImportFile(null);
      setImportError(null);
      
      if (result.errors && result.errors.length > 0) {
        toast({
          title: "Import Completed with Errors",
          description: `Created ${result.itemsCreated} assignments. ${result.errors.length} errors occurred.`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: `Successfully imported ${result.itemsCreated} assignments`
        });
      }
    },
    onError: (error: any) => {
      setImportError(error.message || "Failed to import file");
      toast({
        title: "Error",
        description: error.message || "Failed to import assignments",
        variant: "destructive"
      });
    }
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ allocationId, data }: { allocationId: string; data: any }) => {
      // Only include fields that are explicitly provided in the data
      // This prevents status-only updates from overwriting other fields
      const processedData: Record<string, any> = { ...data };
      
      // Process hours if provided
      if (data.hours !== undefined) {
        processedData.hours = data.hours ? parseFloat(data.hours) : undefined;
      }
      
      // Process select fields - only if explicitly provided
      if (data.roleId !== undefined) {
        processedData.roleId = data.roleId === 'none' ? null : data.roleId;
      }
      if (data.workstreamId !== undefined) {
        processedData.workstreamId = data.workstreamId === 'none' ? null : data.workstreamId;
      }
      if (data.epicId !== undefined) {
        processedData.epicId = data.epicId === 'none' ? null : data.epicId;
      }
      if (data.stageId !== undefined) {
        processedData.stageId = data.stageId === 'none' ? null : data.stageId;
      }
      
      // Process date fields - only if explicitly provided
      if (data.startDate !== undefined) {
        processedData.plannedStartDate = data.startDate || null;
        delete processedData.startDate;
      }
      if (data.endDate !== undefined) {
        processedData.plannedEndDate = data.endDate || null;
        delete processedData.endDate;
      }
      
      // Only update taskDescription if it was explicitly provided
      if (data.taskDescription !== undefined) {
        processedData.taskDescription = data.taskDescription || null;
      }
      
      return apiRequest(`/api/projects/${id}/allocations/${allocationId}`, {
        method: "PUT",
        body: JSON.stringify(processedData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/allocations`] });
      setShowAssignmentDialog(false);
      setEditingAssignment(null);
      toast({
        title: "Success",
        description: "Assignment updated successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update assignment",
        variant: "destructive"
      });
    }
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (allocationId: string) => {
      return apiRequest(`/api/projects/${id}/allocations/${allocationId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/allocations`] });
      toast({
        title: "Success",
        description: "Assignment deleted successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete assignment",
        variant: "destructive"
      });
    }
  });

  // Membership mutations for marking team members as complete/reactivating
  const completeEngagementMutation = useMutation({
    mutationFn: async ({ userId, force }: { userId: string; force?: boolean }) => {
      return apiRequest(`/api/projects/${id}/engagements/${userId}/complete`, {
        method: "PATCH",
        body: JSON.stringify({ force: force ?? false })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/engagements`] });
      setEngagementToComplete(null);
      setLastCompletionAttempt(null);
      toast({
        title: "Membership Marked Complete",
        description: "Team member has been marked as complete on this project"
      });
    },
    onError: (error: any) => {
      // Check if the error is because of active allocations (e.g., race condition with stale pre-check)
      // apiRequest throws an Error with message from response, so check for the known message pattern
      const isActiveAllocationsError = error.hasActiveAllocations || 
        (error.message && error.message.includes("active allocations"));
      
      if (isActiveAllocationsError && lastCompletionAttempt) {
        // Show confirmation dialog to allow override
        setEngagementToComplete({ 
          userId: lastCompletionAttempt.userId, 
          userName: lastCompletionAttempt.userName, 
          hasActiveAllocations: true 
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to complete membership",
          variant: "destructive"
        });
        setLastCompletionAttempt(null);
      }
    }
  });

  // Handler to initiate membership completion with pre-check
  const handleCompleteEngagement = async (userId: string, userName: string) => {
    // Store attempt info for error recovery in case of race condition
    setLastCompletionAttempt({ userId, userName });
    
    try {
      // First check if the user has active allocations using proper API request
      const data: any = await apiRequest(`/api/projects/${id}/engagements/${userId}/check-last-allocation`);
      if (data.remainingAllocations > 0) {
        // User has active allocations, show confirmation dialog requiring override
        setEngagementToComplete({ userId, userName, hasActiveAllocations: true });
      } else {
        // No active allocations, complete directly without force
        completeEngagementMutation.mutate({ userId, force: false });
      }
    } catch (e) {
      // If check fails, show confirmation dialog to let admin decide
      setEngagementToComplete({ userId, userName, hasActiveAllocations: true });
    }
  };

  const reactivateEngagementMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/projects/${id}/engagements/${userId}/reactivate`, {
        method: "PATCH"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/engagements`] });
      toast({
        title: "Membership Reactivated",
        description: "Team member is now active on this project again"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate membership",
        variant: "destructive"
      });
    }
  });

  const deleteEngagementMutation = useMutation({
    mutationFn: async (engagementId: string) => {
      return apiRequest(`/api/projects/${id}/engagements/${engagementId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/engagements`] });
      toast({
        title: "Membership Deleted",
        description: "Team membership has been removed"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete membership",
        variant: "destructive"
      });
    }
  });

  // Add team member mutation (without assignment)
  const addTeamMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/projects/${id}/engagements`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/engagements`] });
      setShowAddMemberDialog(false);
      setSelectedMemberId("");
      toast({
        title: "Team Member Added",
        description: "Team member has been added to this project"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add team member",
        variant: "destructive"
      });
    }
  });

  const handleImportFile = async () => {
    if (!importFile) {
      setImportError("Please select a file");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result?.toString().split(',')[1];
      if (!base64) {
        setImportError("Failed to read file");
        return;
      }

      importAssignmentsMutation.mutate({
        file: base64,
        removeExisting: importMode === "replace"
      });
    };
    reader.readAsDataURL(importFile);
  };

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

  const handleExportText = async (startDate?: string, endDate?: string) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const queryString = params.toString();
      const url = `/api/projects/${id}/export-text${queryString ? `?${queryString}` : ''}`;
      
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-Session-Id': sessionId || ''
        }
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'project-report.txt';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      
      toast({ title: "Report exported successfully" });
    } catch (error) {
      toast({ title: "Failed to export report", variant: "destructive" });
    }
  };

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

  const handleOpenMilestoneDialog = (milestone?: any) => {
    if (milestone) {
      setEditingMilestone(milestone);
      milestoneForm.reset({
        name: milestone.name,
        description: milestone.description || "",
        startDate: milestone.startDate || "",
        endDate: milestone.endDate || "",
        budgetHours: milestone.budgetHours?.toString() || "",
        status: milestone.status || "not-started",
        projectEpicId: milestone.projectEpicId || "",
        order: milestone.order || 0
      });
    } else {
      setEditingMilestone(null);
      milestoneForm.reset();
    }
    setShowMilestoneDialog(true);
  };

  const handleOpenWorkstreamDialog = (workstream?: any) => {
    if (workstream) {
      setEditingWorkstream(workstream);
      workstreamForm.reset({
        name: workstream.name,
        description: workstream.description || "",
        budgetHours: workstream.budgetHours?.toString() || "",
        order: workstream.order || 0
      });
    } else {
      setEditingWorkstream(null);
      workstreamForm.reset();
    }
    setShowWorkstreamDialog(true);
  };

  const handleOpenEpicDialog = (epic?: any) => {
    if (epic) {
      setEditingEpic(epic);
      epicForm.reset({
        name: epic.name,
        description: epic.description || "",
        order: epic.order || 0
      });
    } else {
      setEditingEpic(null);
      epicForm.reset();
    }
    setShowEpicDialog(true);
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

  const calculateBudgetImpact = (sow: Sow) => {
    const currentBudget = calculateTotalBudget();
    const sowValue = parseFloat(sow.value || "0");
    const newBudget = currentBudget + sowValue;
    return {
      currentBudget,
      sowValue,
      newBudget,
      percentageIncrease: currentBudget > 0 ? ((sowValue / currentBudget) * 100) : 100
    };
  };

  const handleApproveSowClick = (sow: Sow) => {
    setApprovingSow(sow);
    setShowBudgetImpactDialog(true);
  };

  const handleConfirmApproval = () => {
    if (approvingSow) {
      approveSowMutation.mutate(approvingSow.id);
      setShowBudgetImpactDialog(false);
      setApprovingSow(null);
    }
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

  const { project, monthlyMetrics = [], teamHours = [] } = analytics;
  
  // Provide default values for burnRate to prevent null access errors
  const burnRate = analytics.burnRate || {
    totalBudget: 0,
    consumedBudget: 0,
    burnRatePercentage: 0,
    estimatedHours: 0,
    actualHours: 0,
    hoursVariance: 0,
    projectedCompletion: null
  };

  // Debug logging for production issues
  console.log('[PROJECT_DETAIL] Analytics loaded:', {
    projectId: id,
    projectName: project?.name,
    hasProject: !!project,
    hasClient: !!project?.client,
    clientName: project?.client?.name,
    monthlyMetricsCount: monthlyMetrics?.length,
    monthlyMetricsMonths: monthlyMetrics?.map(m => m.month),
    teamHoursCount: teamHours?.length,
    burnRate: {
      totalBudget: burnRate.totalBudget,
      consumedBudget: burnRate.consumedBudget,
      burnRatePercentage: burnRate.burnRatePercentage
    }
  });

  // Calculate project health status
  const getProjectHealth = () => {
    if (burnRate.burnRatePercentage > 100) return { status: "critical", color: "bg-red-500", icon: AlertCircle };
    if (burnRate.burnRatePercentage > 80) return { status: "warning", color: "bg-yellow-500", icon: AlertTriangle };
    return { status: "healthy", color: "bg-green-500", icon: CheckCircle };
  };

  const health = getProjectHealth();

  // Helper function to safely parse month strings (format: "YYYY-MM")
  const safeFormatMonth = (monthStr: string): string | null => {
    if (!monthStr || typeof monthStr !== 'string') return null;
    // Check if it matches YYYY-MM format
    const monthPattern = /^\d{4}-\d{2}$/;
    if (!monthPattern.test(monthStr)) {
      console.warn('[PROJECT_DETAIL] Invalid month format:', monthStr);
      return null;
    }
    try {
      const parsed = parseISO(monthStr + "-01");
      if (isNaN(parsed.getTime())) return null;
      return format(parsed, "MMM yyyy");
    } catch (e) {
      console.warn('[PROJECT_DETAIL] Failed to parse month:', monthStr, e);
      return null;
    }
  };

  // General safe date formatter - handles any date string
  const safeFormatDate = (dateStr: string | null | undefined, formatStr: string = "MMM d, yyyy"): string => {
    if (!dateStr || typeof dateStr !== 'string') return '-';
    try {
      const parsed = parseISO(dateStr);
      if (isNaN(parsed.getTime())) {
        console.warn('[PROJECT_DETAIL] Invalid date:', dateStr);
        return '-';
      }
      return format(parsed, formatStr);
    } catch (e) {
      console.warn('[PROJECT_DETAIL] Failed to parse date:', dateStr, e);
      return '-';
    }
  };

  // Format monthly data for charts - filter out entries with invalid months
  const monthlyChartData = monthlyMetrics
    .filter(m => safeFormatMonth(m.month) !== null)
    .map(m => ({
      ...m,
      month: safeFormatMonth(m.month)!,
      totalHours: (m.billableHours || 0) + (m.nonBillableHours || 0),
      efficiency: m.billableHours > 0 ? ((m.billableHours / ((m.billableHours || 0) + (m.nonBillableHours || 0))) * 100).toFixed(1) : 0
    }));

  // Calculate cumulative burn - filter out entries with invalid months
  let cumulativeRevenue = 0;
  const cumulativeBurnData = monthlyMetrics
    .filter(m => safeFormatMonth(m.month) !== null)
    .map(m => {
      cumulativeRevenue += (m.revenue || 0) + (m.expenseAmount || 0);
      return {
        month: safeFormatMonth(m.month)!,
        cumulative: cumulativeRevenue,
        budget: burnRate.totalBudget,
        projected: burnRate.consumedBudget > 0 ? burnRate.totalBudget * (cumulativeRevenue / burnRate.consumedBudget) : 0
      };
    });

  // Team hours chart data
  const teamChartData = teamHours.map(t => ({
    name: (t.personName || 'Unknown').split(' ')[0], // First name only for chart
    billable: t.billableHours || 0,
    nonBillable: t.nonBillableHours || 0,
    total: t.totalHours || 0
  })).slice(0, 10); // Top 10 contributors

  // Gauge chart data for burn rate
  const gaugeData = [
    { name: "Consumed", value: burnRate.burnRatePercentage, fill: health.color },
    { name: "Remaining", value: Math.max(0, 100 - burnRate.burnRatePercentage), fill: "#e5e7eb" }
  ];

  return (
    <ProjectDetailErrorBoundary>
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
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
              {project.client?.name || 'Unknown Client'} • {project.type}
            </p>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-2" data-testid="project-description">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowStatusReport(true)} data-testid="button-status-report">
              <Sparkles className="w-4 h-4 mr-2" />
              Status Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)} data-testid="button-export-report">
              <FileText className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              setProjectToEdit(analytics.project);
              setEditDialogOpen(true);
            }} data-testid="button-edit-project">
              <Edit className="w-4 h-4 mr-2" />
              Edit Project
            </Button>
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

        {/* Main Content with Sidebar */}
        <div className="flex gap-6">
          {/* Project Info Sidebar */}
          <div className="w-64 shrink-0 hidden lg:block">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Client</p>
                  <p className="font-medium flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    {project.client?.name || 'Unknown Client'}
                  </p>
                </div>
                
                <Separator />
                
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Project Manager</p>
                  <p className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {(project as any).pmName || "Not assigned"}
                  </p>
                </div>
                
                <Separator />
                
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Timeline</p>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "Not set"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      to {project.endDate ? format(new Date(project.endDate), "MMM d, yyyy") : "Ongoing"}
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Commercial</p>
                  <p className="text-sm">{project.commercialScheme || "Not set"}</p>
                  {project.hasSow && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      <FileCheck className="h-3 w-3 mr-1" />
                      SOW Signed
                    </Badge>
                  )}
                </div>
                
                <Separator />
                
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget Summary</p>
                  <div className="space-y-2 mt-2">
                    <div className="flex justify-between text-sm">
                      <span>Total</span>
                      <span className="font-medium">${(burnRate.totalBudget || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Burned</span>
                      <span className="font-medium">${(burnRate.consumedBudget || 0).toLocaleString()}</span>
                    </div>
                    <Progress value={burnRate.burnRatePercentage} className="h-2" />
                    <p className="text-xs text-center text-muted-foreground">
                      {burnRate.burnRatePercentage.toFixed(1)}% used
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => {
                      setProjectToEdit(analytics.project);
                      setEditDialogOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Project
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowStatusReport(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Status Report
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowExportDialog(true)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs Content */}
          <div className="flex-1 min-w-0">
            <Tabs value={selectedTab} onValueChange={handleTabChange}>
              <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="delivery" data-testid="tab-delivery">Delivery</TabsTrigger>
                <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
                <TabsTrigger value="contracts" data-testid="tab-contracts">Contracts</TabsTrigger>
                {canViewTime && (
                  <TabsTrigger value="time" data-testid="tab-time">Time</TabsTrigger>
                )}
                <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
                <TabsTrigger value="raidd" data-testid="tab-raidd">RAIDD</TabsTrigger>
              </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {retainerUtil?.months?.length > 0 && (
              <Card data-testid="retainer-utilization-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-blue-600" />
                        Retainer Utilization
                      </CardTitle>
                      <CardDescription>Monthly hour usage vs. retainer cap</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {retainerUtil.totalUsedHours || 0} / {retainerUtil.totalMaxHours || 0} hrs
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {retainerUtil.totalMaxHours > 0 ? Math.round((retainerUtil.totalUsedHours / retainerUtil.totalMaxHours) * 100) : 0}% overall utilization
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {retainerUtil.months.map((month: any) => {
                      const isOver = month.usedHours > month.maxHours;
                      const pct = Math.min(month.utilization, 100);
                      const now = new Date().toISOString().split('T')[0];
                      const isCurrent = now >= (month.startDate || '') && now <= (month.endDate || '');
                      return (
                        <div key={month.monthIndex} className={`p-3 rounded-lg border ${isCurrent ? 'border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700' : ''}`}>
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{month.label}</span>
                              {isCurrent && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded dark:bg-blue-800 dark:text-blue-200">Current</span>}
                            </div>
                            <span className={`text-sm font-medium ${isOver ? 'text-red-600' : month.utilization >= 80 ? 'text-amber-600' : 'text-green-600'}`}>
                              {month.usedHours} / {month.maxHours} hrs ({month.utilization}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${isOver ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {isOver && (
                            <span className="text-xs text-red-600 mt-1 block">Over by {(month.usedHours - month.maxHours).toFixed(1)} hrs</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

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
                      {(() => {
                        const totalHrs = teamHours.reduce((sum, t) => sum + (t.totalHours || 0), 0);
                        const billableHrs = teamHours.reduce((sum, t) => sum + (t.billableHours || 0), 0);
                        return totalHrs > 0 ? ((billableHrs / totalHrs) * 100).toFixed(1) : '0';
                      })()}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Tabs defaultValue="monthly" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="monthly" data-testid="tab-analytics-monthly">Monthly Trends</TabsTrigger>
                <TabsTrigger value="team" data-testid="tab-analytics-team">Team Performance</TabsTrigger>
                <TabsTrigger value="burndown" data-testid="tab-analytics-burndown">Burn Rate</TabsTrigger>
              </TabsList>
              
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
                      connectNulls
                      dot={{ r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="expenseAmount" 
                      name="Expenses" 
                      stroke="hsl(var(--destructive))" 
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4 }}
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
                        <TableCell className="text-right">{(member.billableHours || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right">{(member.nonBillableHours || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right">{(member.totalHours || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right">${(member.revenue || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={(member.totalHours || 0) > 0 && (member.billableHours || 0) / member.totalHours > 0.8 ? "default" : "secondary"}>
                            {(member.totalHours || 0) > 0 ? (((member.billableHours || 0) / member.totalHours) * 100).toFixed(0) : '0'}%
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
                        <Badge variant={burnRate.burnRatePercentage > 80 ? "destructive" : "default"}>
                          {burnRate.burnRatePercentage.toFixed(1)}% consumed
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
              
            </Tabs>
          </TabsContent>

          {/* Delivery Tab - Unified view of Structure and Team Allocations */}
          <TabsContent value="delivery" className="space-y-6">
            <Tabs defaultValue="structure" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="structure" data-testid="tab-delivery-structure">Project Structure</TabsTrigger>
                <TabsTrigger value="allocations" data-testid="tab-delivery-allocations">Team & Assignments</TabsTrigger>
              </TabsList>
              
              <TabsContent value="structure" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Project Structure</CardTitle>
                    <CardDescription>
                      Organize your project with epics, stages, workstreams, and milestones
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleOpenEpicDialog()}
                      data-testid="button-add-epic"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Epic
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleOpenMilestoneDialog()}
                      data-testid="button-add-milestone"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Milestone
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleOpenWorkstreamDialog()}
                      data-testid="button-add-workstream"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Workstream
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Epics Section */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Epics & Milestones</h4>
                    {epics.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No epics found. Click "Add Epic" to create project structure.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {[...epics].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((epic: any) => {
                          const epicMilestones = [...milestones]
                            .filter((m: any) => m.projectEpicId === epic.id)
                            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
                          const epicStages = [...stages]
                            .filter((s: any) => s.epicId === epic.id)
                            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
                          return (
                            <div key={epic.id} className="border rounded-lg p-4" data-testid={`epic-card-${epic.id}`}>
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h5 className="font-semibold">{epic.name}</h5>
                                  {epic.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{epic.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenEpicDialog(epic)}
                                    data-testid={`button-edit-epic-${epic.id}`}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setDeletingEpicId(epic.id)}
                                    data-testid={`button-delete-epic-${epic.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Stages for this Epic */}
                              {epicStages.length > 0 && (
                                <div className="ml-6 space-y-2 mb-3">
                                  <div className="text-xs font-medium text-muted-foreground mb-2">Stages</div>
                                  {epicStages.map((stage: any) => (
                                    <div key={stage.id} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                                      <div className="flex items-center gap-3">
                                        <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        <span className="text-sm font-medium">{stage.name}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Milestones for this Epic */}
                              {epicMilestones.length > 0 && (
                                <div className="ml-6 space-y-2">
                                  <div className="text-xs font-medium text-muted-foreground mb-2">Milestones</div>
                                  {epicMilestones.map((milestone: any) => (
                                    <div key={milestone.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                      <div className="flex items-center gap-3">
                                        <Target className="w-4 h-4 text-muted-foreground" />
                                        <div>
                                          <span className="text-sm font-medium">{milestone.name}</span>
                                          {milestone.isPaymentMilestone && (
                                            <Badge className="ml-2" variant="outline">Payment</Badge>
                                          )}
                                          {milestone.targetDate && (
                                            <span className="text-xs text-muted-foreground ml-2">
                                              Target: {format(new Date(milestone.targetDate), 'MMM d, yyyy')}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant={milestone.status === "completed" ? "default" : "secondary"}>
                                          {milestone.status}
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleOpenMilestoneDialog(milestone)}
                                          data-testid={`button-edit-milestone-${milestone.id}`}
                                        >
                                          <Edit className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Workstreams Section */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Workstreams</h4>
                    {workstreams.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No workstreams found. Click "Add Workstream" to organize work.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...workstreams].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((workstream: any) => {
                          const variance = (workstream.budgetHours || 0) - (workstream.actualHours || 0);
                          return (
                            <div key={workstream.id} className="border rounded-lg p-4" data-testid={`workstream-card-${workstream.id}`}>
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h5 className="font-semibold">{workstream.name}</h5>
                                  {workstream.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{workstream.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenWorkstreamDialog(workstream)}
                                    data-testid={`button-edit-workstream-${workstream.id}`}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeletingWorkstreamId(workstream.id)}
                                    data-testid={`button-delete-workstream-${workstream.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Budget</p>
                                  <p className="font-semibold">{workstream.budgetHours || '—'}h</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Actual</p>
                                  <p className="font-semibold">{workstream.actualHours || '0'}h</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Variance</p>
                                  {workstream.budgetHours ? (
                                    <p className={`font-semibold ${variance < 0 ? "text-destructive" : "text-green-600"}`}>
                                      {variance > 0 ? '+' : ''}{variance.toFixed(1)}h
                                    </p>
                                  ) : (
                                    <p className="font-semibold">—</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Standalone Milestones (not tied to epics) */}
                  {(() => {
                    const standaloneMilestones = milestones.filter((m: any) => !m.projectEpicId);
                    return standaloneMilestones.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Project Milestones</h4>
                          <div className="space-y-2">
                            {standaloneMilestones.map((milestone: any) => (
                              <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center gap-3">
                                  <Target className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="font-medium">{milestone.name}</span>
                                    {milestone.isPaymentMilestone && (
                                      <Badge className="ml-2" variant="outline">Payment</Badge>
                                    )}
                                    {milestone.description && (
                                      <p className="text-xs text-muted-foreground">{milestone.description}</p>
                                    )}
                                    {milestone.targetDate && (
                                      <p className="text-xs text-muted-foreground">
                                        Target: {format(new Date(milestone.targetDate), 'MMM d, yyyy')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={milestone.status === "completed" ? "default" : "secondary"}>
                                    {milestone.status}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenMilestoneDialog(milestone)}
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
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
              </TabsContent>
              
              <TabsContent value="allocations" className="space-y-6">
            {/* Planner Integration Panel */}
            <PlannerStatusPanel 
              projectId={id || ""} 
              projectName={analytics?.project?.name || ""} 
              clientName={analytics?.project?.client?.name}
              clientTeamId={analytics?.project?.client?.microsoftTeamId}
              clientId={analytics?.project?.clientId}
            />
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Team Assignments</CardTitle>
                  <CardDescription>Resource allocations and task assignments for this project</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setShowImportDialog(true)}
                    variant="outline"
                    data-testid="button-import-assignments"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                  <Button 
                    onClick={() => setShowAssignmentDialog(true)}
                    data-testid="button-add-assignment"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Assignment
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/projects/${id}/allocations/export`, {
                          credentials: 'include',
                          headers: {
                            'X-Session-Id': localStorage.getItem('sessionId') || ''
                          }
                        });
                        
                        if (!response.ok) throw new Error('Export failed');
                        
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `project-${id}-allocations.csv`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        toast({
                          title: "Export failed",
                          description: "Failed to export allocations",
                          variant: "destructive"
                        });
                      }
                    }}
                    data-testid="button-export-allocations"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export to CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters:</span>
                  </div>
                  <Select
                    value={allocationStatusFilter}
                    onValueChange={setAllocationStatusFilter}
                  >
                    <SelectTrigger className="w-[140px] h-8" data-testid="filter-allocation-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={allocationResourceFilter}
                    onValueChange={setAllocationResourceFilter}
                  >
                    <SelectTrigger className="w-[160px] h-8" data-testid="filter-allocation-resource">
                      <SelectValue placeholder="Resource" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Resources</SelectItem>
                      {Array.from(new Set(allocations.map((a: any) => a.person?.id || a.resourceName)))
                        .filter(Boolean)
                        .map((resourceId: any) => {
                          const allocation = allocations.find((a: any) => 
                            (a.person?.id || a.resourceName) === resourceId
                          );
                          const name = allocation?.person?.name || allocation?.resourceName || 'Unknown';
                          return (
                            <SelectItem key={resourceId} value={resourceId}>
                              {name}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={allocationStageFilter}
                    onValueChange={setAllocationStageFilter}
                  >
                    <SelectTrigger className="w-[160px] h-8" data-testid="filter-allocation-stage">
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {Array.from(new Set(allocations.map((a: any) => a.stage?.id)))
                        .filter(Boolean)
                        .map((stageId: any) => {
                          const allocation = allocations.find((a: any) => a.stage?.id === stageId);
                          return (
                            <SelectItem key={stageId} value={stageId}>
                              {allocation?.stage?.name || 'Unknown'}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  {(allocationStatusFilter !== 'all' || allocationResourceFilter !== 'all' || allocationStageFilter !== 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setAllocationStatusFilter('all');
                        setAllocationResourceFilter('all');
                        setAllocationStageFilter('all');
                      }}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                {allocationsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : allocations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No team assignments found</p>
                    <p className="text-sm mt-2">
                      Assignments are created when projects are generated from approved estimates
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resource</TableHead>
                        <TableHead>Task/Activity</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Workstream</TableHead>
                        <TableHead>Epic/Stage</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Week</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations
                        .filter((allocation: any) => {
                          if (allocationStatusFilter !== 'all' && allocation.status !== allocationStatusFilter) return false;
                          if (allocationResourceFilter !== 'all') {
                            const resourceId = allocation.person?.id || allocation.resourceName;
                            if (resourceId !== allocationResourceFilter) return false;
                          }
                          if (allocationStageFilter !== 'all' && allocation.stage?.id !== allocationStageFilter) return false;
                          return true;
                        })
                        .map((allocation: any) => (
                        <TableRow 
                          key={allocation.id} 
                          data-testid={`allocation-row-${allocation.id}`}
                          ref={(el) => {
                            if (highlightedAssignmentId === allocation.id && el) {
                              setTimeout(() => {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 100);
                            }
                          }}
                          className={highlightedAssignmentId === allocation.id ? 
                            'ring-2 ring-primary ring-offset-2 bg-primary/5 animate-pulse' : ''
                          }
                        >
                          <TableCell className="font-medium">
                            {allocation.person ? (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                {allocation.person.name}
                              </div>
                            ) : allocation.role ? (
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                {allocation.resourceName || 'Unassigned'}
                                <Badge variant="outline" className="ml-1">Role-based</Badge>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                                {allocation.resourceName || 'Unassigned'}
                                <Badge variant="secondary" className="ml-1">Unmatched</Badge>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {allocation.taskDescription || (
                                <span className="text-muted-foreground italic">No task specified</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{allocation.role?.name || '—'}</TableCell>
                          <TableCell>{allocation.workstream?.name || '—'}</TableCell>
                          <TableCell>
                            {allocation.epic || allocation.stage ? (
                              <span className="text-sm">
                                {allocation.epic?.name || '—'} / {allocation.stage?.name || '—'}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {parseFloat(allocation.hours || '0').toFixed(1)}
                          </TableCell>
                          <TableCell>
                            {allocation.plannedStartDate ? 
                              safeFormatDate(allocation.plannedStartDate, "MMM d, yyyy") : 
                              '—'
                            }
                          </TableCell>
                          <TableCell>
                            {allocation.plannedEndDate ? 
                              safeFormatDate(allocation.plannedEndDate, "MMM d, yyyy") : 
                              '—'
                            }
                          </TableCell>
                          <TableCell>
                            {allocation.weekNumber !== null ? 
                              `Week ${allocation.weekNumber}` : 
                              '—'
                            }
                          </TableCell>
                          <TableCell>
                            <Select
                              value={allocation.status || 'open'}
                              onValueChange={(value) => {
                                const updates: any = { status: value };
                                if (value === 'in_progress' && !allocation.startedDate) {
                                  updates.startedDate = new Date().toISOString().split('T')[0];
                                }
                                if (value === 'completed' && !allocation.completedDate) {
                                  updates.completedDate = new Date().toISOString().split('T')[0];
                                }
                                updateAssignmentMutation.mutate({ 
                                  allocationId: allocation.id, 
                                  data: updates 
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 w-[130px]" data-testid={`select-status-${allocation.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">
                                  <div className="flex items-center gap-2">
                                    <AlertCircle className="w-3 h-3 text-muted-foreground" />
                                    Open
                                  </div>
                                </SelectItem>
                                <SelectItem value="in_progress">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3 h-3 text-blue-500" />
                                    In Progress
                                  </div>
                                </SelectItem>
                                <SelectItem value="completed">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-3 h-3 text-green-500" />
                                    Completed
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingAssignment(allocation);
                                  setShowAssignmentDialog(true);
                                }}
                                data-testid={`button-edit-allocation-${allocation.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteAssignmentMutation.mutate(allocation.id)}
                                data-testid={`button-delete-allocation-${allocation.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Team Membership Card - Shows team member status */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Team Membership
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Track which team members are actively working on this project. 
                      Mark members as "complete" when they've finished their involvement to stop time reminders.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddMemberDialog(true)}
                    data-testid="button-add-team-member"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {engagementsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : engagements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No team members yet</p>
                    <p className="text-sm mt-2">
                      Team membership is created automatically when members are assigned to tasks
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Team Member</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {engagements.map((engagement: any) => (
                        <TableRow key={engagement.id} data-testid={`engagement-row-${engagement.userId}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              {engagement.user?.name || 'Unknown User'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={engagement.status === 'active' ? 'default' : 'secondary'}>
                              {engagement.status === 'active' ? (
                                <><Activity className="w-3 h-3 mr-1" /> Active</>
                              ) : (
                                <><CheckCircle className="w-3 h-3 mr-1" /> Complete</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {engagement.createdAt ? format(new Date(engagement.createdAt), "MMM d, yyyy") : '—'}
                          </TableCell>
                          <TableCell>
                            {engagement.completedAt ? format(new Date(engagement.completedAt), "MMM d, yyyy") : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {engagement.status === 'active' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCompleteEngagement(engagement.userId, engagement.user?.name || 'Unknown User')}
                                  disabled={completeEngagementMutation.isPending}
                                  data-testid={`button-complete-engagement-${engagement.userId}`}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Mark Complete
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => reactivateEngagementMutation.mutate(engagement.userId)}
                                  disabled={reactivateEngagementMutation.isPending}
                                  data-testid={`button-reactivate-engagement-${engagement.userId}`}
                                >
                                  <Activity className="w-3 h-3 mr-1" />
                                  Reactivate
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete membership for ${engagement.user?.name || 'Unknown User'}? This cannot be undone.`)) {
                                    deleteEngagementMutation.mutate(engagement.id);
                                  }
                                }}
                                disabled={deleteEngagementMutation.isPending}
                                data-testid={`button-delete-engagement-${engagement.userId}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
              </TabsContent>
              
            </Tabs>
          </TabsContent>

          {/* Contracts Tab - SOWs, Budget History, Payment Milestones */}
          <TabsContent value="contracts" className="space-y-6">
            <Tabs defaultValue="sows" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="sows" data-testid="tab-contracts-sows">SOWs & Change Orders</TabsTrigger>
                <TabsTrigger value="budget-history" data-testid="tab-contracts-budget">Budget History</TabsTrigger>
                <TabsTrigger value="payment-milestones" data-testid="tab-contracts-milestones">Payment Milestones</TabsTrigger>
                <TabsTrigger value="sub-sow" data-testid="tab-contracts-sub-sow">Sub-SOW Generator</TabsTrigger>
                <TabsTrigger value="rate-overrides" data-testid="tab-contracts-rate-overrides">Rate Overrides</TabsTrigger>
                <TabsTrigger value="retainer" data-testid="tab-contracts-retainer">Retainer</TabsTrigger>
              </TabsList>
              
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

                {/* Budget Breakdown */}
                {sows.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="text-lg">Budget Breakdown</CardTitle>
                      <CardDescription>Project budget composition</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {sows
                          .filter(s => s.status === "approved" && s.type === "initial")
                          .map((sow) => (
                            <div key={sow.id} className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <FileCheck className="w-4 h-4 text-primary" />
                                <span className="text-sm">Initial SOW: {sow.name}</span>
                              </div>
                              <span className="font-semibold" data-testid={`budget-sow-${sow.id}`}>
                                ${parseFloat(sow.value).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        
                        {sows
                          .filter(s => s.status === "approved" && s.type === "change_order")
                          .map((sow) => (
                            <div key={sow.id} className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-green-600" />
                                <span className="text-sm">Change Order: {sow.name}</span>
                              </div>
                              <span className="font-semibold text-green-600" data-testid={`budget-co-${sow.id}`}>
                                +${parseFloat(sow.value).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        
                        <Separator className="my-2" />
                        
                        <div className="flex justify-between items-center">
                          <span className="font-bold">Total Project Budget</span>
                          <span className="text-xl font-bold text-primary" data-testid="budget-total">
                            ${calculateTotalBudget().toLocaleString()}
                          </span>
                        </div>
                        
                        {sows.filter(s => s.status === "approved" && s.type === "change_order").length > 0 && (
                          <div className="text-xs text-muted-foreground mt-2">
                            Includes {sows.filter(s => s.status === "approved" && s.type === "change_order").length} approved change order(s)
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

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
                            <div className="flex items-center gap-2">
                              {sow.documentUrl ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => window.open(`/api/sows/${sow.id}/download`, '_blank')}
                                    className="h-7 px-2"
                                    data-testid={`button-download-sow-${sow.id}`}
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    {sow.documentName || "Download"}
                                  </Button>
                                  <label htmlFor={`sow-upload-${sow.id}`}>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2"
                                      asChild
                                      data-testid={`button-replace-sow-${sow.id}`}
                                    >
                                      <span>
                                        <Upload className="w-3 h-3 mr-1" />
                                        Replace
                                      </span>
                                    </Button>
                                    <input
                                      id={`sow-upload-${sow.id}`}
                                      type="file"
                                      className="hidden"
                                      accept=".pdf,.doc,.docx"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleSowUpload(sow.id, file);
                                      }}
                                    />
                                  </label>
                                </>
                              ) : (
                                <label htmlFor={`sow-upload-${sow.id}`}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    asChild
                                    data-testid={`button-upload-sow-${sow.id}`}
                                  >
                                    <span>
                                      <Upload className="w-3 h-3 mr-1" />
                                      Upload
                                    </span>
                                  </Button>
                                  <input
                                    id={`sow-upload-${sow.id}`}
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleSowUpload(sow.id, file);
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {sow.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleApproveSowClick(sow)}
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
              
              <TabsContent value="budget-history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Budget History</CardTitle>
                <CardDescription>
                  Complete audit trail of all budget changes for this project
                </CardDescription>
              </CardHeader>
              <CardContent>
                {budgetHistoryLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : budgetHistory.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No budget changes recorded yet</p>
                    <p className="text-sm mt-2">
                      Budget changes will appear here when SOWs or change orders are approved
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {budgetHistory.map((entry: any, index: number) => {
                      const isIncrease = parseFloat(entry.deltaValue || "0") > 0;
                      const changeTypeLabel = 
                        entry.changeType === "sow_approval" ? "SOW Approved" :
                        entry.changeType === "change_order_approval" ? "Change Order Approved" :
                        entry.changeType === "manual_adjustment" ? "Manual Adjustment" :
                        "Budget Change";
                      
                      return (
                        <div
                          key={entry.id}
                          className="border rounded-lg p-4 space-y-3"
                          data-testid={`budget-history-entry-${index}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${isIncrease ? 'bg-green-100' : 'bg-red-100'}`}>
                                {isIncrease ? (
                                  <TrendingUp className="w-4 h-4 text-green-600" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-red-600" />
                                )}
                              </div>
                              <div>
                                <h4 className="font-semibold text-sm">{changeTypeLabel}</h4>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(entry.createdAt), "PPp")}
                                </p>
                              </div>
                            </div>
                            <Badge variant={isIncrease ? "default" : "destructive"}>
                              {isIncrease ? '+' : ''}${parseFloat(entry.deltaValue || "0").toLocaleString()}
                            </Badge>
                          </div>
                          
                          {entry.reason && (
                            <p className="text-sm text-muted-foreground">{entry.reason}</p>
                          )}
                          
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Previous Budget:</span>
                              <span className="ml-2 font-semibold">
                                ${parseFloat(entry.previousValue || "0").toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">New Budget:</span>
                              <span className="ml-2 font-semibold">
                                ${parseFloat(entry.newValue || "0").toLocaleString()}
                              </span>
                            </div>
                          </div>
                          
                          {entry.metadata && (
                            <div className="text-xs text-muted-foreground pt-2 border-t">
                              {entry.metadata.sowName && (
                                <div>Related to: {entry.metadata.sowName}</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
                    onClick={() => handleOpenMilestoneDialog()}
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
                                  handleOpenMilestoneDialog(milestone);
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
                    onClick={() => handleOpenWorkstreamDialog()}
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
                                    handleOpenWorkstreamDialog(workstream);
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
              
              <TabsContent value="payment-milestones" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Payment Milestones</CardTitle>
                    <CardDescription>
                      Financial schedule and invoicing milestones for this project
                    </CardDescription>
                  </div>
                  {['admin', 'billing-admin', 'pm'].includes(user?.role || '') && (
                    <Button
                      onClick={() => {
                        setEditingPaymentMilestone(null);
                        setShowPaymentMilestoneDialog(true);
                      }}
                      data-testid="button-create-payment-milestone"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Payment Milestone
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {paymentMilestonesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Milestone Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Target Date</TableHead>
                        <TableHead>Invoice Status</TableHead>
                        <TableHead>Linked to</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentMilestones.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            Payment milestones are automatically created when a project is created from an estimate with milestones.
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...paymentMilestones]
                          .sort((a, b) => {
                            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
                            if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
                            return 0;
                          })
                          .map((pm: any) => {
                            const linkedMilestone = pm.deliveryMilestoneId ? 
                              milestones.find(m => m.id === pm.deliveryMilestoneId) : null;
                            
                            return (
                              <TableRow key={pm.id} data-testid={`payment-milestone-row-${pm.id}`}>
                                <TableCell className="font-medium">{pm.name}</TableCell>
                                <TableCell>${Number(pm.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell>{pm.targetDate ? safeFormatDate(pm.targetDate, 'MMM d, yyyy') : '-'}</TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={pm.invoiceStatus === 'paid' ? 'default' : pm.invoiceStatus === 'invoiced' ? 'secondary' : 'outline'}
                                    data-testid={`badge-status-${pm.id}`}
                                  >
                                    {pm.invoiceStatus === 'paid' ? 'Paid' : pm.invoiceStatus === 'invoiced' ? 'Invoiced' : 'Planned'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {linkedMilestone ? (
                                    <span className="text-sm text-muted-foreground">
                                      {linkedMilestone.name}
                                    </span>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {['admin', 'billing-admin', 'pm'].includes(user?.role || '') && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setEditingPaymentMilestone(pm);
                                            setShowPaymentMilestoneDialog(true);
                                          }}
                                          data-testid={`button-edit-pm-${pm.id}`}
                                        >
                                          <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={async () => {
                                            if (confirm(`Delete payment milestone "${pm.name}"?`)) {
                                              try {
                                                await apiRequest(`/api/payment-milestones/${pm.id}`, {
                                                  method: 'DELETE'
                                                });
                                                toast({
                                                  title: "Success",
                                                  description: "Payment milestone deleted"
                                                });
                                                refetchPaymentMilestones();
                                              } catch (error: any) {
                                                toast({
                                                  title: "Error",
                                                  description: error.message || "Failed to delete milestone",
                                                  variant: "destructive"
                                                });
                                              }
                                            }
                                          }}
                                          data-testid={`button-delete-pm-${pm.id}`}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </>
                                    )}
                                    {pm.invoiceStatus === 'planned' && ['admin', 'billing-admin'].includes(user?.role || '') && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setGeneratingInvoiceForMilestone(pm);
                                          setMilestoneInvoiceDates({ startDate: '', endDate: '' });
                                          setShowMilestoneInvoiceDialog(true);
                                        }}
                                        data-testid={`button-generate-invoice-${pm.id}`}
                                      >
                                        <DollarSign className="w-4 h-4 mr-1" />
                                        Generate Invoice
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
              </TabsContent>

              {/* Sub-SOW Generator Tab */}
              <TabsContent value="sub-sow" className="space-y-6">
                <SubSOWGenerator projectId={id || ''} projectName={analytics?.project?.name || 'Project'} />
              </TabsContent>

              <TabsContent value="rate-overrides" className="space-y-6">
                <ProjectRateOverridesSection
                  projectId={id || ''}
                  isEditable={['admin', 'billing-admin', 'pm'].includes(user?.role || '')}
                />
              </TabsContent>

              <TabsContent value="retainer" className="space-y-6">
                <ProjectRetainerManagement
                  projectId={id || ''}
                  isEditable={['admin', 'billing-admin', 'pm'].includes(user?.role || '')}
                  commercialScheme={project?.commercialScheme}
                />
              </TabsContent>
              
            </Tabs>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-6">
            {/* Quick Milestone Invoice Card */}
            {paymentMilestones.filter((pm: any) => pm.invoiceStatus === 'planned').length > 0 && 
              ['admin', 'billing-admin'].includes(user?.role || '') && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-blue-900">Quick Milestone Invoice</CardTitle>
                      <CardDescription>
                        Generate invoice from planned payment milestones
                      </CardDescription>
                    </div>
                    <Select 
                      onValueChange={(value) => {
                        const selected = paymentMilestones.find((pm: any) => pm.id === value);
                        if (selected) {
                          setGeneratingInvoiceForMilestone(selected);
                          setMilestoneInvoiceDates({ startDate: '', endDate: '' });
                          setShowMilestoneInvoiceDialog(true);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[300px]" data-testid="select-quick-milestone">
                        <SelectValue placeholder="Select milestone to invoice..." />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMilestones
                          .filter((pm: any) => pm.invoiceStatus === 'planned')
                          .map((pm: any) => (
                            <SelectItem key={pm.id} value={pm.id}>
                              {pm.name} - ${Number(pm.amount ?? 0).toLocaleString()}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>
                  Invoice batches for {analytics?.project?.client?.name || 'this client'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoiceBatchesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : invoiceBatches.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No invoices found</h3>
                    <p className="text-muted-foreground">No invoice batches have been created for this client yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoiceBatches.map((batch: any) => (
                      <div
                        key={batch.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                        data-testid={`invoice-batch-${batch.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <Link href={`/billing/batches/${batch.batchId}`}>
                              <div className="font-medium text-primary hover:underline cursor-pointer" data-testid={`invoice-batch-id-${batch.id}`}>
                                {batch.batchId}
                              </div>
                            </Link>
                            <div className="text-sm text-muted-foreground">
                              {batch.projectNames && batch.projectNames.length > 0 && batch.projectNames.length <= 3 ? (
                                <span>
                                  <FolderOpen className="w-3 h-3 mr-1 inline" />
                                  {batch.projectNames.join(", ")}
                                </span>
                              ) : (
                                <span>
                                  <FolderOpen className="w-3 h-3 mr-1 inline" />
                                  {batch.projectCount || 0} project{batch.projectCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {batch.invoicingMode === 'client' ? (
                                <><Building className="w-3 h-3 mr-1" />Client</>  
                              ) : (
                                <><FolderOpen className="w-3 h-3 mr-1" />Project</>
                              )}
                            </Badge>
                            <Badge variant={
                              batch.status === 'finalized' ? 'default' : 
                              batch.status === 'draft' ? 'secondary' : 
                              'outline'
                            }>
                              {batch.status}
                            </Badge>
                            {batch.status === 'finalized' && (
                              <Badge variant={
                                batch.paymentStatus === 'paid' ? 'default' : 
                                batch.paymentStatus === 'partial' ? 'secondary' : 
                                'destructive'
                              }>
                                {batch.paymentStatus || 'unpaid'}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {format(new Date(batch.startDate), 'MMM d')} - {format(new Date(batch.endDate), 'MMM d, yyyy')} • 
                            {batch.discountAmount && ` Discount: $${Number(batch.discountAmount).toLocaleString()} • `}
                            Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}
                            {batch.paymentDate && ` • Payment: ${format(new Date(batch.paymentDate), 'MMM d, yyyy')}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-lg" data-testid={`invoice-batch-amount-${batch.id}`}>
                            {canViewPricing ? `$${Number(batch.totalAmount || 0).toLocaleString()}` : '***'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {batch.invoicingMode === 'client' ? 'Client billing' : 'Project billing'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                            Date Range: {safeFormatDate(processedTimeEntries.summary.dateRange.start, "MMM d, yyyy")} - {safeFormatDate(processedTimeEntries.summary.dateRange.end, "MMM d, yyyy")}
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
                                    {safeFormatDate(entry.date, "MMM d, yyyy")}
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

          <TabsContent value="raidd" className="space-y-6">
            <RaiddLogTab
              projectId={id || ''}
              projectTeamMembers={engagements
                .filter((e: any) => e.status === 'active' && e.user)
                .map((e: any) => ({ id: e.user.id, name: e.user.name || e.user.email }))}
            />
          </TabsContent>
          
            </Tabs>
          </div>
        </div>

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
              <form name="project-sow-form" onSubmit={sowForm.handleSubmit(handleSubmitSow)} className="space-y-4">
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
              <form name="project-milestone-form" onSubmit={milestoneForm.handleSubmit(handleSubmitMilestone)} className="space-y-4">
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
                      <FormLabel>Epic (optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-milestone-epic">
                            <SelectValue placeholder="Select an epic (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
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
              <form name="project-workstream-form" onSubmit={workstreamForm.handleSubmit(handleSubmitWorkstream)} className="space-y-4">
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

        {/* Create/Edit Payment Milestone Dialog */}
        <Dialog open={showPaymentMilestoneDialog} onOpenChange={setShowPaymentMilestoneDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingPaymentMilestone ? 'Edit Payment Milestone' : 'Create Payment Milestone'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pm-name">Milestone Name *</Label>
                <Input
                  id="pm-name"
                  placeholder="e.g., Phase 1 Completion Payment"
                  defaultValue={editingPaymentMilestone?.name || ''}
                  data-testid="input-pm-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pm-description">Description</Label>
                <Textarea
                  id="pm-description"
                  placeholder="Describe what triggers this payment..."
                  defaultValue={editingPaymentMilestone?.description || ''}
                  data-testid="input-pm-description"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pm-amount">Amount *</Label>
                  <Input
                    id="pm-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    defaultValue={editingPaymentMilestone?.amount || ''}
                    data-testid="input-pm-amount"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pm-target-date">Target Date</Label>
                  <Input
                    id="pm-target-date"
                    type="date"
                    defaultValue={editingPaymentMilestone?.targetDate || ''}
                    data-testid="input-pm-target-date"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pm-invoice-status">Invoice Status</Label>
                <Select defaultValue={editingPaymentMilestone?.invoiceStatus || 'planned'}>
                  <SelectTrigger id="pm-invoice-status" data-testid="select-pm-invoice-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentMilestoneDialog(false);
                  setEditingPaymentMilestone(null);
                }}
                data-testid="button-cancel-pm"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const name = (document.getElementById('pm-name') as HTMLInputElement)?.value;
                  const description = (document.getElementById('pm-description') as HTMLTextAreaElement)?.value;
                  const amount = (document.getElementById('pm-amount') as HTMLInputElement)?.value;
                  const targetDate = (document.getElementById('pm-target-date') as HTMLInputElement)?.value;
                  const invoiceStatus = (document.querySelector('[data-testid="select-pm-invoice-status"] [role="combobox"]') as any)?.textContent?.toLowerCase() || 'planned';
                  
                  if (!name || !amount) {
                    toast({
                      title: "Validation Error",
                      description: "Please provide milestone name and amount",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  try {
                    const payload = {
                      projectId: id,
                      name,
                      description: description || null,
                      amount: parseFloat(amount),
                      targetDate: targetDate || null,
                      invoiceStatus,
                      isPaymentMilestone: true
                    };
                    
                    if (editingPaymentMilestone) {
                      await apiRequest(`/api/payment-milestones/${editingPaymentMilestone.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(payload)
                      });
                      toast({
                        title: "Success",
                        description: "Payment milestone updated successfully"
                      });
                    } else {
                      await apiRequest('/api/payment-milestones', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                      });
                      toast({
                        title: "Success",
                        description: "Payment milestone created successfully"
                      });
                    }
                    
                    setShowPaymentMilestoneDialog(false);
                    setEditingPaymentMilestone(null);
                    await queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/payment-milestones`] });
                    await queryClient.invalidateQueries({ queryKey: ['/api/payment-milestones/all'] });
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to save payment milestone",
                      variant: "destructive"
                    });
                  }
                }}
                data-testid="button-save-pm"
              >
                {editingPaymentMilestone ? 'Update' : 'Create'} Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generate Invoice from Payment Milestone Dialog */}
        <Dialog open={showMilestoneInvoiceDialog} onOpenChange={setShowMilestoneInvoiceDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Invoice from Payment Milestone</DialogTitle>
              <DialogDescription>
                Create an invoice batch for payment milestone: {generatingInvoiceForMilestone?.name}
                <br />
                <span className="font-semibold">Amount: ${Number(generatingInvoiceForMilestone?.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="invoice-start-date">Start Date</Label>
                <Input
                  id="invoice-start-date"
                  type="date"
                  value={milestoneInvoiceDates.startDate}
                  onChange={(e) => setMilestoneInvoiceDates(prev => ({ ...prev, startDate: e.target.value }))}
                  data-testid="input-milestone-invoice-start-date"
                />
              </div>
              <div>
                <Label htmlFor="invoice-end-date">End Date</Label>
                <Input
                  id="invoice-end-date"
                  type="date"
                  value={milestoneInvoiceDates.endDate}
                  onChange={(e) => setMilestoneInvoiceDates(prev => ({ ...prev, endDate: e.target.value }))}
                  data-testid="input-milestone-invoice-end-date"
                />
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Note</AlertTitle>
                <AlertDescription>
                  This will automatically create an invoice batch with a single line item for the milestone amount (${Number(generatingInvoiceForMilestone?.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). No time entries are required.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowMilestoneInvoiceDialog(false)}
                data-testid="button-cancel-generate-invoice"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const { startDate, endDate } = milestoneInvoiceDates;
                  
                  if (!startDate || !endDate) {
                    toast({
                      title: "Missing dates",
                      description: "Please select both start and end dates",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  setIsGeneratingInvoice(true);
                  
                  try {
                    const response = await apiRequest(
                      `/api/payment-milestones/${generatingInvoiceForMilestone.id}/generate-invoice`,
                      {
                        method: "POST",
                        body: JSON.stringify({ startDate, endDate })
                      }
                    );
                    
                    toast({
                      title: "Invoice batch created",
                      description: `Invoice batch ${response.batch.batchId} created successfully with milestone amount of $${Number(generatingInvoiceForMilestone?.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. No time entries required.`,
                    });
                    
                    setShowMilestoneInvoiceDialog(false);
                    
                    // Invalidate both project-specific and global payment milestone caches
                    await queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/payment-milestones`] });
                    await queryClient.invalidateQueries({ queryKey: ['/api/payment-milestones/all'] });
                    
                    // Navigate to invoice batch page using wouter
                    navigate(`/billing/batches/${response.batch.batchId}`);
                  } catch (error: any) {
                    toast({
                      title: "Failed to create invoice batch",
                      description: error.message || "An error occurred",
                      variant: "destructive"
                    });
                  } finally {
                    setIsGeneratingInvoice(false);
                  }
                }}
                disabled={isGeneratingInvoice}
                data-testid="button-confirm-generate-invoice"
              >
                {isGeneratingInvoice ? "Creating..." : "Generate Invoice Batch"}
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
                    <div><strong>Date:</strong> {safeFormatDate(timeEntryToDelete.date, "PPP")}</div>
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

        {/* Epic Dialog */}
        <Dialog open={showEpicDialog} onOpenChange={setShowEpicDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEpic ? "Edit Epic" : "Create New Epic"}</DialogTitle>
              <DialogDescription>
                {editingEpic 
                  ? "Update the epic details." 
                  : "Add a new epic to organize your project structure"}
              </DialogDescription>
            </DialogHeader>
            <Form {...epicForm}>
              <form name="project-epic-form" onSubmit={epicForm.handleSubmit(handleSubmitEpic)} className="space-y-4">
                <FormField
                  control={epicForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Phase 1 Development" data-testid="input-epic-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={epicForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Epic description..." data-testid="textarea-epic-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={epicForm.control}
                  name="order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="1" data-testid="input-epic-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowEpicDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createEpicMutation.isPending || updateEpicMutation.isPending}>
                    {editingEpic ? "Update" : "Create"} Epic
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Epic Confirmation Dialog */}
        <Dialog open={!!deletingEpicId} onOpenChange={() => setDeletingEpicId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Epic</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this epic? This action cannot be undone and will affect any associated milestones.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingEpicId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingEpicId) {
                    deleteEpicMutation.mutate(deletingEpicId);
                  }
                }}
                disabled={deleteEpicMutation.isPending}
                data-testid="button-confirm-delete-epic"
              >
                Delete Epic
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Budget Impact Confirmation Dialog */}
        <AlertDialog open={showBudgetImpactDialog} onOpenChange={setShowBudgetImpactDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve {approvingSow?.type === "initial" ? "SOW" : "Change Order"}</AlertDialogTitle>
              <AlertDialogDescription>
                Approving this {approvingSow?.type === "initial" ? "SOW" : "change order"} will update the project budget.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {approvingSow && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-sm">{approvingSow.name}</h4>
                  {approvingSow.description && (
                    <p className="text-sm text-muted-foreground">{approvingSow.description}</p>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Current Budget:</span>
                    <span className="font-semibold" data-testid="text-current-budget">
                      ${calculateBudgetImpact(approvingSow).currentBudget.toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {approvingSow.type === "initial" ? "SOW" : "Change Order"} Value:
                    </span>
                    <span className="font-semibold text-green-600" data-testid="text-sow-value">
                      +${calculateBudgetImpact(approvingSow).sowValue.toLocaleString()}
                    </span>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">New Budget:</span>
                    <span className="text-lg font-bold" data-testid="text-new-budget">
                      ${calculateBudgetImpact(approvingSow).newBudget.toLocaleString()}
                    </span>
                  </div>
                  
                  {calculateBudgetImpact(approvingSow).currentBudget > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Budget Increase:</span>
                      <span className="text-sm font-semibold text-green-600" data-testid="text-percentage-increase">
                        +{calculateBudgetImpact(approvingSow).percentageIncrease.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This action will permanently update the project budget and log the change to the budget history.
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={() => {
                  setShowBudgetImpactDialog(false);
                  setApprovingSow(null);
                }}
                data-testid="button-cancel-approve"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmApproval}
                disabled={approveSowMutation.isPending}
                data-testid="button-confirm-approve"
              >
                {approveSowMutation.isPending ? "Approving..." : "Approve & Update Budget"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Assignment Dialog */}
        <Dialog open={showAssignmentDialog} onOpenChange={(open) => {
          setShowAssignmentDialog(open);
          if (!open) setEditingAssignment(null);
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAssignment ? 'Edit' : 'Add'} Team Assignment</DialogTitle>
              <DialogDescription>
                {editingAssignment ? 'Update' : 'Assign'} a team member to this project with specific role and hours
              </DialogDescription>
            </DialogHeader>
            <form name="project-team-assignment-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const roleIdValue = formData.get('roleId') as string;
              const workstreamIdValue = formData.get('workstreamId') as string;
              const epicIdValue = formData.get('epicId') as string;
              const stageIdValue = formData.get('stageId') as string;
              
              const personIdValue = formData.get('personId') as string;
              const roleIdFinal = roleIdValue === 'none' ? undefined : roleIdValue || undefined;
              
              // Auto-determine pricing mode based on what's assigned
              let pricingMode: "role" | "person" | "resource_name" = "resource_name";
              if (personIdValue) {
                pricingMode = "person";
              } else if (roleIdFinal) {
                pricingMode = "role";
              }
              
              const data: AssignmentFormData = {
                personId: personIdValue,
                roleId: roleIdFinal,
                projectWorkstreamId: workstreamIdValue === 'none' ? undefined : workstreamIdValue || undefined,
                projectEpicId: epicIdValue === 'none' ? undefined : epicIdValue || undefined,
                projectStageId: stageIdValue === 'none' ? undefined : stageIdValue || undefined,
                hours: formData.get('hours') as string,
                pricingMode,
                startDate: formData.get('startDate') as string || undefined,
                endDate: formData.get('endDate') as string || undefined,
                taskDescription: formData.get('taskDescription') as string || undefined,
                notes: formData.get('notes') as string || undefined
              };
              
              if (editingAssignment) {
                updateAssignmentMutation.mutate({ allocationId: editingAssignment.id, data });
              } else {
                createAssignmentMutation.mutate(data);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="personId">Person *</Label>
                  <Select name="personId" defaultValue={editingAssignment?.personId} required>
                    <SelectTrigger data-testid="select-person">
                      <SelectValue placeholder="Select a person" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="roleId">Role</Label>
                  <Select name="roleId" defaultValue={editingAssignment?.roleId || "none"}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {roles.map((role: any) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workstreamId">Workstream</Label>
                  <Select name="workstreamId" defaultValue={editingAssignment?.projectWorkstreamId || "none"}>
                    <SelectTrigger data-testid="select-workstream">
                      <SelectValue placeholder="Select a workstream" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {workstreams.map((workstream: any) => (
                        <SelectItem key={workstream.id} value={workstream.id}>
                          {workstream.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="epicId">Epic</Label>
                  <Select name="epicId" defaultValue={editingAssignment?.projectEpicId || "none"}>
                    <SelectTrigger data-testid="select-epic">
                      <SelectValue placeholder="Select an epic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {epics.map((epic: any) => (
                        <SelectItem key={epic.id} value={epic.id}>
                          {epic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stageId">Stage</Label>
                  <Select name="stageId" defaultValue={editingAssignment?.projectStageId || "none"}>
                    <SelectTrigger data-testid="select-stage">
                      <SelectValue placeholder="Select a stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {stages.map((stage: any) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hours">Hours *</Label>
                  <Input 
                    name="hours" 
                    type="number" 
                    step="0.5"
                    placeholder="e.g., 40" 
                    defaultValue={editingAssignment?.hours}
                    required
                    data-testid="input-hours"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input 
                    name="startDate" 
                    type="date"
                    defaultValue={editingAssignment?.plannedStartDate}
                    data-testid="input-start-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input 
                    name="endDate" 
                    type="date"
                    defaultValue={editingAssignment?.plannedEndDate}
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taskDescription">Task/Activity Description</Label>
                <Input 
                  name="taskDescription"
                  placeholder="e.g., UI Design, Backend Development, Testing..."
                  defaultValue={editingAssignment?.taskDescription}
                  data-testid="input-task-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  name="notes"
                  placeholder="Additional notes about this assignment..."
                  defaultValue={editingAssignment?.notes}
                  data-testid="input-notes"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setShowAssignmentDialog(false);
                  setEditingAssignment(null);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}>
                  {editingAssignment 
                    ? (updateAssignmentMutation.isPending ? "Updating..." : "Update Assignment")
                    : (createAssignmentMutation.isPending ? "Creating..." : "Create Assignment")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Import Assignments Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Team Assignments</DialogTitle>
              <DialogDescription>
                Upload an Excel or CSV file with assignment data. The file should have columns for:
                Person Name, Role Name, Workstream, Epic, Stage, Hours, Pricing Mode, Start Date, End Date, Notes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Select File</Label>
                <Input 
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImportFile(file);
                      setImportError(null);
                    }
                  }}
                  data-testid="input-import-file"
                />
                {importFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {importFile.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="importMode">Import Mode</Label>
                <Select value={importMode} onValueChange={(v: "append" | "replace") => setImportMode(v)}>
                  <SelectTrigger data-testid="select-import-mode">
                    <SelectValue placeholder="Select import mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="append">Keep and Add - Append to existing assignments</SelectItem>
                    <SelectItem value="replace">Remove and Replace - Clear existing assignments first</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {importError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}

              <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                <p className="font-medium">Template Format:</p>
                <p className="text-muted-foreground">Row 1: Headers</p>
                <p className="text-muted-foreground">Row 2+: Data</p>
                <p className="text-muted-foreground mt-2">Example:</p>
                <div className="font-mono text-xs bg-background p-2 rounded">
                  <p>Person Name | Role Name | Workstream | Epic | Stage | Hours | Pricing Mode | Start Date | End Date | Notes</p>
                  <p>John Doe | Developer | Frontend | Phase 1 | Design | 40 | role | 2024-01-01 | 2024-01-31 | Working on UI</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setShowImportDialog(false);
                setImportFile(null);
                setImportError(null);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleImportFile} 
                disabled={!importFile || importAssignmentsMutation.isPending}
                data-testid="button-confirm-import"
              >
                {importAssignmentsMutation.isPending ? "Importing..." : "Import Assignments"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Team Member Dialog */}
        <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add a team member to this project without assigning them to a specific task.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="member-select">Select Team Member</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger id="member-select" data-testid="select-add-member">
                    <SelectValue placeholder="Select a team member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((user: any) => !engagements.some((e: any) => e.userId === user.id))
                      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                      .map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || 'Unknown'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddMemberDialog(false);
                  setSelectedMemberId("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => addTeamMemberMutation.mutate(selectedMemberId)}
                disabled={!selectedMemberId || addTeamMemberMutation.isPending}
                data-testid="button-confirm-add-member"
              >
                {addTeamMemberMutation.isPending ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Project Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>
                Update project details across different sections below.
              </DialogDescription>
            </DialogHeader>
            {projectToEdit && (
              <form name="edit-project-form" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                
                // Helper to get form value or fallback to existing project value
                const getFormValue = (name: string, fallback: any) => {
                  const value = formData.get(name);
                  // If value is null (field not in DOM due to collapsed accordion), use fallback
                  return value !== null ? String(value) : fallback;
                };
                
                const endDateValue = getFormValue('endDate', projectToEdit.endDate || '');
                const epicTermIdValue = getFormValue('epicTermId', projectToEdit.epicTermId || '__default__');
                const stageTermIdValue = getFormValue('stageTermId', projectToEdit.stageTermId || '__default__');
                const activityTermIdValue = getFormValue('activityTermId', projectToEdit.activityTermId || '__default__');
                const workstreamTermIdValue = getFormValue('workstreamTermId', projectToEdit.workstreamTermId || '__default__');
                const pmValue = getFormValue('pm', projectToEdit.pm || 'none');
                const hasSowValue = getFormValue('hasSow', projectToEdit.hasSow ? 'true' : 'false');
                
                editProject.mutate({
                  data: {
                    name: getFormValue('name', projectToEdit.name),
                    description: getFormValue('description', projectToEdit.description) || undefined,
                    clientId: getFormValue('clientId', projectToEdit.clientId),
                    code: getFormValue('code', projectToEdit.code),
                    startDate: getFormValue('startDate', projectToEdit.startDate) || undefined,
                    endDate: endDateValue && endDateValue.trim() !== '' ? endDateValue : undefined,
                    commercialScheme: getFormValue('commercialScheme', projectToEdit.commercialScheme),
                    status: getFormValue('status', projectToEdit.status),
                    pm: pmValue === 'none' ? null : pmValue,
                    hasSow: hasSowValue === 'true',
                    retainerTotal: getFormValue('retainerTotal', projectToEdit.retainerTotal) || undefined,
                    epicTermId: epicTermIdValue && epicTermIdValue !== '__default__' ? epicTermIdValue : null,
                    stageTermId: stageTermIdValue && stageTermIdValue !== '__default__' ? stageTermIdValue : null,
                    activityTermId: activityTermIdValue && activityTermIdValue !== '__default__' ? activityTermIdValue : null,
                    workstreamTermId: workstreamTermIdValue && workstreamTermIdValue !== '__default__' ? workstreamTermIdValue : null,
                  }
                });
              }}>
                <Accordion type="multiple" defaultValue={["basic", "status"]} className="w-full">
                  {/* Basic Information Section */}
                  <AccordionItem value="basic">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Basic Information
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-name">Project Name</Label>
                        <Input
                          id="edit-name"
                          name="name"
                          defaultValue={projectToEdit.name}
                          required
                          data-testid="input-edit-project-name"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="edit-description">Description / Summary</Label>
                        <textarea
                          id="edit-description"
                          name="description"
                          defaultValue={projectToEdit.description || ""}
                          placeholder="Vision statement or project overview"
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid="textarea-edit-description"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-code">Project Code</Label>
                          <Input
                            id="edit-code"
                            name="code"
                            defaultValue={projectToEdit.code}
                            required
                            data-testid="input-edit-project-code"
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="edit-clientId">Client</Label>
                          <Select name="clientId" defaultValue={projectToEdit.clientId} required>
                            <SelectTrigger data-testid="select-edit-client">
                              <SelectValue placeholder="Select a client" />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map(client => (
                                <SelectItem key={client.id} value={client.id}>
                                  {client.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Status & Team Section */}
                  <AccordionItem value="status">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Status & Team
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-status">Status</Label>
                          <Select name="status" defaultValue={projectToEdit.status} required>
                            <SelectTrigger data-testid="select-edit-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="on track">On Track</SelectItem>
                              <SelectItem value="at risk">At Risk</SelectItem>
                              <SelectItem value="delayed">Delayed</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="on hold">On Hold</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="edit-pm">Project Manager</Label>
                          <Select name="pm" defaultValue={projectToEdit.pm || "none"}>
                            <SelectTrigger id="edit-pm" data-testid="select-edit-pm">
                              <SelectValue placeholder="Select project manager" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No PM Assigned</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Timeline Section */}
                  <AccordionItem value="timeline">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Timeline
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-startDate">Start Date</Label>
                          <Input
                            id="edit-startDate"
                            name="startDate"
                            type="date"
                            defaultValue={projectToEdit.startDate ? new Date(projectToEdit.startDate).toISOString().split('T')[0] : ""}
                            data-testid="input-edit-start-date"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="edit-endDate">End Date</Label>
                          <Input
                            id="edit-endDate"
                            name="endDate"
                            type="date"
                            defaultValue={projectToEdit.endDate ? new Date(projectToEdit.endDate).toISOString().split('T')[0] : ""}
                            data-testid="input-edit-end-date"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Commercial Section */}
                  <AccordionItem value="commercial">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Commercial & Contracts
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-commercialScheme">Commercial Scheme</Label>
                        <Select name="commercialScheme" defaultValue={projectToEdit.commercialScheme || ""}>
                          <SelectTrigger data-testid="select-edit-commercial-scheme">
                            <SelectValue placeholder="Select scheme" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="time-and-materials">Time & Materials</SelectItem>
                            <SelectItem value="fixed-price">Fixed Price</SelectItem>
                            <SelectItem value="retainer">Retainer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {projectToEdit.commercialScheme === 'retainer' && (
                        <div className="grid gap-2">
                          <Label htmlFor="edit-retainerTotal">Retainer Total ($)</Label>
                          <Input
                            id="edit-retainerTotal"
                            name="retainerTotal"
                            type="number"
                            defaultValue={projectToEdit.retainerTotal || ""}
                            data-testid="input-edit-retainer-total"
                          />
                        </div>
                      )}

                      <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                        <input
                          type="checkbox"
                          id="edit-hasSow"
                          name="hasSow"
                          value="true"
                          defaultChecked={projectToEdit.hasSow}
                          className="h-4 w-4 rounded border-gray-300"
                          data-testid="checkbox-edit-has-sow"
                        />
                        <Label htmlFor="edit-hasSow" className="text-sm font-normal">
                          Statement of Work (SOW) has been signed
                        </Label>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Vocabulary Customization Section */}
                  {vocabularyCatalog.length > 0 && (
                    <AccordionItem value="vocabulary">
                      <AccordionTrigger className="text-base font-semibold">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Vocabulary Customization
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-2">
                        <p className="text-sm text-muted-foreground">
                          Customize terminology for this project. If not set, client or organization defaults will be used.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-epicTermId">Epic Term</Label>
                            <Select 
                              name="epicTermId" 
                              defaultValue={projectToEdit.epicTermId || effectiveClientDefaults.epicTermId || "__default__"}
                            >
                              <SelectTrigger data-testid="select-edit-epic-term">
                                <SelectValue placeholder="Select epic term" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">None (use client/org default{effectiveClientDefaults.epicTermId ? ` - ${getTermValueById(effectiveClientDefaults.epicTermId)}` : ''})</SelectItem>
                                {vocabularyTermsByType.epicTerms?.map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="edit-stageTermId">Stage Term</Label>
                            <Select 
                              name="stageTermId" 
                              defaultValue={projectToEdit.stageTermId || effectiveClientDefaults.stageTermId || "__default__"}
                            >
                              <SelectTrigger data-testid="select-edit-stage-term">
                                <SelectValue placeholder="Select stage term" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">None (use client/org default{effectiveClientDefaults.stageTermId ? ` - ${getTermValueById(effectiveClientDefaults.stageTermId)}` : ''})</SelectItem>
                                {vocabularyTermsByType.stageTerms?.map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="edit-activityTermId">Activity Term</Label>
                            <Select 
                              name="activityTermId" 
                              defaultValue={projectToEdit.activityTermId || effectiveClientDefaults.activityTermId || "__default__"}
                            >
                              <SelectTrigger data-testid="select-edit-activity-term">
                                <SelectValue placeholder="Select activity term" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">None (use client/org default{effectiveClientDefaults.activityTermId ? ` - ${getTermValueById(effectiveClientDefaults.activityTermId)}` : ''})</SelectItem>
                                {vocabularyTermsByType.activityTerms?.map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="edit-workstreamTermId">Workstream Term</Label>
                            <Select 
                              name="workstreamTermId" 
                              defaultValue={projectToEdit.workstreamTermId || effectiveClientDefaults.workstreamTermId || "__default__"}
                            >
                              <SelectTrigger data-testid="select-edit-workstream-term">
                                <SelectValue placeholder="Select workstream term" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">None (use client/org default{effectiveClientDefaults.workstreamTermId ? ` - ${getTermValueById(effectiveClientDefaults.workstreamTermId)}` : ''})</SelectItem>
                                {vocabularyTermsByType.workstreamTerms?.map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>

                <DialogFooter className="mt-6">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editProject.isPending} data-testid="button-save-project">
                    {editProject.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Status Report Dialog */}
        <StatusReportDialog
          open={showStatusReport}
          onOpenChange={setShowStatusReport}
          projectId={id || ""}
          projectName={analytics?.project?.name || ""}
        />

        {/* Export Report Dialog */}
        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Export Project Report</DialogTitle>
              <DialogDescription>
                Generate a text summary of project data for copy/paste into other systems
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <RadioGroup value={exportDateRange} onValueChange={(value: any) => setExportDateRange(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="range-all" data-testid="radio-range-all" />
                    <Label htmlFor="range-all" className="font-normal cursor-pointer">Entire Project</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="month" id="range-month" data-testid="radio-range-month" />
                    <Label htmlFor="range-month" className="font-normal cursor-pointer">Current Month</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="range-custom" data-testid="radio-range-custom" />
                    <Label htmlFor="range-custom" className="font-normal cursor-pointer">Custom Date Range</Label>
                  </div>
                </RadioGroup>
              </div>

              {exportDateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="export-start-date">Start Date</Label>
                    <Input
                      id="export-start-date"
                      type="date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      data-testid="input-export-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="export-end-date">End Date</Label>
                    <Input
                      id="export-end-date"
                      type="date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      data-testid="input-export-end-date"
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExportDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                let startDate: string | undefined;
                let endDate: string | undefined;

                if (exportDateRange === 'month') {
                  const now = new Date();
                  startDate = startOfMonth(now).toISOString().split('T')[0];
                  endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                } else if (exportDateRange === 'custom') {
                  startDate = exportStartDate || undefined;
                  endDate = exportEndDate || undefined;
                }

                handleExportText(startDate, endDate);
                setShowExportDialog(false);
              }} data-testid="button-confirm-export">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Membership Completion Confirmation Dialog - Only shows when user has active allocations */}
        <AlertDialog open={!!engagementToComplete} onOpenChange={(open) => !open && setEngagementToComplete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Team Member Has Active Assignments
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{engagementToComplete?.userName}</strong> still has active assignments on this project. 
                Are you sure you want to mark their membership as complete?
                <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                  <p className="font-medium mb-1">What happens when you mark complete:</p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li>They won't receive time entry reminders for this project</li>
                    <li>Their active assignments will remain unchanged</li>
                    <li>They can be reactivated manually or automatically if assigned new work</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-engagement-completion">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => engagementToComplete && completeEngagementMutation.mutate({ 
                  userId: engagementToComplete.userId, 
                  force: true 
                })}
                className="bg-amber-600 hover:bg-amber-700"
                disabled={completeEngagementMutation.isPending}
                data-testid="button-confirm-engagement-completion"
              >
                {completeEngagementMutation.isPending ? "Completing..." : "Yes, Mark Complete Anyway"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
    </ProjectDetailErrorBoundary>
  );
}