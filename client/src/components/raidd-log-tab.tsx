import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useEmbed } from "@/hooks/use-embed";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAIStatus, useRewriteRaiddResolution } from "@/lib/ai";
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
  Download, Upload, CheckCircle2
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
  decisionDate: string | null;
  stakeholderIds: string[] | null;
  parentEntryId: string | null;
  convertedFromId: string | null;
  supersededById: string | null;
  tags: string[] | null;
  clientVisible: boolean;
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
  focusEntryId?: string | null;
}

const RAIDD_TYPES = [
  { value: "risk", label: "Risk", icon: Shield },
  { value: "action_item", label: "Action Item", icon: CheckSquare },
  { value: "issue", label: "Issue", icon: AlertTriangle },
  { value: "decision", label: "Decision", icon: Scale },
  { value: "dependency", label: "Dependency", icon: Link2 },
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
  open: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
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
  clientVisible: z.boolean().default(true),
});

type RaiddFormData = z.infer<typeof raiddFormSchema>;

export function RaiddLogTab({ projectId, projectTeamMembers = [], focusEntryId }: RaiddLogTabProps) {
  const { toast } = useToast();
  const { isReadonly: embedReadonly } = useEmbed();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RaiddEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(focusEntryId || null);

  useEffect(() => {
    if (focusEntryId) setExpandedEntryId(focusEntryId);
  }, [focusEntryId]);
  const [sortField, setSortField] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [createWithType, setCreateWithType] = useState<string | null>(null);
  const [createWithParent, setCreateWithParent] = useState<string | null>(null);
  const [supersedeEntryId, setSupersedeEntryId] = useState<string | null>(null);
  const [resolvingEntry, setResolvingEntry] = useState<RaiddEntry | null>(null);
  const [resolveInitialStatus, setResolveInitialStatus] = useState<string>("resolved");

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
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    return params.toString();
  }, [typeFilter, priorityFilter]);

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

  const toggleStatus = (s: string) =>
    setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

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

  const filteredEntries = useMemo(() => {
    if (statusFilter.length === 0) return sortedEntries;
    return sortedEntries.filter(e => statusFilter.includes(e.status));
  }, [sortedEntries, statusFilter]);

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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
      toast({ title: "Superseded", description: "Decision superseded with new entry" });
      setSupersedeEntryId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/raidd/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
      if (expandedEntryId) {
        queryClient.invalidateQueries({ queryKey: ["/api/raidd", expandedEntryId] });
      }
      toast({ title: "Resolved", description: "Entry resolved and recorded" });
      setResolvingEntry(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const ingestTextMutation = useMutation({
    mutationFn: async (data: { text: string; projectContext?: string }) => {
      return await apiRequest("/api/raidd/ai/ingest-text", {
        method: "POST",
        body: JSON.stringify({ ...data, projectId }),
      });
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
      return await apiRequest("/api/raidd/ai/extract-decisions", {
        method: "POST",
        body: JSON.stringify({ ...data, projectId }),
      });
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
      return await apiRequest("/api/raidd/ai/suggest-mitigation", {
        method: "POST",
        body: JSON.stringify({ entryId: entry.id, type: entry.type, title: entry.title, description: entry.description, projectId }),
      });
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
      return await apiRequest("/api/raidd/ai/suggest-actions", {
        method: "POST",
        body: JSON.stringify({ entryId: entry.id, type: entry.type, title: entry.title, description: entry.description, projectId }),
      });
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
      const parentItems = items.filter(i => i.type !== 'action_item');
      const actionItems = items.filter(i => i.type === 'action_item');
      const results = [];
      const createdParents: any[] = [];
      let errors = 0;

      for (const item of parentItems) {
        try {
          const res = await apiRequest(`/api/projects/${projectId}/raidd`, {
            method: "POST",
            body: JSON.stringify(item),
          });
          results.push(res);
          createdParents.push(res);
        } catch (e) {
          errors++;
          console.error("Failed to create RAIDD item:", item.title, e);
        }
      }

      for (const item of actionItems) {
        try {
          const payload = { ...item };
          if (!payload.parentEntryId && createdParents.length > 0) {
            const matchingParent = createdParents.find(
              (p: any) => p.category && item.category && p.category === item.category
            );
            payload.parentEntryId = matchingParent?.id || createdParents[0]?.id;
          }
          const res = await apiRequest(`/api/projects/${projectId}/raidd`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          results.push(res);
        } catch (e) {
          errors++;
          console.error("Failed to create action item:", item.title, e);
        }
      }

      return { results, errors, total: items.length };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
      const created = data.results?.length || 0;
      const errors = data.errors || 0;
      if (errors > 0) {
        toast({ title: "Partially Created", description: `${created} of ${data.total} items created. ${errors} failed.`, variant: "destructive" });
      } else {
        toast({ title: "Created", description: `${created} items created successfully` });
      }
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
        queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(`/api/projects/${projectId}/raidd`) });
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
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold text-foreground">RAIDD Log</CardTitle>
            <div className="flex gap-1.5">
              {summaryCounts.R > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">R:{summaryCounts.R}</Badge>}
              {summaryCounts.A > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">A:{summaryCounts.A}</Badge>}
              {summaryCounts.I > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">I:{summaryCounts.I}</Badge>}
              {summaryCounts.D > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">D:{summaryCounts.D}</Badge>}
              {summaryCounts.Dep > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">Dep:{summaryCounts.Dep}</Badge>}
            </div>
          </div>
          {!embedReadonly && (
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
          )}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 min-w-[140px] justify-between">
                <span className="truncate">
                  {statusFilter.length === 0
                    ? "All Statuses"
                    : statusFilter.length === 1
                    ? formatLabel(statusFilter[0])
                    : `${statusFilter.length} statuses`}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                className="text-xs cursor-pointer"
                onSelect={e => { e.preventDefault(); setStatusFilter([]); }}
              >
                <span className={`mr-2 h-3 w-3 rounded-sm border flex items-center justify-center ${statusFilter.length === 0 ? "bg-primary border-primary" : "border-input"}`}>
                  {statusFilter.length === 0 && <span className="text-primary-foreground text-[8px] font-bold">✓</span>}
                </span>
                All Statuses
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs cursor-pointer font-medium"
                onSelect={e => { e.preventDefault(); setStatusFilter(["open", "in_progress"]); }}
              >
                <span className={`mr-2 h-3 w-3 rounded-sm border flex items-center justify-center ${statusFilter.length === 2 && statusFilter.includes("open") && statusFilter.includes("in_progress") ? "bg-primary border-primary" : "border-input"}`}>
                  {statusFilter.length === 2 && statusFilter.includes("open") && statusFilter.includes("in_progress") && <span className="text-primary-foreground text-[8px] font-bold">✓</span>}
                </span>
                Active Items
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {RAIDD_STATUSES.map(s => (
                <DropdownMenuItem
                  key={s}
                  className="text-xs cursor-pointer"
                  onSelect={e => { e.preventDefault(); toggleStatus(s); }}
                >
                  <Checkbox
                    checked={statusFilter.includes(s)}
                    className="mr-2 h-3 w-3"
                    onCheckedChange={() => toggleStatus(s)}
                  />
                  {formatLabel(s)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
        {(suggestMitigationMutation.isPending || suggestActionsMutation.isPending) && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium text-primary">
              {suggestMitigationMutation.isPending ? "AI is analyzing and generating suggestions..." : "AI is suggesting action items..."}
            </span>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filteredEntries.length === 0 ? (
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
                {filteredEntries.map(entry => {
                  const isExpanded = expandedEntryId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        ref={(el) => {
                          if (focusEntryId === entry.id && el) {
                            setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
                          }
                        }}
                        data-testid={`raidd-row-${entry.id}`}
                        className={`cursor-pointer transition-colors ${isExpanded ? "bg-primary/5 dark:bg-primary/10 border-b-0" : ""} ${focusEntryId === entry.id ? "ring-2 ring-primary ring-offset-1 animate-pulse" : ""}`}
                        onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                      >
                        <TableCell className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <ChevronDown className={`h-3 w-3 transition-transform duration-200 text-muted-foreground ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                            {entry.refNumber || "-"}
                          </div>
                        </TableCell>
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
                          {!embedReadonly && (
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
                              {(entry.type === "risk" || entry.type === "issue") &&
                                !["closed", "resolved", "mitigated", "superseded"].includes(entry.status) && (
                                <DropdownMenuItem onClick={() => { setResolveInitialStatus(entry.type === "issue" ? "resolved" : "mitigated"); setResolvingEntry(entry); }}>
                                  <CheckCircle2 className="h-4 w-4 mr-2" /> Resolve
                                </DropdownMenuItem>
                              )}
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
                                <DropdownMenuItem
                                  disabled={suggestMitigationMutation.isPending}
                                  onClick={() => { setSuggestMitigationEntry(entry); suggestMitigationMutation.mutate(entry); }}
                                >
                                  {suggestMitigationMutation.isPending && suggestMitigationEntry?.id === entry.id
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <Sparkles className="h-4 w-4 mr-2" />}
                                  AI: Suggest Mitigation
                                </DropdownMenuItem>
                              )}
                              {entry.type === "issue" && (
                                <DropdownMenuItem
                                  disabled={suggestMitigationMutation.isPending}
                                  onClick={() => { setSuggestMitigationEntry(entry); suggestMitigationMutation.mutate(entry); }}
                                >
                                  {suggestMitigationMutation.isPending && suggestMitigationEntry?.id === entry.id
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <Sparkles className="h-4 w-4 mr-2" />}
                                  AI: Suggest Resolution
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                disabled={suggestActionsMutation.isPending}
                                onClick={() => { setSuggestActionsEntry(entry); suggestActionsMutation.mutate(entry); }}
                              >
                                {suggestActionsMutation.isPending && suggestActionsEntry?.id === entry.id
                                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  : <Brain className="h-4 w-4 mr-2" />}
                                AI: Suggest Action Items
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 dark:text-red-400" onClick={() => setDeletingEntryId(entry.id)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="p-0 border-t-0">
                            {entryDetail ? (
                              <DetailPanel
                                entry={entryDetail}
                                onClose={() => setExpandedEntryId(null)}
                                onEdit={() => setEditingEntry(entryDetail)}
                                onAddAction={() => handleAddActionItem(entryDetail.id)}
                              />
                            ) : (
                              <div className="px-6 py-4 flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading details...
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
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
        onSubmit={(data) => {
          if (!editingEntry) return;
          const movingToResolving =
            (editingEntry.type === "risk" || editingEntry.type === "issue") &&
            ["closed", "resolved", "mitigated"].includes(data.status) &&
            !["closed", "resolved", "mitigated"].includes(editingEntry.status);
          if (movingToResolving) {
            setResolveInitialStatus(data.status);
            setResolvingEntry(editingEntry);
            setEditingEntry(null);
            return;
          }
          updateMutation.mutate({ id: editingEntry.id, data });
        }}
        isPending={updateMutation.isPending}
        entry={editingEntry}
        projectEntries={allEntries}
        teamMembers={projectTeamMembers}
        clientStakeholders={clientStakeholders}
        isEdit
      />

      <ResolveDialog
        open={!!resolvingEntry}
        onOpenChange={(open) => { if (!open) setResolvingEntry(null); }}
        entry={resolvingEntry}
        initialStatus={resolveInitialStatus}
        childActions={resolvingEntry ? allEntries.filter(e => e.parentEntryId === resolvingEntry.id && e.type === "action_item") : []}
        teamMembers={projectTeamMembers}
        clientStakeholders={clientStakeholders}
        isPending={resolveMutation.isPending}
        onSubmit={(data) => resolvingEntry && resolveMutation.mutate({ id: resolvingEntry.id, data })}
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

function ResolveDialog({
  open,
  onOpenChange,
  entry,
  initialStatus,
  childActions = [],
  teamMembers = [],
  clientStakeholders = [],
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RaiddEntry | null;
  initialStatus: string;
  childActions?: RaiddEntry[];
  teamMembers?: { id: string; name: string }[];
  clientStakeholders?: { id: string; name: string; stakeholderTitle?: string | null }[];
  isPending: boolean;
  onSubmit: (data: any) => void;
}) {
  const { toast } = useToast();
  const { data: aiStatus } = useAIStatus();
  const rewrite = useRewriteRaiddResolution();

  const [path, setPath] = useState<"decision" | "action">("decision");
  const [resolveStatus, setResolveStatus] = useState<string>(initialStatus);
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [decisionTitle, setDecisionTitle] = useState<string>("");
  const [decisionDescription, setDecisionDescription] = useState<string>("");
  const [decisionDate, setDecisionDate] = useState<string>("");
  const [decisionOwnerId, setDecisionOwnerId] = useState<string>("");
  const [stakeholderIds, setStakeholderIds] = useState<string[]>([]);
  const [actionItemId, setActionItemId] = useState<string>("");
  const [rewriting, setRewriting] = useState<null | "notes" | "decision">(null);

  const completedActions = useMemo(
    () => childActions.filter(a => ["closed", "resolved", "accepted", "mitigated"].includes(a.status)),
    [childActions],
  );

  useEffect(() => {
    if (open && entry) {
      setPath(completedActions.length > 0 ? "action" : "decision");
      setResolveStatus(initialStatus);
      setResolutionNotes(entry.resolutionNotes || "");
      setDecisionTitle(`Decision: ${entry.title}`);
      setDecisionDescription("");
      setDecisionDate(new Date().toISOString().slice(0, 10));
      setDecisionOwnerId(entry.ownerId || "");
      setStakeholderIds([]);
      setActionItemId(completedActions[0]?.id || "");
    }
  }, [open, entry?.id]);

  const stakeholderOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const m of teamMembers) {
      if (!seen.has(m.id)) { seen.add(m.id); out.push({ id: m.id, name: m.name }); }
    }
    for (const s of clientStakeholders) {
      if (!seen.has(s.id)) { seen.add(s.id); out.push({ id: s.id, name: s.name }); }
    }
    return out;
  }, [teamMembers, clientStakeholders]);

  const handleRewrite = async (which: "notes" | "decision") => {
    if (!entry) return;
    const draft = which === "notes" ? resolutionNotes : decisionDescription;
    if (!draft.trim()) {
      toast({ title: "Nothing to rewrite", description: "Type a rough draft first.", variant: "destructive" });
      return;
    }
    setRewriting(which);
    try {
      const result = await rewrite.mutateAsync({
        draft,
        type: entry.type,
        title: entry.title,
        mode: which === "decision" ? "decision" : "resolution",
      });
      if (which === "notes") setResolutionNotes(result.text);
      else setDecisionDescription(result.text);
    } catch (err: any) {
      toast({ title: "AI rewrite failed", description: err.message, variant: "destructive" });
    } finally {
      setRewriting(null);
    }
  };

  const toggleStakeholder = (id: string) =>
    setStakeholderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = () => {
    if (!entry) return;
    if (path === "decision" && !decisionTitle.trim()) {
      toast({ title: "Decision title required", description: "Give the decision a short title.", variant: "destructive" });
      return;
    }
    if (path === "action" && !actionItemId) {
      toast({ title: "Select an action item", description: "Choose a completed action that closed this item.", variant: "destructive" });
      return;
    }
    const payload: any = {
      path,
      resolveStatus,
      resolutionNotes: resolutionNotes.trim() || undefined,
    };
    if (path === "decision") {
      payload.decision = {
        title: decisionTitle.trim(),
        description: decisionDescription.trim() || undefined,
        decisionDate: decisionDate || undefined,
        ownerId: decisionOwnerId || undefined,
        stakeholderIds: stakeholderIds.length > 0 ? stakeholderIds : undefined,
      };
    } else {
      payload.actionItemId = actionItemId;
    }
    onSubmit(payload);
  };

  if (!entry) return null;
  const typeLabel = entry.type === "issue" ? "issue" : "risk";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve {getTypeLabel(entry.type)}</DialogTitle>
          <DialogDescription>
            To close this {typeLabel}, capture a decision in the decision log, or close it with a completed action item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <span className="text-sm font-medium mb-1.5 block">How was it resolved?</span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={path === "decision" ? "default" : "outline"}
                className="justify-start"
                onClick={() => setPath("decision")}
                data-testid="button-resolve-path-decision"
              >
                <Scale className="h-4 w-4 mr-2" /> Capture a decision
              </Button>
              <Button
                type="button"
                variant={path === "action" ? "default" : "outline"}
                className="justify-start"
                disabled={completedActions.length === 0}
                onClick={() => setPath("action")}
                data-testid="button-resolve-path-action"
              >
                <CheckSquare className="h-4 w-4 mr-2" /> Closed by action
              </Button>
            </div>
            {completedActions.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No completed action items are linked to this entry yet.</p>
            )}
          </div>

          <div>
            <span className="text-sm font-medium mb-1.5 block">Resolution status</span>
            <Select value={resolveStatus} onValueChange={setResolveStatus}>
              <SelectTrigger data-testid="select-resolve-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(entry.type === "risk" ? ["mitigated", "resolved", "closed"] : ["resolved", "closed"]).map(s => (
                  <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {path === "decision" && (
            <div className="space-y-3 rounded-md border p-3">
              <div>
                <span className="text-sm font-medium mb-1.5 block">Decision title</span>
                <Input value={decisionTitle} onChange={e => setDecisionTitle(e.target.value)} data-testid="input-decision-title" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">What was decided</span>
                  {aiStatus?.configured && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={rewriting === "decision"} onClick={() => handleRewrite("decision")} data-testid="button-ai-rewrite-decision">
                      {rewriting === "decision" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      Rewrite with AI
                    </Button>
                  )}
                </div>
                <Textarea value={decisionDescription} onChange={e => setDecisionDescription(e.target.value)} rows={3} placeholder="Type a rough draft, then let AI clean it up." data-testid="input-decision-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm font-medium mb-1.5 block">Decision date</span>
                  <Input type="date" value={decisionDate} onChange={e => setDecisionDate(e.target.value)} data-testid="input-decision-date" />
                </div>
                <div>
                  <span className="text-sm font-medium mb-1.5 block">Decision owner</span>
                  <Select value={decisionOwnerId || "none"} onValueChange={(v) => setDecisionOwnerId(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-decision-owner"><SelectValue placeholder="Select owner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {stakeholderOptions.map(o => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {stakeholderOptions.length > 0 && (
                <div>
                  <span className="text-sm font-medium mb-1.5 block">Stakeholders</span>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 rounded-md border p-2">
                    {stakeholderOptions.map(o => (
                      <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={stakeholderIds.includes(o.id)} onCheckedChange={() => toggleStakeholder(o.id)} data-testid={`checkbox-stakeholder-${o.id}`} />
                        <span>{o.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {path === "action" && (
            <div className="rounded-md border p-3">
              <span className="text-sm font-medium mb-1.5 block">Completed action item</span>
              <Select value={actionItemId} onValueChange={setActionItemId}>
                <SelectTrigger data-testid="select-resolve-action"><SelectValue placeholder="Select action item" /></SelectTrigger>
                <SelectContent>
                  {completedActions.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.refNumber ? `${a.refNumber} — ` : ""}{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">Resolution notes</span>
              {aiStatus?.configured && (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={rewriting === "notes"} onClick={() => handleRewrite("notes")} data-testid="button-ai-rewrite-notes">
                  {rewriting === "notes" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  Rewrite with AI
                </Button>
              )}
            </div>
            <Textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={3} placeholder="How was this resolved? A rough draft is fine — AI can tidy it up." data-testid="input-resolution-notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-submit-resolve">
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resolving...</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Resolve</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <div className="px-6 py-4 bg-primary/5 dark:bg-primary/10 border-t border-border/50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getTypeIcon(entry.type)}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.title}</h3>
          {entry.refNumber && (
            <Badge variant="outline" className="text-xs">{entry.refNumber}</Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Edit className="h-3.5 w-3.5 mr-1" /> Edit</Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close details"><X className="h-3.5 w-3.5" /></Button>
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
        <div className="mb-3 p-2 bg-muted rounded text-sm">
          <span className="text-muted-foreground font-medium">Converted from:</span>{" "}
          <span className="text-foreground">{entry.convertedFrom.refNumber} - {entry.convertedFrom.title}</span>
        </div>
      )}

      {entry.supersededBy && (
        <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <span className="text-purple-600 dark:text-purple-400 font-medium">Superseded by:</span>{" "}
          <span className="text-gray-700 dark:text-gray-300">{entry.supersededBy.refNumber} - {entry.supersededBy.title}</span>
        </div>
      )}

      {(() => {
        const children = entry.children || [];
        const decisions = children.filter(c => c.type === "decision");
        const actions = children.filter(c => c.type !== "decision");
        return (
          <>
            {decisions.length > 0 && (
              <div className="mb-3">
                <span className="text-gray-500 dark:text-gray-400 text-xs block mb-2">Decision Record ({decisions.length})</span>
                <div className="space-y-1.5">
                  {decisions.map(d => (
                    <div key={d.id} className="text-sm p-2 bg-muted rounded border border-border">
                      <div className="flex items-center gap-2">
                        <Scale className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-mono text-xs text-gray-400">{d.refNumber}</span>
                        <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{d.title}</span>
                        <Badge className={`text-xs ${statusColors[d.status] || ""}`}>{formatLabel(d.status)}</Badge>
                      </div>
                      {d.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{d.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {d.decisionDate && <span>Decided {formatBusinessDate(d.decisionDate)}</span>}
                        {d.ownerName && <span>Owner: {d.ownerName}</span>}
                        {d.stakeholderIds && d.stakeholderIds.length > 0 && (
                          <span>{d.stakeholderIds.length} stakeholder{d.stakeholderIds.length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {actions.length > 0 && (
              <div className="mb-3">
                <span className="text-gray-500 dark:text-gray-400 text-xs block mb-2">Action Items ({actions.length})</span>
                <div className="space-y-1">
                  {actions.map(child => (
                    <div key={child.id} className="flex items-center gap-2 text-sm p-1.5 bg-muted rounded border border-border">
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
          </>
        );
      })()}

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
  const { toast } = useToast();
  const { data: descAiStatus } = useAIStatus();
  const descRewrite = useRewriteRaiddResolution();

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
      clientVisible: entry?.clientVisible ?? true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
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
        clientVisible: entry?.clientVisible ?? true,
      });
    }
  }, [open, entry?.id]);

  const watchType = form.watch("type");
  const watchDueDate = form.watch("dueDate");
  const watchStatus = form.watch("status");

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
                  <div className="flex items-center justify-between">
                    <FormLabel>Description</FormLabel>
                    {descAiStatus?.configured && !isDecisionReadOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={descRewrite.isPending || !field.value?.trim()}
                        onClick={async () => {
                          try {
                            const result = await descRewrite.mutateAsync({
                              draft: field.value || "",
                              type: form.getValues("type"),
                              title: form.getValues("title"),
                              mode: "description",
                            });
                            field.onChange(result.text);
                          } catch (error: any) {
                            toast({ title: "AI rewrite failed", description: error.message, variant: "destructive" });
                          }
                        }}
                        data-testid="button-ai-rewrite-description"
                      >
                        {descRewrite.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                        AI rewrite
                      </Button>
                    )}
                  </div>
                  <FormControl>
                    <Textarea {...field} rows={3} disabled={isDecisionReadOnly} placeholder="Type a rough draft, then let AI clean it up." />
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
                    {watchType === "action_item" && (!watchStatus || watchStatus === "open" || watchStatus === "in_progress") && !watchDueDate && !isDecisionReadOnly && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Due date is recommended — it will appear in status reports and overdue tracking
                      </p>
                    )}
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

            <FormField
              control={form.control}
              name="clientVisible"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-md border border-border p-3">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                      disabled={isDecisionReadOnly}
                      data-testid="checkbox-client-visible"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">Visible to clients</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      When enabled, this entry is exposed through the Galaxy client portal API. On by default — turn off to keep an entry internal-only.
                    </p>
                  </div>
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
              <div key={item.id} className="flex items-start gap-3 p-3 border border-border rounded-lg">
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
                  <div key={idx} className="p-2 border border-border rounded text-sm">
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
            <div key={action.id} className="flex items-start gap-3 p-3 border border-border rounded-lg">
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
