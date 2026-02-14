import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatBusinessDate } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Shield, AlertTriangle, Scale, Link2, CheckSquare, Plus, MoreHorizontal,
  Edit, Trash2, ArrowRightLeft, Replace, ChevronDown, ChevronUp, X,
  ArrowUpDown, Calendar, User, Tag, Sparkles, Brain, FileText, Loader2,
  Download, Upload
} from "lucide-react";

interface RaiddEntry {
  id: string;
  tenantId: string;
  projectId: string;
  type: string;
  refNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  impact: string | null;
  likelihood: string | null;
  ownerId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  closedAt: Date | null;
  category: string | null;
  mitigationPlan: string | null;
  resolutionNotes: string | null;
  parentEntryId: string | null;
  convertedFromId: string | null;
  supersededById: string | null;
  tags: string[] | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerName?: string;
  assigneeName?: string;
  createdByName?: string;
}

interface RaiddEntryDetail extends RaiddEntry {
  children?: RaiddEntry[];
  convertedFrom?: RaiddEntry;
  supersededBy?: RaiddEntry;
}

interface RaiddLogTabProps {
  projectId: string;
  projectTeamMembers?: { id: string; name: string }[];
}

const RAIDD_TYPES = [
  { value: "risk", label: "Risk", icon: Shield },
  { value: "issue", label: "Issue", icon: AlertTriangle },
  { value: "decision", label: "Decision", icon: Scale },
  { value: "dependency", label: "Dependency", icon: Link2 },
  { value: "action_item", label: "Action Item", icon: CheckSquare },
] as const;

const RAIDD_STATUSES = [
  "open", "in_progress", "mitigated", "closed", "deferred", "superseded", "resolved", "accepted"
] as const;

const RAIDD_PRIORITIES = ["critical", "high", "medium", "low"] as const;
const RAIDD_IMPACTS = ["critical", "high", "medium", "low"] as const;
const RAIDD_LIKELIHOODS = ["almost_certain", "likely", "possible", "unlikely", "rare"] as const;

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  mitigated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400",
  deferred: "bg-slate-100 text-slate-800 dark:bg-slate-700/30 dark:text-slate-400",
  superseded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function getTypeIcon(type: string) {
  const found = RAIDD_TYPES.find(t => t.value === type);
  if (!found) return null;
  const Icon = found.icon;
  return <Icon className="h-4 w-4" />;
}

function getTypeLabel(type: string) {
  const found = RAIDD_TYPES.find(t => t.value === type);
  return found?.label || type;
}

function formatLabel(value: string) {
  return value.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const raiddFormSchema = z.object({
  type: z.enum(["risk", "issue", "decision", "dependency", "action_item"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.string().default("open"),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  impact: z.string().optional(),
  likelihood: z.string().optional(),
  ownerId: z.string().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
  mitigationPlan: z.string().optional(),
  resolutionNotes: z.string().optional(),
  parentEntryId: z.string().optional(),
  tags: z.string().optional(),
});

type RaiddFormData = z.infer<typeof raiddFormSchema>;

export function RaiddLogTab({ projectId, projectTeamMembers = [] }: RaiddLogTabProps) {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RaiddEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [createWithType, setCreateWithType] = useState<string | null>(null);
  const [createWithParent, setCreateWithParent] = useState<string | null>(null);
  const [supersedeEntryId, setSupersedeEntryId] = useState<string | null>(null);

  const [showIngestTextDialog, setShowIngestTextDialog] = useState(false);
  const [showExtractDecisionsDialog, setShowExtractDecisionsDialog] = useState(false);
  const [showAiReviewDialog, setShowAiReviewDialog] = useState(false);
  const [aiReviewItems, setAiReviewItems] = useState<any[]>([]);
  const [aiReviewTitle, setAiReviewTitle] = useState("");
  const [showSuggestMitigationDialog, setShowSuggestMitigationDialog] = useState(false);
  const [suggestMitigationEntry, setSuggestMitigationEntry] = useState<RaiddEntry | null>(null);
  const [aiSuggestionResult, setAiSuggestionResult] = useState<any>(null);
  const [showSuggestActionsDialog, setShowSuggestActionsDialog] = useState(false);
  const [suggestActionsEntry, setSuggestActionsEntry] = useState<RaiddEntry | null>(null);
  const [aiSuggestedActions, setAiSuggestedActions] = useState<any[]>([]);

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[]; total: number } | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    return params.toString();
  }, [typeFilter, statusFilter, priorityFilter]);

  const listQueryKey = [`/api/projects/${projectId}/raidd${queryParams ? `?${queryParams}` : ""}`];

  const { data: entries = [], isLoading } = useQuery<RaiddEntry[]>({
    queryKey: listQueryKey,
    enabled: !!projectId,
  });

  const { data: allEntries = [] } = useQuery<RaiddEntry[]>({
    queryKey: [`/api/projects/${projectId}/raidd`],
    enabled: !!projectId,
  });

  const { data: clientStakeholders = [] } = useQuery<{ id: string; name: string; email: string; stakeholderTitle: string | null }[]>({
    queryKey: [`/api/projects/${projectId}/stakeholders`],
    enabled: !!projectId,
  });

  const { data: entryDetail } = useQuery<RaiddEntryDetail>({
    queryKey: ["/api/raidd", expandedEntryId],
    enabled: !!expandedEntryId,
  });

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "priority") {
        cmp = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
      } else if (sortField === "dueDate") {
        const da = a.dueDate || "9999-99-99";
        const db = b.dueDate || "9999-99-99";
        cmp = da.localeCompare(db);
      } else if (sortField === "refNumber") {
        cmp = (a.refNumber || "").localeCompare(b.refNumber || "");
      } else if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "type") {
        cmp = a.type.localeCompare(b.type);
      } else if (sortField === "status") {
        cmp = a.status.localeCompare(b.status);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [entries, sortField, sortDir]);

  const summaryCounts = useMemo(() => {
    const openEntries = allEntries.filter(e => e.status === "open" || e.status === "in_progress");
    return {
      R: openEntries.filter(e => e.type === "risk").length,
      I: openEntries.filter(e => e.type === "issue").length,
      D: openEntries.filter(e => e.type === "decision").length,
      Dep: openEntries.filter(e => e.type === "dependency").length,
      A: openEntries.filter(e => e.type === "action_item").length,
    };
  }, [allEntries]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/projects/${projectId}/raidd`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
      toast({ title: "Created", description: "RAIDD entry created successfully" });
      setShowCreateDialog(false);
      setCreateWithType(null);
      setCreateWithParent(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/raidd/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
      if (expandedEntryId) {
        queryClient.invalidateQueries({ queryKey: ["/api/raidd", expandedEntryId] });
      }
      toast({ title: "Updated", description: "RAIDD entry updated successfully" });
      setEditingEntry(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/raidd/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
      toast({ title: "Deleted", description: "RAIDD entry deleted" });
      setDeletingEntryId(null);
      if (expandedEntryId === deletingEntryId) setExpandedEntryId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const convertToIssueMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/raidd/${id}/convert-to-issue`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
      toast({ title: "Converted", description: "Risk converted to issue" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const supersedeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/raidd/${id}/supersede`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
      toast({ title: "Superseded", description: "Decision superseded with new entry" });
      setSupersedeEntryId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const ingestTextMutation = useMutation({
    mutationFn: async (data: { text: string; projectContext?: string }) => {
      const res = await apiRequest("/api/raidd/ai/ingest-text", {
        method: "POST",
        body: JSON.stringify({ ...data, projectId }),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const items = data.items || data.entries || [];
      setAiReviewItems(items.map((item: any, idx: number) => ({ ...item, selected: true, id: `ai-${idx}` })));
      setAiReviewTitle("AI-Detected RAIDD Items");
      setShowIngestTextDialog(false);
      setShowAiReviewDialog(true);
    },
    onError: (error: Error) => {
      toast({ title: "AI Analysis Failed", description: error.message, variant: "destructive" });
    },
  });

  const extractDecisionsMutation = useMutation({
    mutationFn: async (data: { text: string }) => {
      const res = await apiRequest("/api/raidd/ai/extract-decisions", {
        method: "POST",
        body: JSON.stringify({ ...data, projectId }),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const items = data.decisions || data.items || [];
      setAiReviewItems(items.map((item: any, idx: number) => ({ ...item, type: "decision", selected: true, id: `ai-${idx}` })));
      setAiReviewTitle("Extracted Decisions");
      setShowExtractDecisionsDialog(false);
      setShowAiReviewDialog(true);
    },
    onError: (error: Error) => {
      toast({ title: "Decision Extraction Failed", description: error.message, variant: "destructive" });
    },
  });

  const suggestMitigationMutation = useMutation({
    mutationFn: async (entry: RaiddEntry) => {
      const res = await apiRequest("/api/raidd/ai/suggest-mitigation", {
        method: "POST",
        body: JSON.stringify({ entryId: entry.id, type: entry.type, title: entry.title, description: entry.description, projectId }),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setAiSuggestionResult(data);
      setShowSuggestMitigationDialog(true);
    },
    onError: (error: Error) => {
      toast({ title: "AI Suggestion Failed", description: error.message, variant: "destructive" });
    },
  });

  const suggestActionsMutation = useMutation({
    mutationFn: async (entry: RaiddEntry) => {
      const res = await apiRequest("/api/raidd/ai/suggest-actions", {
        method: "POST",
        body: JSON.stringify({ entryId: entry.id, type: entry.type, title: entry.title, description: entry.description, projectId }),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const actions = data.actions || data.actionItems || [];
      setAiSuggestedActions(actions.map((a: any, idx: number) => ({ ...a, selected: true, id: `action-${idx}` })));
      setShowSuggestActionsDialog(true);
    },
    onError: (error: Error) => {
      toast({ title: "AI Suggestion Failed", description: error.message, variant: "destructive" });
    },
  });

  const batchCreateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const results = [];
      for (const item of items) {
        const res = await apiRequest(`/api/projects/${projectId}/raidd`, {
          method: "POST",
          body: JSON.stringify(item),
        });
        results.push(res);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
      toast({ title: "Created", description: "Selected items created successfully" });
      setShowAiReviewDialog(false);
      setShowSuggestActionsDialog(false);
      setAiReviewItems([]);
      setAiSuggestedActions([]);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function handleAddActionItem(parentId: string) {
    setCreateWithType("action_item");
    setCreateWithParent(parentId);
    setShowCreateDialog(true);
  }

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/raidd/export`, {
        headers: { 'x-session-id': localStorage.getItem('sessionId') || '' },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || 'RAIDD-Export.xlsx';
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "RAIDD log exported to Excel" });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/raidd/template`, {
        headers: { 'x-session-id': localStorage.getItem('sessionId') || '' },
      });
      if (!response.ok) throw new Error('Template download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'RAIDD-Import-Template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const buffer = await importFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const response = await apiRequest(`/api/projects/${projectId}/raidd/import`, {
        method: 'POST',
        body: JSON.stringify({ file: base64 }),
      });
      const result = response as any;
      setImportResult(result);
      if (result.created > 0) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/raidd`] });
        toast({ title: "Import complete", description: `${result.created} of ${result.total} entries imported successfully` });
      }
      if (result.errors?.length > 0 && result.created === 0) {
        toast({ title: "Import failed", description: `All ${result.total} rows had errors`, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">RAIDD Log</CardTitle>
            <div className="flex gap-1.5">
              {summaryCounts.R > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">R:{summaryCounts.R}</Badge>}
              {summaryCounts.I > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">I:{summaryCounts.I}</Badge>}
              {summaryCounts.D > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">D:{summaryCounts.D}</Badge>}
              {summaryCounts.Dep > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">Dep:{summaryCounts.Dep}</Badge>}
              {summaryCounts.A > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">A:{summaryCounts.A}</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Sparkles className="h-4 w-4 mr-1" /> AI Assistant <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowIngestTextDialog(true)}>
                  <Brain className="h-4 w-4 mr-2" /> Analyze Text for RAIDD Items
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowExtractDecisionsDialog(true)}>
                  <FileText className="h-4 w-4 mr-2" /> Extract Decisions from Document
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1" /> Excel <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
                  {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Export RAIDD Log
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setImportFile(null); setImportResult(null); setShowImportDialog(true); }}>
                  <Upload className="h-4 w-4 mr-2" /> Import from Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadTemplate}>
                  <FileText className="h-4 w-4 mr-2" /> Download Import Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => { setCreateWithType(null); setCreateWithParent(null); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New Entry
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant={typeFilter === "all" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTypeFilter("all")}>All</Button>
            {RAIDD_TYPES.map(t => (
              <Button key={t.value} size="sm" variant={typeFilter === t.value ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTypeFilter(t.value)}>
                <t.icon className="h-3 w-3 mr-1" /> {t.label}
              </Button>
            ))}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {RAIDD_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {RAIDD_PRIORITIES.map(p => (
                <SelectItem key={p} value={p}>{formatLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No RAIDD entries found</p>
            <p className="text-sm mt-1">Create your first entry to start tracking risks, issues, actions, decisions, and dependencies.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[80px] cursor-pointer select-none" onClick={() => handleSort("refNumber")}>
                    <span className="flex items-center">Ref# <SortIcon field="refNumber" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("type")}>
                    <span className="flex items-center">Type <SortIcon field="type" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("title")}>
                    <span className="flex items-center">Title <SortIcon field="title" /></span>
                  </TableHead>
                  <TableHead className="w-[100px] cursor-pointer select-none" onClick={() => handleSort("priority")}>
                    <span className="flex items-center">Priority <SortIcon field="priority" /></span>
                  </TableHead>
                  <TableHead className="w-[110px] cursor-pointer select-none" onClick={() => handleSort("status")}>
                    <span className="flex items-center">Status <SortIcon field="status" /></span>
                  </TableHead>
                  <TableHead className="w-[120px]">Owner</TableHead>
                  <TableHead className="w-[100px] cursor-pointer select-none" onClick={() => handleSort("dueDate")}>
                    <span className="flex items-center">Due Date <SortIcon field="dueDate" /></span>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntries.map(entry => (
                  <TableRow
                    key={entry.id}
                    className={`cursor-pointer transition-colors ${expandedEntryId === entry.id ? "bg-gray-50 dark:bg-gray-800/50" : ""}`}
                    onClick={() => setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id)}
                  >
                    <TableCell className="font-mono text-xs text-gray-500 dark:text-gray-400">{entry.refNumber || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        {getTypeIcon(entry.type)}
                        <span>{getTypeLabel(entry.type)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100 max-w-[250px] truncate">{entry.title}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${priorityColors[entry.priority] || ""}`}>{formatLabel(entry.priority)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[entry.status] || ""}`}>{formatLabel(entry.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">{entry.ownerName || "-"}</TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">{entry.dueDate ? formatBusinessDate(entry.dueDate, "MMM d") : "-"}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingEntry(entry)}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAddActionItem(entry.id)}>
                            <CheckSquare className="h-4 w-4 mr-2" /> Add Action Item
                          </DropdownMenuItem>
                          {entry.type === "risk" && (
                            <DropdownMenuItem onClick={() => convertToIssueMutation.mutate(entry.id)}>
                              <ArrowRightLeft className="h-4 w-4 mr-2" /> Convert to Issue
                            </DropdownMenuItem>
                          )}
                          {entry.type === "decision" && (
                            <DropdownMenuItem onClick={() => setSupersedeEntryId(entry.id)}>
                              <Replace className="h-4 w-4 mr-2" /> Supersede
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {entry.type === "risk" && (
                            <DropdownMenuItem onClick={() => { setSuggestMitigationEntry(entry); suggestMitigationMutation.mutate(entry); }}>
                              <Sparkles className="h-4 w-4 mr-2" /> AI: Suggest Mitigation
                            </DropdownMenuItem>
                          )}
                          {entry.type === "issue" && (
                            <DropdownMenuItem onClick={() => { setSuggestMitigationEntry(entry); suggestMitigationMutation.mutate(entry); }}>
                              <Sparkles className="h-4 w-4 mr-2" /> AI: Suggest Resolution
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setSuggestActionsEntry(entry); suggestActionsMutation.mutate(entry); }}>
                            <Brain className="h-4 w-4 mr-2" /> AI: Suggest Action Items
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 dark:text-red-400" onClick={() => setDeletingEntryId(entry.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {expandedEntryId && entryDetail && (
          <DetailPanel
            entry={entryDetail}
            onClose={() => setExpandedEntryId(null)}
            onEdit={() => setEditingEntry(entryDetail)}
            onAddAction={() => handleAddActionItem(entryDetail.id)}
          />
        )}
      </CardContent>

      <RaiddFormDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) { setCreateWithType(null); setCreateWithParent(null); }
        }}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        projectEntries={allEntries}
        teamMembers={projectTeamMembers}
        clientStakeholders={clientStakeholders}
        defaultType={createWithType}
        defaultParentId={createWithParent}
      />

      <RaiddFormDialog
        open={!!editingEntry}
        onOpenChange={(open) => { if (!open) setEditingEntry(null); }}
        onSubmit={(data) => editingEntry && updateMutation.mutate({ id: editingEntry.id, data })}
        isPending={updateMutation.isPending}
        entry={editingEntry}
        projectEntries={allEntries}
        teamMembers={projectTeamMembers}
        clientStakeholders={clientStakeholders}
        isEdit
      />

      <SupersedeDialog
        open={!!supersedeEntryId}
        onOpenChange={(open) => { if (!open) setSupersedeEntryId(null); }}
        entryId={supersedeEntryId}
        onSubmit={(data) => supersedeEntryId && supersedeMutation.mutate({ id: supersedeEntryId, data })}
        isPending={supersedeMutation.isPending}
      />

      <IngestTextDialog
        open={showIngestTextDialog}
        onOpenChange={setShowIngestTextDialog}
        onSubmit={(data) => ingestTextMutation.mutate(data)}
        isPending={ingestTextMutation.isPending}
      />

      <ExtractDecisionsDialog
        open={showExtractDecisionsDialog}
        onOpenChange={setShowExtractDecisionsDialog}
        onSubmit={(data) => extractDecisionsMutation.mutate(data)}
        isPending={extractDecisionsMutation.isPending}
      />

      <AiReviewDialog
        open={showAiReviewDialog}
        onOpenChange={setShowAiReviewDialog}
        title={aiReviewTitle}
        items={aiReviewItems}
        onItemsChange={setAiReviewItems}
        onCreateSelected={(items) => {
          const toCreate = items.filter(i => i.selected).map(({ selected, id, ...rest }: any) => rest);
          if (toCreate.length > 0) batchCreateMutation.mutate(toCreate);
        }}
        isPending={batchCreateMutation.isPending}
      />

      <SuggestMitigationDialog
        open={showSuggestMitigationDialog}
        onOpenChange={setShowSuggestMitigationDialog}
        entry={suggestMitigationEntry}
        suggestion={aiSuggestionResult}
        isPending={suggestMitigationMutation.isPending}
        onApply={(patchData, actionItems) => {
          if (suggestMitigationEntry) {
            updateMutation.mutate({ id: suggestMitigationEntry.id, data: patchData });
            if (actionItems && actionItems.length > 0) {
              const items = actionItems.map((a: any) => ({
                type: "action_item",
                title: a.title,
                description: a.description,
                priority: a.priority || "medium",
                status: "open",
                parentEntryId: suggestMitigationEntry.id,
              }));
              batchCreateMutation.mutate(items);
            }
          }
          setShowSuggestMitigationDialog(false);
        }}
      />

      <SuggestActionsDialog
        open={showSuggestActionsDialog}
        onOpenChange={setShowSuggestActionsDialog}
        entry={suggestActionsEntry}
        actions={aiSuggestedActions}
        onActionsChange={setAiSuggestedActions}
        onCreateSelected={(actions) => {
          const toCreate = actions.filter(a => a.selected).map(({ selected, id, ...rest }: any) => ({
            type: "action_item",
            title: rest.title,
            description: rest.description,
            priority: rest.priority || "medium",
            status: "open",
            parentEntryId: suggestActionsEntry?.id,
          }));
          if (toCreate.length > 0) batchCreateMutation.mutate(toCreate);
        }}
        isPending={batchCreateMutation.isPending}
      />

      <AlertDialog open={!!deletingEntryId} onOpenChange={(open) => { if (!open) setDeletingEntryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RAIDD Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry? This action cannot be undone. Entries with child action items cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingEntryId && deleteMutation.mutate(deletingEntryId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import RAIDD Entries from Excel</DialogTitle>
            <DialogDescription>
              Upload an Excel file to bulk-import RAIDD entries. Use the template for the correct format.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
                data-testid="input-import-file"
              />
            </div>
            <Button variant="link" className="h-auto p-0 text-sm" onClick={handleDownloadTemplate}>
              <Download className="h-3 w-3 mr-1" /> Download import template
            </Button>
            {importResult && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={importResult.created > 0 ? "default" : "destructive"}>
                    {importResult.created} of {importResult.total} imported
                  </Badge>
                  {importResult.errors.length > 0 && (
                    <Badge variant="outline" className="text-red-600">{importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''}</Badge>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-red-600 dark:text-red-400">
                        Row {err.row}: {err.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={!importFile || isImporting}>
              {isImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</> : <><Upload className="h-4 w-4 mr-1" /> Import</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DetailPanel({
  entry,
  onClose,
  onEdit,
  onAddAction,
}: {
  entry: RaiddEntryDetail;
  onClose: () => void;
  onEdit: () => void;
  onAddAction: () => void;
}) {
  return (
    <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/30">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getTypeIcon(entry.type)}
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{entry.title}</h3>
          {entry.refNumber && (
            <Badge variant="outline" className="text-xs">{entry.refNumber}</Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">Type</span>
          <span className="text-gray-900 dark:text-gray-100">{getTypeLabel(entry.type)}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">Priority</span>
          <Badge className={`text-xs ${priorityColors[entry.priority] || ""}`}>{formatLabel(entry.priority)}</Badge>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">Status</span>
          <Badge className={`text-xs ${statusColors[entry.status] || ""}`}>{formatLabel(entry.status)}</Badge>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">Due Date</span>
          <span className="text-gray-900 dark:text-gray-100">{entry.dueDate ? formatBusinessDate(entry.dueDate) : "Not set"}</span>
        </div>
        {entry.impact && (
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-xs">Impact</span>
            <span className="text-gray-900 dark:text-gray-100">{formatLabel(entry.impact)}</span>
          </div>
        )}
        {entry.likelihood && (
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-xs">Likelihood</span>
            <span className="text-gray-900 dark:text-gray-100">{formatLabel(entry.likelihood)}</span>
          </div>
        )}
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">Owner</span>
          <span className="text-gray-900 dark:text-gray-100">{entry.ownerName || "Unassigned"}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">Assignee</span>
          <span className="text-gray-900 dark:text-gray-100">{entry.assigneeName || "Unassigned"}</span>
        </div>
        {entry.category && (
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-xs">Category</span>
            <span className="text-gray-900 dark:text-gray-100">{entry.category}</span>
          </div>
        )}
      </div>

      {entry.description && (
        <div className="mb-3">
          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-1">Description</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.description}</p>
        </div>
      )}

      {entry.mitigationPlan && (
        <div className="mb-3">
          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-1">Mitigation Plan</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.mitigationPlan}</p>
        </div>
      )}

      {entry.resolutionNotes && (
        <div className="mb-3">
          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-1">Resolution Notes</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.resolutionNotes}</p>
        </div>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-gray-400" />
          {entry.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
      )}

      <Separator className="my-3" />

      {entry.convertedFrom && (
        <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
          <span className="text-blue-600 dark:text-blue-400 font-medium">Converted from:</span>{" "}
          <span className="text-gray-700 dark:text-gray-300">{entry.convertedFrom.refNumber} - {entry.convertedFrom.title}</span>
        </div>
      )}

      {entry.supersededBy && (
        <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <span className="text-purple-600 dark:text-purple-400 font-medium">Superseded by:</span>{" "}
          <span className="text-gray-700 dark:text-gray-300">{entry.supersededBy.refNumber} - {entry.supersededBy.title}</span>
        </div>
      )}

      {entry.children && entry.children.length > 0 && (
        <div className="mb-3">
          <span className="text-gray-500 dark:text-gray-400 text-xs block mb-2">Action Items ({entry.children.length})</span>
          <div className="space-y-1">
            {entry.children.map(child => (
              <div key={child.id} className="flex items-center gap-2 text-sm p-1.5 bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                <CheckSquare className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-mono text-xs text-gray-400">{child.refNumber}</span>
                <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{child.title}</span>
                <Badge className={`text-xs ${statusColors[child.status] || ""}`}>{formatLabel(child.status)}</Badge>
                <Badge className={`text-xs ${priorityColors[child.priority] || ""}`}>{formatLabel(child.priority)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" className="text-xs" onClick={onAddAction}>
        <Plus className="h-3 w-3 mr-1" /> Add Action Item
      </Button>
    </div>
  );
}

function RaiddFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  entry,
  projectEntries = [],
  teamMembers = [],
  clientStakeholders = [],
  isEdit = false,
  defaultType,
  defaultParentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
  entry?: RaiddEntry | null;
  projectEntries?: RaiddEntry[];
  teamMembers?: { id: string; name: string }[];
  clientStakeholders?: { id: string; name: string; stakeholderTitle?: string | null }[];
  isEdit?: boolean;
  defaultType?: string | null;
  defaultParentId?: string | null;
}) {
  const isDecisionReadOnly = isEdit && entry?.type === "decision" && entry?.status !== "open";

  const form = useForm<RaiddFormData>({
    resolver: zodResolver(raiddFormSchema),
    defaultValues: {
      type: (entry?.type as any) || (defaultType as any) || "risk",
      title: entry?.title || "",
      description: entry?.description || "",
      status: entry?.status || "open",
      priority: (entry?.priority as any) || "medium",
      impact: entry?.impact || "",
      likelihood: entry?.likelihood || "",
      ownerId: entry?.ownerId || "",
      assigneeId: entry?.assigneeId || "",
      dueDate: entry?.dueDate || "",
      category: entry?.category || "",
      mitigationPlan: entry?.mitigationPlan || "",
      resolutionNotes: entry?.resolutionNotes || "",
      parentEntryId: entry?.parentEntryId || defaultParentId || "",
      tags: entry?.tags?.join(", ") || "",
    },
  });

  const watchType = form.watch("type");

  function handleFormSubmit(values: RaiddFormData) {
    const payload: any = { ...values };
    if (payload.tags) {
      payload.tags = payload.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    } else {
      payload.tags = [];
    }

    Object.keys(payload).forEach(key => {
      if (payload[key] === "" || payload[key] === undefined) {
        delete payload[key];
      }
    });
    if (!payload.tags || payload.tags.length === 0) delete payload.tags;
    onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit RAIDD Entry" : "New RAIDD Entry"}</DialogTitle>
          <DialogDescription>
            {isDecisionReadOnly
              ? "This decision is no longer open. Use the Supersede action to create a replacement."
              : isEdit
              ? "Update the details of this entry."
              : "Create a new risk, issue, action, decision, or dependency entry."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit || !!defaultType}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RAIDD_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isDecisionReadOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} disabled={isDecisionReadOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isDecisionReadOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RAIDD_PRIORITIES.map(p => (
                          <SelectItem key={p} value={p}>{formatLabel(p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isDecisionReadOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RAIDD_STATUSES.map(s => (
                          <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={isDecisionReadOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {teamMembers.length > 0 && (
                          <>
                            <Separator className="my-1" />
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Team Members</div>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </>
                        )}
                        {clientStakeholders.length > 0 && (
                          <>
                            <Separator className="my-1" />
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Client Stakeholders</div>
                            {clientStakeholders.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}{s.stakeholderTitle ? ` (${s.stakeholderTitle})` : ''}</SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={isDecisionReadOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {teamMembers.length > 0 && (
                          <>
                            <Separator className="my-1" />
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Team Members</div>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </>
                        )}
                        {clientStakeholders.length > 0 && (
                          <>
                            <Separator className="my-1" />
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Client Stakeholders</div>
                            {clientStakeholders.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}{s.stakeholderTitle ? ` (${s.stakeholderTitle})` : ''}</SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={isDecisionReadOnly} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Technical, Legal" disabled={isDecisionReadOnly} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(watchType === "risk" || watchType === "issue") && (
              <FormField
                control={form.control}
                name="impact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impact</FormLabel>
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={isDecisionReadOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select impact" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {RAIDD_IMPACTS.map(i => (
                          <SelectItem key={i} value={i}>{formatLabel(i)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {watchType === "risk" && (
              <>
                <FormField
                  control={form.control}
                  name="likelihood"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Likelihood</FormLabel>
                      <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={isDecisionReadOnly}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select likelihood" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {RAIDD_LIKELIHOODS.map(l => (
                            <SelectItem key={l} value={l}>{formatLabel(l)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mitigationPlan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mitigation Plan</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} disabled={isDecisionReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {watchType === "issue" && (
              <FormField
                control={form.control}
                name="resolutionNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resolution Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} disabled={isDecisionReadOnly} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {watchType === "action_item" && (
              <FormField
                control={form.control}
                name="parentEntryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Entry</FormLabel>
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={isDecisionReadOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent entry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {projectEntries
                          .filter(e => e.type !== "action_item")
                          .map(e => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.refNumber ? `${e.refNumber} - ` : ""}{e.title}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Comma-separated tags" disabled={isDecisionReadOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isDecisionReadOnly && (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SupersedeDialog({
  open,
  onOpenChange,
  entryId,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
    },
  });

  function handleSubmit(values: any) {
    onSubmit(values);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supersede Decision</DialogTitle>
          <DialogDescription>
            Create a new decision that supersedes the existing one. The original will be marked as superseded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">New Decision Title</label>
            <Input {...form.register("title", { required: true })} placeholder="Title for the new decision" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Description</label>
            <Textarea {...form.register("description")} rows={3} placeholder="Describe the new decision" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Priority</label>
            <Select value={form.watch("priority")} onValueChange={(v) => form.setValue("priority", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RAIDD_PRIORITIES.map(p => (
                  <SelectItem key={p} value={p}>{formatLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Supersede"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IngestTextDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { text: string; projectContext?: string }) => void;
  isPending: boolean;
}) {
  const [text, setText] = useState("");
  const [projectContext, setProjectContext] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Analyze Text for RAIDD Items
          </DialogTitle>
          <DialogDescription>
            Paste meeting notes, emails, or other text. AI will identify risks, issues, actions, decisions, and dependencies.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Text to Analyze</label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste your text here..." />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Project Context (optional)</label>
            <Input value={projectContext} onChange={(e) => setProjectContext(e.target.value)} placeholder="Brief project context to improve analysis" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit({ text, projectContext: projectContext || undefined })} disabled={isPending || !text.trim()}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</> : "Analyze"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtractDecisionsDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { text: string }) => void;
  isPending: boolean;
}) {
  const [text, setText] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Extract Decisions from Document
          </DialogTitle>
          <DialogDescription>
            Paste document text or meeting minutes. AI will extract decisions that were made.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Document Text</label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste document content here..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit({ text })} disabled={isPending || !text.trim()}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting...</> : "Extract Decisions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiReviewDialog({
  open,
  onOpenChange,
  title,
  items,
  onItemsChange,
  onCreateSelected,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: any[];
  onItemsChange: (items: any[]) => void;
  onCreateSelected: (items: any[]) => void;
  isPending: boolean;
}) {
  const selectedCount = items.filter(i => i.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription>
            Review AI-detected items. Select the ones you want to create as RAIDD entries.
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No items were detected. Try providing more detailed text.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <Checkbox
                  checked={item.selected}
                  onCheckedChange={(checked) => {
                    const updated = [...items];
                    updated[idx] = { ...updated[idx], selected: !!checked };
                    onItemsChange(updated);
                  }}
                  className="mt-1"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs">{getTypeLabel(item.type || "risk")}</Badge>
                    {item.priority && <Badge className={`text-xs ${priorityColors[item.priority] || ""}`}>{formatLabel(item.priority)}</Badge>}
                  </div>
                  <Input
                    value={item.title || ""}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx] = { ...updated[idx], title: e.target.value };
                      onItemsChange(updated);
                    }}
                    className="text-sm font-medium"
                  />
                  <Textarea
                    value={item.description || ""}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      onItemsChange(updated);
                    }}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onCreateSelected(items)} disabled={isPending || selectedCount === 0}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : `Create Selected (${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestMitigationDialog({
  open,
  onOpenChange,
  entry,
  suggestion,
  isPending,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RaiddEntry | null;
  suggestion: any;
  isPending: boolean;
  onApply: (patchData: any, actionItems: any[]) => void;
}) {
  const isRisk = entry?.type === "risk";
  const fieldLabel = isRisk ? "Mitigation Plan" : "Resolution Notes";
  const fieldKey = isRisk ? "mitigationPlan" : "resolutionNotes";
  const [editedText, setEditedText] = useState("");
  const [editedActions, setEditedActions] = useState<any[]>([]);

  useMemo(() => {
    if (suggestion) {
      setEditedText(suggestion.suggestion || suggestion.mitigationPlan || suggestion.resolutionNotes || "");
      setEditedActions(suggestion.actionItems || suggestion.actions || []);
    }
  }, [suggestion]);

  if (isPending) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-gray-500 dark:text-gray-400">AI is generating suggestions...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> AI {isRisk ? "Mitigation" : "Resolution"} Suggestion
          </DialogTitle>
          <DialogDescription>
            Review and edit the AI suggestion before applying it to {entry?.refNumber || "this entry"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{fieldLabel}</label>
            <Textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} rows={4} />
          </div>
          {editedActions.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Suggested Action Items</label>
              <div className="space-y-2">
                {editedActions.map((action: any, idx: number) => (
                  <div key={idx} className="p-2 border border-gray-200 dark:border-gray-700 rounded text-sm">
                    <div className="font-medium">{action.title}</div>
                    {action.description && <div className="text-gray-500 dark:text-gray-400 text-xs mt-1">{action.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onApply({ [fieldKey]: editedText }, editedActions)} disabled={!editedText.trim()}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestActionsDialog({
  open,
  onOpenChange,
  entry,
  actions,
  onActionsChange,
  onCreateSelected,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RaiddEntry | null;
  actions: any[];
  onActionsChange: (actions: any[]) => void;
  onCreateSelected: (actions: any[]) => void;
  isPending: boolean;
}) {
  const selectedCount = actions.filter(a => a.selected).length;

  if (actions.length === 0 && !isPending) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" /> Suggested Action Items
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>AI is generating action item suggestions...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Suggested Action Items
          </DialogTitle>
          <DialogDescription>
            AI-suggested action items for {entry?.refNumber || "this entry"}. Select and edit before creating.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {actions.map((action, idx) => (
            <div key={action.id} className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
              <Checkbox
                checked={action.selected}
                onCheckedChange={(checked) => {
                  const updated = [...actions];
                  updated[idx] = { ...updated[idx], selected: !!checked };
                  onActionsChange(updated);
                }}
                className="mt-1"
              />
              <div className="flex-1 space-y-2">
                <Input
                  value={action.title || ""}
                  onChange={(e) => {
                    const updated = [...actions];
                    updated[idx] = { ...updated[idx], title: e.target.value };
                    onActionsChange(updated);
                  }}
                  className="text-sm font-medium"
                />
                <Textarea
                  value={action.description || ""}
                  onChange={(e) => {
                    const updated = [...actions];
                    updated[idx] = { ...updated[idx], description: e.target.value };
                    onActionsChange(updated);
                  }}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onCreateSelected(actions)} disabled={isPending || selectedCount === 0}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : `Create Selected (${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
