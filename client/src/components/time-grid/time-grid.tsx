import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAIStatus, useRewriteTimeEntryDescription } from "@/lib/ai";
import { cn } from "@/lib/utils";
import { formatProjectLabel } from "@/lib/project-utils";
import {
  Plus, Save, Send, Trash2, Copy, Download, Upload, Sparkles, Loader2,
  AlertCircle, CheckCircle2, Circle, Undo2, Redo2, MoreHorizontal, X,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import type { Project, Client, TimeEntry, User } from "@shared/schema";
import { parseClipboard, toTsv, toCsv, coerceDate, coerceHours, coerceBoolean } from "./clipboard";
import { pushHistorySnapshot, markDirty, markSaving, markSaved, markError } from "./state";

type ProjectWithClient = Project & { client: Client };
type TimeEntryRow = TimeEntry & { project?: ProjectWithClient };

type RowState = "clean" | "dirty" | "saving" | "saved" | "error";

interface DraftRow {
  id: string;            // local id (uuid or server id)
  serverId?: string;     // present once row exists on server
  date: string;
  projectId: string;
  allocationId: string;
  description: string;
  hours: string;
  billable: boolean;
  milestoneId: string;
  submissionStatus: "draft" | "submitted" | "approved" | "rejected" | "locked";
  rejectionNote?: string | null;
  state: RowState;
  errors: Partial<Record<ColKey, string>>;
  saveError?: string;
}

type ColKey = "date" | "projectId" | "allocationId" | "description" | "hours" | "billable" | "milestoneId";

const COLUMNS: { key: ColKey; label: string; width: string }[] = [
  { key: "date", label: "Date", width: "w-[120px]" },
  { key: "projectId", label: "Project", width: "w-[200px]" },
  { key: "allocationId", label: "Allocation", width: "w-[180px]" },
  { key: "description", label: "Description", width: "w-[280px]" },
  { key: "hours", label: "Hours", width: "w-[80px]" },
  { key: "billable", label: "Billable", width: "w-[80px]" },
  { key: "milestoneId", label: "Milestone", width: "w-[160px]" },
];

const HEADER_ROW = ["Date", "Project", "Allocation", "Description", "Hours", "Billable", "Milestone"];

function uid() {
  return "tmp_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyDraft(date = todayLocal()): DraftRow {
  return {
    id: uid(),
    date,
    projectId: "",
    allocationId: "",
    description: "",
    hours: "",
    billable: true,
    milestoneId: "",
    submissionStatus: "draft",
    state: "clean",
    errors: {},
  };
}

function entryToDraft(entry: TimeEntryRow): DraftRow {
  const status: DraftRow["submissionStatus"] = entry.locked
    ? "locked"
    : ((entry.submissionStatus as DraftRow["submissionStatus"]) || "draft");
  return {
    id: entry.id,
    serverId: entry.id,
    date: entry.date,
    projectId: entry.projectId || "",
    allocationId: entry.allocationId || "",
    description: entry.description || "",
    hours: entry.hours || "",
    billable: !!entry.billable,
    milestoneId: entry.milestoneId || "",
    submissionStatus: status,
    rejectionNote: entry.rejectionNote ?? null,
    state: "clean",
    errors: {},
  };
}

// --- Drag-fill series detection helpers ---------------------------------
// Parse a YYYY-MM-DD string to a UTC Date. Returns null if not a strict ISO
// date — we don't want to over-interpret free-form text from other columns.
function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, da));
  if (isNaN(d.getTime())) return null;
  // Reject overflow dates (e.g. 2026-02-31 → normalised to March) so we
  // don't silently treat invalid input as a valid date series seed.
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  return d;
}
function formatIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addUtcDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Returns a value-generator for the fill cells, or null if no series can be
// detected (caller falls back to cyclic copy of the seed values).
// `offset` is 1-based: 1 = first cell after the seed in the fill direction.
function detectSeries(
  col: ColKey,
  values: (string | boolean | undefined)[],
  downward: boolean,
): ((offset: number) => string | boolean | undefined) | null {
  if (col === "date") {
    const dates = values.map((v) => (typeof v === "string" ? parseIsoDate(v) : null));
    if (dates.some((d) => !d)) return null;
    let step = 1; // single-seed default: one day per row
    if (dates.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < dates.length; i++) diffs.push(dayDiff(dates[i - 1]!, dates[i]!));
      if (!diffs.every((d) => d === diffs[0])) return null;
      step = diffs[0];
    }
    const last = dates[dates.length - 1]!;
    const first = dates[0]!;
    return (offset: number) => formatIsoDate(addUtcDays(downward ? last : first, downward ? step * offset : -step * offset));
  }
  if (col === "hours") {
    if (values.length < 2) return null; // single number → copy
    const nums = values.map((v) => {
      const n = parseFloat(String(v ?? ""));
      return isFinite(n) ? n : null;
    });
    if (nums.some((n) => n === null)) return null;
    const diffs: number[] = [];
    for (let i = 1; i < nums.length; i++) diffs.push(nums[i]! - nums[i - 1]!);
    const step = diffs[0];
    if (!diffs.every((d) => Math.abs(d - step) < 1e-9)) return null;
    if (step === 0) return null; // identical values → cyclic copy is equivalent
    const last = nums[nums.length - 1]!;
    const first = nums[0]!;
    return (offset: number) => {
      const v = downward ? last + step * offset : first - step * offset;
      // Trim trailing zeros while keeping reasonable precision.
      return String(Number(v.toFixed(6)));
    };
  }
  return null;
}

function validateRow(row: DraftRow): Partial<Record<ColKey, string>> {
  const errs: Partial<Record<ColKey, string>> = {};
  if (!row.projectId) errs.projectId = "Project required";
  if (!row.date) errs.date = "Date required";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errs.date = "Use YYYY-MM-DD";
  const h = parseFloat(row.hours);
  if (!row.hours || isNaN(h)) errs.hours = "Hours required";
  else if (h <= 0 || h > 24) errs.hours = "0.01 – 24";
  return errs;
}

interface TimeGridProps {
  currentUser: User;
  projects: ProjectWithClient[];
}

export function TimeGrid({ currentUser, projects }: TimeGridProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"drafts" | "submitted">("drafts");

  // Telemetry — log open
  useEffect(() => {
    console.log("[TIME-GRID] open", { tab });
  }, [tab]);

  // Submitted-tab filters
  const [submittedFilters, setSubmittedFilters] = useState({
    startDate: "",
    endDate: "",
    projectId: "",
    status: "all" as "all" | "submitted" | "approved" | "locked",
  });

  const { data: allEntries = [] } = useQuery<TimeEntryRow[]>({
    queryKey: ["/api/time-entries", { personId: currentUser.id }],
    queryFn: async () => {
      const params = new URLSearchParams({ personId: currentUser.id });
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch(`/api/time-entries?${params.toString()}`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  // Local draft rows are managed in component state so unsaved typing isn't lost on refetch.
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());

  // Sync server entries into local drafts list (only entries the user owns + draft/rejected)
  useEffect(() => {
    const ownDraft = allEntries.filter(
      (e) =>
        e.personId === currentUser.id &&
        !e.locked &&
        (e.submissionStatus === "draft" || e.submissionStatus === "rejected"),
    );
    setDrafts((prev) => {
      const byServer = new Map<string, DraftRow>();
      const localOnly: DraftRow[] = [];
      for (const r of prev) {
        if (r.serverId) byServer.set(r.serverId, r);
        else if (r.state === "dirty" || r.state === "saving" || r.state === "error") localOnly.push(r);
      }
      const merged: DraftRow[] = [];
      for (const e of ownDraft) {
        const existing = byServer.get(e.id);
        if (existing && (existing.state === "dirty" || existing.state === "saving")) {
          merged.push(existing);
        } else {
          merged.push(entryToDraft(e));
        }
        byServer.delete(e.id);
        knownIdsRef.current.add(e.id);
      }
      // any local-only rows still pending
      merged.push(...localOnly);
      return merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    });
  }, [allEntries, currentUser.id]);

  const submittedRows = useMemo(() => {
    // Submitted tab shows entries that have left the draft state and are no
    // longer editable in the Drafts tab. Rejected entries stay in Drafts so
    // the user can fix and resubmit them.
    let rows = allEntries.filter(
      (e) =>
        e.personId === currentUser.id &&
        (e.locked ||
          e.submissionStatus === "submitted" ||
          e.submissionStatus === "approved"),
    );
    if (submittedFilters.startDate) rows = rows.filter((r) => r.date >= submittedFilters.startDate);
    if (submittedFilters.endDate) rows = rows.filter((r) => r.date <= submittedFilters.endDate);
    if (submittedFilters.projectId) rows = rows.filter((r) => r.projectId === submittedFilters.projectId);
    if (submittedFilters.status !== "all") {
      if (submittedFilters.status === "locked") rows = rows.filter((r) => r.locked);
      else rows = rows.filter((r) => !r.locked && r.submissionStatus === submittedFilters.status);
    }
    return rows.map(entryToDraft);
  }, [allEntries, currentUser.id, submittedFilters]);

  // Selection: row-level for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Per-tab column sort state (null = natural/default order)
  type SortState = { col: ColKey; dir: "asc" | "desc" } | null;
  const [draftsSort, setDraftsSort] = useState<SortState>(null);
  const [submittedSort, setSubmittedSort] = useState<SortState>(null);

  // Active cell + range
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [rangeStart, setRangeStart] = useState<{ row: number; col: number } | null>(null);

  // Undo/redo stacks (max 50)
  const undoStack = useRef<DraftRow[][]>([]);
  const redoStack = useRef<DraftRow[][]>([]);

  const pushHistory = useCallback((current: DraftRow[]) => {
    const snapshot = current.map((r) => ({ ...r, errors: { ...r.errors } }));
    undoStack.current = pushHistorySnapshot(undoStack.current, snapshot);
    redoStack.current = [];
  }, []);

  const undo = () => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current = pushHistorySnapshot(redoStack.current, drafts.map((r) => ({ ...r })));
    setDrafts(prev);
  };
  const redo = () => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current = pushHistorySnapshot(undoStack.current, drafts.map((r) => ({ ...r })));
    setDrafts(next);
  };

  // Update a cell value (allocation auto-fill of description is handled in
  // the AllocationEditor, which has direct access to the loaded allocations).
  const updateCell = (rowIdx: number, col: ColKey, value: unknown) => {
    setDrafts((prev) => {
      const next = prev.slice();
      let row: DraftRow = { ...next[rowIdx], [col]: value } as DraftRow;
      // Reset dependent fields if project changed
      if (col === "projectId") {
        row.allocationId = "";
        row.milestoneId = "";
      }
      row.errors = validateRow(row);
      row = markDirty(row);
      pushHistory(prev);
      next[rowIdx] = row;
      return next;
    });
  };

  // Autosave per-row 800ms
  const saveTimers = useRef<Map<string, any>>(new Map());

  const saveMutation = useMutation<TimeEntryRow, Error, DraftRow>({
    mutationFn: async (row) => {
      const errs = validateRow(row);
      if (Object.keys(errs).length > 0) {
        throw new Error("Validation failed");
      }
      const payload: Record<string, unknown> = {
        date: row.date,
        projectId: row.projectId,
        hours: row.hours,
        billable: row.billable,
        description: row.description || "",
        milestoneId: row.milestoneId || undefined,
        allocationId: row.allocationId || undefined,
        personId: currentUser.id,
      };
      if (row.serverId) {
        return apiRequest(`/api/time-entries/${row.serverId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/time-entries", { method: "POST", body: JSON.stringify(payload) });
    },
  });

  const flushRow = useCallback(
    async (rowId: string) => {
      const row = drafts.find((r) => r.id === rowId);
      if (!row) return;
      if (Object.keys(row.errors).length > 0) return;
      setDrafts((prev) => prev.map((r) => (r.id === rowId ? markSaving(r) : r)));
      try {
        const result = await saveMutation.mutateAsync(row);
        const newId = result?.id;
        setDrafts((prev) =>
          prev.map((r) => (r.id === rowId ? markSaved(r, newId) : r)),
        );
        // If the row id changed (newly created → server uuid), keep the
        // selection stable so subsequent bulk actions still see this row.
        if (newId && newId !== rowId) {
          setSelectedIds((prev) => {
            if (!prev.has(rowId)) return prev;
            const next = new Set(prev);
            next.delete(rowId);
            next.add(newId);
            return next;
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        setDrafts((prev) =>
          prev.map((r) => (r.id === rowId ? markError(r, message) : r)),
        );
      }
    },
    [drafts, saveMutation, queryClient],
  );

  useEffect(() => {
    drafts.forEach((row) => {
      if (row.state !== "dirty") return;
      if (Object.keys(row.errors).length > 0) return;
      const existing = saveTimers.current.get(row.id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        saveTimers.current.delete(row.id);
        flushRow(row.id);
      }, 800);
      saveTimers.current.set(row.id, t);
    });
  }, [drafts, flushRow]);

  // Ref always points to the latest drafts so async flows (bulk submit)
  // can read post-save state without being trapped in a stale closure.
  const draftsRef = useRef<DraftRow[]>(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const flushAll = async () => {
    for (const row of draftsRef.current) {
      if (row.state === "dirty" || row.state === "error") {
        await flushRow(row.id);
      }
    }
  };

  // Bulk actions
  const submitForApproval = useMutation({
    mutationFn: async (ids: string[]) =>
      apiRequest("/api/time-entries/submit", { method: "POST", body: JSON.stringify({ entryIds: ids }) }),
    onSuccess: (res: { submitted?: number }) => {
      toast({ title: "Submitted", description: `${res?.submitted ?? 0} entries submitted for approval.` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
    onError: (e: Error) => toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/time-entries/${id}`, { method: "DELETE" }),
  });

  const handleBulkDelete = async () => {
    const targets = drafts.filter((r) => selectedIds.has(r.id));
    for (const r of targets) {
      if (r.serverId) {
        try {
          await deleteEntry.mutateAsync(r.serverId);
        } catch {/* ignore */}
      }
    }
    setDrafts((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    toast({ title: "Deleted", description: `${targets.length} rows deleted.` });
  };

  const handleBulkDuplicate = () => {
    const additions: DraftRow[] = [];
    drafts.forEach((r) => {
      if (!selectedIds.has(r.id)) return;
      const d = new Date(r.date + "T00:00:00");
      d.setDate(d.getDate() + 1);
      const nextDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      additions.push({
        ...r,
        id: uid(),
        serverId: undefined,
        date: nextDate,
        state: "dirty",
        submissionStatus: "draft",
      });
    });
    if (additions.length) {
      pushHistory(drafts);
      setDrafts((prev) => [...additions, ...prev]);
      toast({ title: "Duplicated", description: `${additions.length} rows duplicated to next day.` });
    }
  };

  const handleBulkSetBillable = (billable: boolean) => {
    pushHistory(drafts);
    setDrafts((prev) =>
      prev.map((r) => (selectedIds.has(r.id) ? { ...r, billable, state: "dirty", errors: validateRow({ ...r, billable }) } : r)),
    );
  };

  const handleBulkSetProject = (projectId: string) => {
    pushHistory(drafts);
    setDrafts((prev) =>
      prev.map((r) =>
        selectedIds.has(r.id)
          ? { ...r, projectId, allocationId: "", milestoneId: "", state: "dirty", errors: validateRow({ ...r, projectId, allocationId: "", milestoneId: "" }) }
          : r,
      ),
    );
  };

  const handleBulkSubmit = async () => {
    // Save first, then read serverIds from the post-save state via the ref
    // so newly-created rows are not missed by a stale closure.
    await flushAll();
    const selected = Array.from(selectedIds);
    const fresh = draftsRef.current;
    const ids: string[] = [];
    for (const localId of selected) {
      const r = fresh.find((d) => d.id === localId || d.serverId === localId);
      if (r?.serverId) ids.push(r.serverId);
    }
    if (ids.length === 0) {
      toast({ title: "Nothing to submit", description: "Selected rows have unresolved errors or are not yet saved.", variant: "destructive" });
      return;
    }
    submitForApproval.mutate(ids);
  };

  const addRow = () => {
    pushHistory(drafts);
    setDrafts((prev) => [emptyDraft(), ...prev]);
    // Clear sort so the new empty row appears at the top of the visible list
    setDraftsSort(null);
    setActive({ row: 0, col: 0 });
    setRangeStart(null);
  };

  // ─── Column sort (client-side, per tab) ─────────────────────────────────
  const compareRows = useCallback(
    (a: DraftRow, b: DraftRow, col: ColKey, dir: "asc" | "desc"): number => {
      const sign = dir === "asc" ? 1 : -1;
      const emptyLast = (s: string) => (s === "" || s == null ? 1 : 0);
      let av: string | number | boolean = "";
      let bv: string | number | boolean = "";
      switch (col) {
        case "date":
          av = a.date || ""; bv = b.date || "";
          break;
        case "projectId": {
          const ap = projects.find((p) => p.id === a.projectId);
          const bp = projects.find((p) => p.id === b.projectId);
          av = ap ? formatProjectLabel(ap).toLowerCase() : "";
          bv = bp ? formatProjectLabel(bp).toLowerCase() : "";
          break;
        }
        case "allocationId":
          av = (a.allocationId || "").toLowerCase();
          bv = (b.allocationId || "").toLowerCase();
          break;
        case "description":
          av = (a.description || "").toLowerCase();
          bv = (b.description || "").toLowerCase();
          break;
        case "hours": {
          const an = parseFloat(a.hours);
          const bn = parseFloat(b.hours);
          av = isNaN(an) ? -Infinity : an;
          bv = isNaN(bn) ? -Infinity : bn;
          break;
        }
        case "billable":
          av = a.billable ? 1 : 0;
          bv = b.billable ? 1 : 0;
          break;
        case "milestoneId":
          av = (a.milestoneId || "").toLowerCase();
          bv = (b.milestoneId || "").toLowerCase();
          break;
      }
      if (typeof av === "string" && typeof bv === "string") {
        const ea = emptyLast(av);
        const eb = emptyLast(bv);
        if (ea !== eb) return ea - eb; // empties always last regardless of dir
        if (av < bv) return -1 * sign;
        if (av > bv) return 1 * sign;
        return 0;
      }
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    },
    [projects],
  );

  const applySort = useCallback(
    (rows: DraftRow[], sort: SortState): DraftRow[] => {
      if (!sort) return rows;
      const arr = rows.slice();
      arr.sort((a, b) => compareRows(a, b, sort.col, sort.dir));
      return arr;
    },
    [compareRows],
  );

  const sortedDrafts = useMemo(() => applySort(drafts, draftsSort), [drafts, draftsSort, applySort]);
  const sortedSubmitted = useMemo(() => applySort(submittedRows, submittedSort), [submittedRows, submittedSort, applySort]);

  // Row used for rendering / keyboard nav / paste / copy depending on tab.
  // These are the *sorted* views; index-based mutations below translate back
  // to the canonical drafts array via row id.
  const visibleRows = tab === "drafts" ? sortedDrafts : sortedSubmitted;

  // Cycle a column header through asc → desc → none, preserving the active
  // row by id so the cursor stays on the same logical row after sort changes.
  const cycleSort = (col: ColKey) => {
    const isDrafts = tab === "drafts";
    const currentSort = isDrafts ? draftsSort : submittedSort;
    const currentRows = isDrafts ? drafts : submittedRows;
    const currentSorted = isDrafts ? sortedDrafts : sortedSubmitted;
    const anchorId = currentSorted[active.row]?.id ?? null;
    let nextSort: SortState;
    if (!currentSort || currentSort.col !== col) nextSort = { col, dir: "asc" };
    else if (currentSort.dir === "asc") nextSort = { col, dir: "desc" };
    else nextSort = null;
    if (isDrafts) setDraftsSort(nextSort);
    else setSubmittedSort(nextSort);
    const newSorted = applySort(currentRows, nextSort);
    if (anchorId) {
      const newIdx = newSorted.findIndex((r) => r.id === anchorId);
      if (newIdx >= 0) setActive({ row: newIdx, col: active.col });
    }
    setRangeStart(null);
    console.log("[TIME-GRID] sort", { tab, sort: nextSort });
  };

  // Header select-all: select / deselect every row currently rendered in the
  // active (drafts) tab. The submitted tab is read-only so this is a no-op.
  const selectAllVisible = (checked: boolean) => {
    if (tab !== "drafts") return;
    setSelectedIds(() => {
      if (!checked) return new Set();
      const next = new Set<string>();
      for (const r of sortedDrafts) next.add(r.id);
      return next;
    });
  };

  // Translate an index from the sorted view back to the canonical drafts
  // array so existing index-based mutations (updateCell/dragFill/paste)
  // continue to work when a sort is applied.
  const draftsIdxFromSorted = useCallback(
    (sortedIdx: number): number => {
      if (!draftsSort) return sortedIdx;
      const id = sortedDrafts[sortedIdx]?.id;
      if (!id) return -1;
      return drafts.findIndex((r) => r.id === id);
    },
    [draftsSort, sortedDrafts, drafts],
  );

  const updateCellSorted = (sortedIdx: number, col: ColKey, value: unknown) => {
    const realIdx = draftsIdxFromSorted(sortedIdx);
    if (realIdx < 0) return;
    updateCell(realIdx, col, value);
  };

  // Keyboard navigation handler attached at table-level
  const tableRef = useRef<HTMLDivElement>(null);

  const moveActive = (dRow: number, dCol: number, ext = false) => {
    setActive((cur) => {
      const r = Math.max(0, Math.min(visibleRows.length - 1, cur.row + dRow));
      const c = Math.max(0, Math.min(COLUMNS.length - 1, cur.col + dCol));
      if (!ext) setRangeStart(null);
      return { row: r, col: c };
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // editor handles its own keys
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (meta && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelection();
      return;
    }
    if (meta && e.key.toLowerCase() === "v") {
      // Let paste event handle it via document paste listener
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveActive(0, e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) moveActive(-1, 0);
      else moveActive(1, 0);
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      if (tab === "drafts") setEditing({ ...active });
      return;
    }
    if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1, 0, e.shiftKey); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1, 0, e.shiftKey); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); moveActive(0, -1, e.shiftKey); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); moveActive(0, 1, e.shiftKey); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (tab !== "drafts") return;
      e.preventDefault();
      const col = COLUMNS[active.col].key;
      if (col === "billable") return;
      updateCellSorted(active.row, col, col === "hours" ? "" : "");
    }
  };

  // Range computation
  const range = useMemo(() => {
    if (!rangeStart) return { r0: active.row, r1: active.row, c0: active.col, c1: active.col };
    return {
      r0: Math.min(rangeStart.row, active.row),
      r1: Math.max(rangeStart.row, active.row),
      c0: Math.min(rangeStart.col, active.col),
      c1: Math.max(rangeStart.col, active.col),
    };
  }, [rangeStart, active]);

  const rangeRows = (): string[][] => {
    const out: string[][] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const row = visibleRows[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) {
        cells.push(cellToText(row, COLUMNS[c].key));
      }
      out.push(cells);
    }
    return out;
  };

  const copySelection = async () => {
    const rows = rangeRows();
    if (rows.length === 0) return;
    const tsv = toTsv(rows);
    try {
      await navigator.clipboard.writeText(tsv);
      console.log("[TIME-GRID] copy", { cells: rows.length * (rows[0]?.length || 0) });
    } catch {/* ignore */}
  };

  const getCell = (row: DraftRow, col: ColKey): string | boolean | undefined => {
    switch (col) {
      case "date": return row.date;
      case "projectId": return row.projectId;
      case "allocationId": return row.allocationId;
      case "description": return row.description;
      case "hours": return row.hours;
      case "billable": return row.billable;
      case "milestoneId": return row.milestoneId;
    }
  };

  const cellToText = (row: DraftRow, col: ColKey): string => {
    const v = getCell(row, col);
    if (col === "billable") return v ? "TRUE" : "FALSE";
    if (col === "projectId") {
      const p = projects.find((p) => p.id === v);
      return p ? formatProjectLabel(p) : "";
    }
    return v == null ? "" : String(v);
  };

  // Paste handler (document-level when grid focused)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (tab !== "drafts") return;
      if (!tableRef.current?.contains(document.activeElement)) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const rows = parseClipboard(text);
      if (rows.length === 0) return;
      console.log("[TIME-GRID] paste", { rows: rows.length });
      // Map each affected sorted-view row to its id so we mutate the right
      // logical rows in `drafts` regardless of whether a sort is applied.
      const targetIds: (string | null)[] = [];
      for (let i = 0; i < rows.length; i++) {
        const sortedIdx = active.row + i;
        targetIds.push(sortedDrafts[sortedIdx]?.id ?? null);
      }
      pushHistory(drafts);
      setDrafts((prev) => {
        const next = prev.slice();
        for (let i = 0; i < rows.length; i++) {
          let realIdx: number;
          const id = targetIds[i];
          if (id) {
            realIdx = next.findIndex((r) => r.id === id);
            if (realIdx < 0) {
              next.push(emptyDraft());
              realIdx = next.length - 1;
            }
          } else {
            next.push(emptyDraft());
            realIdx = next.length - 1;
          }
          for (let j = 0; j < rows[i].length; j++) {
            const ci = active.col + j;
            if (ci >= COLUMNS.length) break;
            const col = COLUMNS[ci].key;
            const raw = rows[i][j];
            const base = next[realIdx];
            const coerced = coerceValue(col, raw, base.projectId);
            const row: DraftRow = { ...base, [col]: coerced } as DraftRow;
            row.errors = validateRow(row);
            row.state = "dirty";
            next[realIdx] = row;
          }
        }
        return next;
      });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [tab, active, drafts, pushHistory]);

  function coerceValue(col: ColKey, raw: string, _currentProjectId: string): string | boolean {
    if (col === "date") return coerceDate(raw) ?? raw;
    if (col === "hours") {
      const h = coerceHours(raw);
      return h !== null ? String(h) : raw;
    }
    if (col === "billable") {
      const b = coerceBoolean(raw);
      return b === null ? false : b;
    }
    if (col === "projectId") {
      // Try to match by code/name/label
      const r = raw.toLowerCase().trim();
      const match = projects.find(
        (p) => p.id === raw || p.code?.toLowerCase() === r || p.name.toLowerCase() === r || formatProjectLabel(p).toLowerCase() === r,
      );
      return match?.id || "";
    }
    return raw;
  }

  // Drag-fill: extend a series (date increments, numeric step) when possible,
  // otherwise copy the seed values cyclically — mirrors Excel/Sheets behaviour.
  // `seed` is the row range selected before the drag started; the drag extends
  // that pattern toward `toRow`.
  const dragFill = (toRow: number, seed?: { r0: number; r1: number }) => {
    const col = COLUMNS[active.col].key;
    if (col === "projectId" || col === "allocationId" || col === "milestoneId") return; // skip refs
    const seedStart = seed ? seed.r0 : active.row;
    const seedEnd = seed ? seed.r1 : active.row;
    if (toRow >= seedStart && toRow <= seedEnd) return;
    const downward = toRow > seedEnd;
    const fillStart = downward ? seedEnd + 1 : toRow;
    const fillEnd = downward ? toRow : seedStart - 1;
    // All indices above are into the *sorted* view. Resolve seed values from
    // the view, then translate fill targets to ids so we mutate `drafts`
    // (the canonical list) by id rather than by potentially-stale index.
    const seedValues: (string | boolean | undefined)[] = [];
    for (let r = seedStart; r <= seedEnd; r++) {
      if (!sortedDrafts[r]) return;
      seedValues.push(getCell(sortedDrafts[r], col));
    }
    const series = detectSeries(col, seedValues, downward);
    const seedLen = seedValues.length;
    const fillTargets: { id: string; r: number }[] = [];
    for (let r = fillStart; r <= fillEnd; r++) {
      const id = sortedDrafts[r]?.id;
      if (id) fillTargets.push({ id, r });
    }
    if (fillTargets.length === 0) return;
    pushHistory(drafts);
    setDrafts((prev) => {
      const next = prev.slice();
      for (const { id, r } of fillTargets) {
        const realIdx = next.findIndex((row) => row.id === id);
        if (realIdx < 0) continue;
        let val: string | boolean | undefined;
        if (series) {
          const offset = downward ? r - seedEnd : seedStart - r;
          val = series(offset);
        } else {
          const dist = downward ? r - seedEnd - 1 : seedStart - r - 1;
          const idxInCycle = dist % seedLen;
          const pick = downward ? idxInCycle : seedLen - 1 - idxInCycle;
          val = seedValues[pick];
        }
        const row = { ...next[realIdx], [col]: val } as DraftRow;
        row.errors = validateRow(row);
        row.state = "dirty";
        next[realIdx] = row;
      }
      return next;
    });
  };

  // CSV download — column order matches the server import template so a
  // round-trip via /api/me/time-entries/import works without re-mapping.
  const downloadCsv = () => {
    // Including the entry Id as the last column lets the server-side
    // self-import update the matching draft instead of creating duplicates
    // when re-uploading a previously-downloaded file.
    const headerRow = ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable", "Phase", "Milestone", "Id"];
    const rows: string[][] = [headerRow];
    visibleRows.forEach((r) => {
      const proj = projects.find((p) => p.id === r.projectId);
      rows.push([
        r.date,
        proj?.name || "",
        currentUser.name || currentUser.email || "",
        r.description || "",
        r.hours,
        r.billable ? "TRUE" : "FALSE",
        "",
        r.milestoneId || "",
        r.serverId || "",
      ]);
    });
    const csv = "\uFEFF" + toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${tab}-${todayLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    console.log("[TIME-GRID] csv-download", { rows: rows.length - 1 });
  };

  // CSV upload dialog — uses the self-service import endpoint so parsing,
  // project resolution, and validation are shared with the server.
  interface PreviewRow {
    date: string | null;
    projectId: string;
    projectName: string;
    description: string;
    hours: string;
    billable: boolean;
    errors: string[];
  }
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{ rows: PreviewRow[]; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCsvFile = async (file: File) => {
    setUploadFile(file);
    const text = await file.text();
    const stripped = text.replace(/^\uFEFF/, "");
    const rows = parseClipboard(stripped);
    if (rows.length === 0) return;
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = header.indexOf(n.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };
    const di = idx("date");
    const pi = idx("project name", "project");
    const desci = idx("description");
    const hi = idx("hours");
    const bi = idx("billable");
    const errors: string[] = [];
    const parsed: PreviewRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.every((c) => !c?.trim())) continue;
      const date = di >= 0 ? coerceDate(r[di]) : null;
      const projectName = pi >= 0 ? r[pi] : "";
      const proj = projects.find(
        (p) => p.name.toLowerCase() === projectName?.toLowerCase().trim() || p.code?.toLowerCase() === projectName?.toLowerCase().trim(),
      );
      const hours = hi >= 0 ? coerceHours(r[hi]) : null;
      const billable = bi >= 0 ? coerceBoolean(r[bi]) ?? true : true;
      const rowErrors: string[] = [];
      if (!date) rowErrors.push("invalid date");
      if (!proj) rowErrors.push("project not found");
      if (hours === null) rowErrors.push("invalid hours");
      parsed.push({
        date,
        projectId: proj?.id || "",
        projectName,
        description: desci >= 0 ? r[desci] : "",
        hours: hours !== null ? String(hours) : "",
        billable,
        errors: rowErrors,
      });
      if (rowErrors.length) errors.push(`Row ${i + 1}: ${rowErrors.join(", ")}`);
    }
    setUploadPreview({ rows: parsed, errors });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", uploadFile);
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch("/api/me/time-entries/import", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Import failed");
      }
      const data: { imported: number; updated?: number; errors: string[] } = await res.json();
      console.log("[TIME-GRID] csv-upload", { imported: data.imported, updated: data.updated || 0 });
      return data;
    },
    onSuccess: (data) => {
      const upd = data.updated ?? 0;
      toast({
        title: "Imported",
        description: `${data.imported} new, ${upd} updated${data.errors.length ? ` (${data.errors.length} skipped)` : ""}.`,
      });
      setUploadOpen(false);
      setUploadPreview(null);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
    onError: (e: Error) => {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    },
  });

  // ─── Render ─────────────────────────────────────────────────────────────

  const dirtyCount = drafts.filter((r) => r.state === "dirty" || r.state === "saving").length;

  return (
    <div className="space-y-3" ref={tableRef} tabIndex={0} onKeyDown={onKeyDown} data-testid="time-grid-root">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "drafts" | "submitted")}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="drafts" data-testid="tab-drafts">My Drafts ({drafts.length})</TabsTrigger>
            <TabsTrigger value="submitted" data-testid="tab-submitted">Submitted ({submittedRows.length})</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5 flex-wrap">
            {tab === "drafts" && (
              <>
                <Button size="sm" variant="outline" onClick={addRow} data-testid="button-grid-add-row">
                  <Plus className="h-4 w-4 mr-1" /> Add row
                </Button>
                <Button size="sm" variant="outline" onClick={undo} disabled={undoStack.current.length === 0} title="Undo (Ctrl/Cmd+Z)">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={redo} disabled={redoStack.current.length === 0} title="Redo">
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={flushAll} disabled={dirtyCount === 0} data-testid="button-grid-save-all">
                  <Save className="h-4 w-4 mr-1" /> Save all{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={downloadCsv} data-testid="button-grid-csv-download">
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            {tab === "drafts" && (
              <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)} data-testid="button-grid-csv-upload">
                <Upload className="h-4 w-4 mr-1" /> Upload
              </Button>
            )}
          </div>
        </div>

        {tab === "drafts" && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-accent/40 border rounded">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="default" onClick={handleBulkSubmit} data-testid="button-grid-bulk-submit">
              <Send className="h-4 w-4 mr-1" /> Submit
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDuplicate} data-testid="button-grid-bulk-duplicate">
              <Copy className="h-4 w-4 mr-1" /> Duplicate
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Set <MoreHorizontal className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkSetBillable(true)}>Billable: TRUE</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkSetBillable(false)}>Billable: FALSE</DropdownMenuItem>
                <DropdownMenuSeparator />
                {projects.slice(0, 8).map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => handleBulkSetProject(p.id)}>
                    Project: {p.code ? `${p.code} · ${formatProjectLabel(p)}` : formatProjectLabel(p)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} data-testid="button-grid-bulk-delete">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {tab === "submitted" && (
          <div className="flex flex-wrap gap-2 items-end px-3 py-2 bg-muted/40 border rounded">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" className="h-8 w-[140px]" value={submittedFilters.startDate}
                onChange={(e) => setSubmittedFilters((s) => ({ ...s, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" className="h-8 w-[140px]" value={submittedFilters.endDate}
                onChange={(e) => setSubmittedFilters((s) => ({ ...s, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                className="h-8 px-2 border rounded bg-background text-sm"
                value={submittedFilters.status}
                onChange={(e) =>
                  setSubmittedFilters((s) => ({
                    ...s,
                    status: e.target.value as typeof submittedFilters.status,
                  }))
                }
              >
                <option value="all">All</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="locked">Locked</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Project</label>
              <select
                className="h-8 px-2 border rounded bg-background text-sm w-[200px]"
                value={submittedFilters.projectId}
                onChange={(e) => setSubmittedFilters((s) => ({ ...s, projectId: e.target.value }))}
                data-testid="select-submitted-project-filter"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ${formatProjectLabel(p)}` : formatProjectLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            {(submittedFilters.startDate || submittedFilters.endDate || submittedFilters.projectId || submittedFilters.status !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSubmittedFilters({ startDate: "", endDate: "", projectId: "", status: "all" })}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        <TabsContent value="drafts" className="mt-2">
          <GridTable
            rows={sortedDrafts}
            projects={projects}
            personId={currentUser.id}
            active={active}
            setActive={(a) => { setActive(a); setRangeStart(null); }}
            range={range}
            startRange={(a) => { setRangeStart(a); setActive(a); }}
            extendRange={(a) => setActive(a)}
            editing={editing}
            setEditing={setEditing}
            updateCell={updateCellSorted}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            editable
            onDragFill={dragFill}
            sort={draftsSort}
            onSortChange={cycleSort}
            onSelectAll={selectAllVisible}
          />
        </TabsContent>
        <TabsContent value="submitted" className="mt-2">
          <GridTable
            rows={sortedSubmitted}
            projects={projects}
            personId={currentUser.id}
            active={active}
            setActive={(a) => { setActive(a); setRangeStart(null); }}
            range={range}
            startRange={(a) => { setRangeStart(a); setActive(a); }}
            extendRange={(a) => setActive(a)}
            editing={null}
            setEditing={() => {}}
            updateCell={() => {}}
            selectedIds={new Set()}
            toggleSelect={() => {}}
            editable={false}
            sort={submittedSort}
            onSortChange={cycleSort}
          />
        </TabsContent>
      </Tabs>

      {/* CSV Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) setUploadPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload CSV</DialogTitle>
            <DialogDescription>Import rows as drafts. Project must match by name or code.</DialogDescription>
          </DialogHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCsvFile(f);
            }}
          />
          {!uploadPreview ? (
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Choose CSV file
            </Button>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              <div className="text-sm">
                {uploadPreview.rows.length} rows, {uploadPreview.errors.length} with errors
              </div>
              <table className="w-full text-xs border">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-1 text-left">Date</th>
                    <th className="p-1 text-left">Project</th>
                    <th className="p-1 text-left">Hours</th>
                    <th className="p-1 text-left">Description</th>
                    <th className="p-1 text-left">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadPreview.rows.map((r, i) => (
                    <tr key={i} className={r.errors.length ? "bg-destructive/10" : ""}>
                      <td className="p-1">{r.date}</td>
                      <td className="p-1">{r.projectName}</td>
                      <td className="p-1">{r.hours}</td>
                      <td className="p-1 truncate max-w-[200px]">{r.description}</td>
                      <td className="p-1 text-destructive">{r.errors.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setUploadPreview(null); }}>Cancel</Button>
            <Button
              disabled={!uploadPreview || uploadPreview.rows.filter((r) => r.errors.length === 0).length === 0}
              onClick={() => importMutation.mutate()}
            >
              Import as drafts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function GridTable(props: {
  rows: DraftRow[];
  projects: ProjectWithClient[];
  personId: string;
  active: { row: number; col: number };
  setActive: (a: { row: number; col: number }) => void;
  range: { r0: number; r1: number; c0: number; c1: number };
  startRange: (a: { row: number; col: number }) => void;
  extendRange: (a: { row: number; col: number }) => void;
  editing: { row: number; col: number } | null;
  setEditing: (e: { row: number; col: number } | null) => void;
  updateCell: (row: number, col: ColKey, value: unknown) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  editable: boolean;
  onDragFill?: (toRow: number, seed: { r0: number; r1: number }) => void;
  sort?: { col: ColKey; dir: "asc" | "desc" } | null;
  onSortChange?: (col: ColKey) => void;
  onSelectAll?: (checked: boolean) => void;
}) {
  const { rows, projects, active, range, editable, editing, setEditing, setActive, startRange, extendRange, updateCell, selectedIds, toggleSelect, onDragFill, personId, sort, onSortChange, onSelectAll } = props;

  // Header select-all state derived from currently-rendered rows.
  const visibleSelectedCount = useMemo(() => {
    let n = 0;
    for (const r of rows) if (selectedIds.has(r.id)) n++;
    return n;
  }, [rows, selectedIds]);
  const allSelected = rows.length > 0 && visibleSelectedCount === rows.length;
  const someSelected = visibleSelectedCount > 0 && !allSelected;
  const [dragFromRow, setDragFromRow] = useState<number | null>(null);
  const dragToRowRef = useRef<number | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const r = rows[i];
      return r?.submissionStatus === "rejected" && r?.rejectionNote ? 60 : 32;
    },
    overscan: 10,
  });

  // Keep the active cell visible as the user navigates with the keyboard.
  useEffect(() => {
    if (rows.length === 0) return;
    if (active.row < 0 || active.row >= rows.length) return;
    rowVirtualizer.scrollToIndex(active.row, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.row, rows.length]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div ref={parentRef} className="border rounded overflow-auto bg-card max-h-[70vh]">
      <table className="w-full text-sm">
        <thead className="bg-muted sticky top-0 z-10">
          <tr>
            <th className="w-[36px] p-1 text-center">
              {editable && onSelectAll ? (
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  disabled={rows.length === 0}
                  onCheckedChange={(v) => onSelectAll(v === true)}
                  aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                  data-testid="grid-select-all"
                />
              ) : null}
            </th>
            <th className="w-[80px] p-1 text-left text-xs font-medium">Status</th>
            {COLUMNS.map((c) => {
              const isSorted = sort?.col === c.key;
              const dir = isSorted ? sort?.dir : null;
              return (
                <th key={c.key} className={cn("p-0 text-left text-xs font-medium", c.width)}>
                  {onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.key)}
                      className={cn(
                        "w-full h-full px-2 py-1.5 flex items-center gap-1 hover:bg-muted-foreground/10 select-none text-left",
                        isSorted && "text-foreground font-semibold",
                      )}
                      data-testid={`grid-sort-${c.key}`}
                      aria-label={`Sort by ${c.label}`}
                    >
                      <span>{c.label}</span>
                      {dir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : dir === "desc" ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </button>
                  ) : (
                    <div className="px-2 py-1.5">{c.label}</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={COLUMNS.length + 2} className="p-6 text-center text-muted-foreground text-sm">No rows. {editable ? "Click \"Add row\" to start logging time." : "Submitted entries will appear here."}</td></tr>
          )}
          {paddingTop > 0 && (
            <tr aria-hidden="true"><td colSpan={COLUMNS.length + 2} style={{ height: paddingTop, padding: 0, border: 0 }} /></tr>
          )}
          {virtualItems.map((vi) => {
            const ri = vi.index;
            const row = rows[ri];
            if (!row) return null;
            const isRejected = row.submissionStatus === "rejected";
            return (
              <Fragment key={row.id}>
              <tr data-row-idx={ri} className={cn("border-t", isRejected && "bg-destructive/5")}>
                <td className="p-1 text-center">
                  {editable ? (
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={() => toggleSelect(row.id)}
                      data-testid={`grid-select-${ri}`}
                    />
                  ) : null}
                </td>
                <td className="p-1">
                  <StatusBadge row={row} />
                </td>
                {COLUMNS.map((c, ci) => {
                  const inRange = ri >= range.r0 && ri <= range.r1 && ci >= range.c0 && ci <= range.c1;
                  const isActive = active.row === ri && active.col === ci;
                  const isEditing = editable && editing?.row === ri && editing?.col === ci;
                  const err = row.errors[c.key];
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "p-0 border-r last:border-r-0 relative",
                        c.width,
                        inRange && "bg-primary/5",
                        isActive && "ring-2 ring-primary ring-inset",
                        err && "ring-1 ring-destructive ring-inset",
                      )}
                      onMouseDown={(e) => {
                        if (e.shiftKey) {
                          extendRange({ row: ri, col: ci });
                        } else {
                          startRange({ row: ri, col: ci });
                          setActive({ row: ri, col: ci });
                          setEditing(null);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if ((e.buttons & 1) && dragFromRow === null) extendRange({ row: ri, col: ci });
                        if (dragFromRow !== null) extendRange({ row: ri, col: active.col });
                      }}
                      onDoubleClick={() => editable && setEditing({ row: ri, col: ci })}
                    >
                      <CellContent
                        row={row}
                        rowIndex={ri}
                        col={c.key}
                        projects={projects}
                        editable={editable && row.submissionStatus !== "locked"}
                        editing={!!isEditing}
                        setEditing={(e) => setEditing(e ? { row: ri, col: ci } : null)}
                        updateCell={updateCell}
                        personId={personId}
                      />
                      {err && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertCircle className="absolute top-1 right-1 h-3 w-3 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>{err}</TooltipContent>
                        </Tooltip>
                      )}
                      {/* drag-fill handle on bottom-right of active cell */}
                      {isActive && editable && onDragFill && (
                        <div
                          className="absolute bottom-0 right-0 w-2 h-2 bg-primary cursor-crosshair"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Capture the seed row-range (selection at drag-start)
                            // so series detection works for multi-row patterns.
                            const seed = { r0: range.r0, r1: range.r1 };
                            setDragFromRow(ri);
                            dragToRowRef.current = ri;
                            const onMove = (ev: MouseEvent) => {
                              const target = (ev.target as HTMLElement)?.closest("tr");
                              if (target) {
                                const idx = Number((target as HTMLElement).dataset?.rowIdx);
                                if (!isNaN(idx)) {
                                  dragToRowRef.current = idx;
                                  extendRange({ row: idx, col: active.col });
                                }
                              }
                            };
                            const onUp = () => {
                              const toRow = dragToRowRef.current ?? ri;
                              if (toRow < seed.r0 || toRow > seed.r1) onDragFill(toRow, seed);
                              setDragFromRow(null);
                              dragToRowRef.current = null;
                              window.removeEventListener("mouseup", onUp);
                              window.removeEventListener("mousemove", onMove);
                            };
                            window.addEventListener("mouseup", onUp);
                            window.addEventListener("mousemove", onMove);
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
              {isRejected && row.rejectionNote && (
                <tr className="bg-destructive/5">
                  <td colSpan={COLUMNS.length + 2} className="px-3 py-1.5 text-xs text-destructive border-t">
                    <strong>Returned by approver:</strong> {row.rejectionNote}
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true"><td colSpan={COLUMNS.length + 2} style={{ height: paddingBottom, padding: 0, border: 0 }} /></tr>
          )}
        </tbody>
      </table>
      {/* Rejection notes banner under each rejected row */}
      <div className="text-xs text-muted-foreground p-2 border-t">
        Tip: Tab/Shift+Tab to move horizontally, Enter to move down, F2 or double-click to edit, Ctrl/Cmd+C to copy, Ctrl/Cmd+V to paste, Ctrl/Cmd+Z to undo.
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: DraftRow }) {
  const status = row.submissionStatus;
  if (status === "draft") return <Badge variant="outline" className="text-xs">Draft</Badge>;
  if (status === "submitted") return <Badge variant="secondary" className="text-xs">Submitted</Badge>;
  if (status === "approved") return <Badge className="text-xs bg-green-600 text-white">Approved</Badge>;
  if (status === "rejected") return (
    <Tooltip>
      <TooltipTrigger asChild><Badge variant="destructive" className="text-xs cursor-help">Rejected</Badge></TooltipTrigger>
      <TooltipContent>{row.rejectionNote || "Returned by approver"}</TooltipContent>
    </Tooltip>
  );
  if (status === "locked") return <Badge variant="outline" className="text-xs">Locked</Badge>;
  return null;
}

function CellContent(props: {
  row: DraftRow;
  rowIndex: number;
  col: ColKey;
  projects: ProjectWithClient[];
  editable: boolean;
  editing: boolean;
  setEditing: (on: boolean) => void;
  updateCell: (row: number, col: ColKey, value: unknown) => void;
  personId: string;
}) {
  const { row, rowIndex, col, projects, editable, editing, setEditing, updateCell, personId } = props;
  const value = readCell(row, col);

  // ── Display-only mode ───────────────────────────
  if (!editable || !editing) {
    let display: React.ReactNode = "";
    if (col === "billable") {
      return (
        <div className="px-2 py-1.5 flex items-center gap-2">
          <Checkbox
            checked={!!value}
            disabled={!editable}
            onCheckedChange={(v) => updateCell(rowIndex, "billable", !!v)}
            data-testid={`grid-cell-billable-${rowIndex}`}
          />
          <span className="text-xs">{value ? "Yes" : "No"}</span>
          <RowStateIndicator row={row} />
        </div>
      );
    }
    if (col === "projectId") {
      const p = projects.find((p) => p.id === value);
      display = p ? (p.code ? `${p.code} · ${formatProjectLabel(p)}` : formatProjectLabel(p)) : <span className="text-muted-foreground italic">—</span>;
    } else if (col === "allocationId") {
      display = value ? <AllocationLabel allocationId={String(value)} projectId={row.projectId} personId={personId} /> : <span className="text-muted-foreground italic">—</span>;
    } else if (col === "milestoneId") {
      display = value ? <MilestoneLabel milestoneId={String(value)} projectId={row.projectId} /> : <span className="text-muted-foreground italic">—</span>;
    } else {
      display = value || <span className="text-muted-foreground italic">—</span>;
    }
    return (
      <div
        className={cn("px-2 py-1.5 truncate min-h-[28px]", editable && "cursor-text")}
        onClick={() => editable && setEditing(true)}
        data-testid={`grid-cell-${col}-${rowIndex}`}
      >
        {display}
      </div>
    );
  }

  // ── Editor mode ─────────────────────────────────
  const close = () => setEditing(false);

  const strValue = typeof value === "string" ? value : "";
  if (col === "date") {
    return <DateEditor value={strValue} onCommit={(v) => { updateCell(rowIndex, "date", v); close(); }} onCancel={close} />;
  }
  if (col === "hours") {
    return <HoursEditor value={strValue} onCommit={(v) => { updateCell(rowIndex, "hours", v); close(); }} onCancel={close} />;
  }
  if (col === "description") {
    return <DescriptionEditor row={row} rowIndex={rowIndex} updateCell={updateCell} onCommit={close} onCancel={close} />;
  }
  if (col === "projectId") {
    return (
      <ComboEditor
        items={projects.map((p) => ({
          id: p.id,
          label: p.code ? `${p.code} · ${formatProjectLabel(p)}` : formatProjectLabel(p),
        }))}
        value={strValue}
        onCommit={(v) => { updateCell(rowIndex, "projectId", v); close(); }}
        onCancel={close}
      />
    );
  }
  if (col === "allocationId") {
    return (
      <AllocationEditor
        projectId={row.projectId}
        personId={personId}
        value={strValue}
        currentDescription={row.description}
        onCommit={(v, taskDescription) => {
          updateCell(rowIndex, "allocationId", v);
          if (taskDescription && !row.description) {
            setTimeout(() => updateCell(rowIndex, "description", taskDescription), 0);
          }
          close();
        }}
        onCancel={close}
      />
    );
  }
  if (col === "milestoneId") {
    return (
      <MilestoneEditor
        projectId={row.projectId}
        value={strValue}
        onCommit={(v) => { updateCell(rowIndex, "milestoneId", v); close(); }}
        onCancel={close}
      />
    );
  }
  if (col === "billable") {
    return (
      <div className="px-2 py-1.5">
        <Checkbox checked={!!value} onCheckedChange={(v) => { updateCell(rowIndex, "billable", !!v); close(); }} />
      </div>
    );
  }
  return null;
}

function RowStateIndicator({ row }: { row: DraftRow }) {
  if (row.state === "saving") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (row.state === "saved") return <CheckCircle2 className="h-3 w-3 text-green-600" />;
  if (row.state === "error")
    return (
      <Tooltip>
        <TooltipTrigger asChild><Circle className="h-3 w-3 fill-destructive text-destructive" /></TooltipTrigger>
        <TooltipContent>{row.saveError || "Save error"}</TooltipContent>
      </Tooltip>
    );
  if (row.state === "dirty") return <Circle className="h-2 w-2 fill-amber-500 text-amber-500 animate-pulse" />;
  return null;
}

// ─── Editors ───────────────────────────────────────────────────────────────

function DateEditor({ value, onCommit, onCancel }: { value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value || "");
  return (
    <Popover open onOpenChange={(o) => !o && onCancel()}>
      <PopoverTrigger asChild>
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { const c = coerceDate(text) ?? text; onCommit(c); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); const c = coerceDate(text) ?? text; onCommit(c); }
            if (e.key === "Escape") onCancel();
          }}
          className="h-8 px-2 border-0 rounded-none"
          placeholder="YYYY-MM-DD or M/D"
        />
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto" align="start">
        <Calendar
          mode="single"
          selected={value ? new Date(value + "T00:00:00") : undefined}
          onSelect={(d) => {
            if (d) {
              const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              onCommit(v);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function HoursEditor({ value, onCommit, onCancel }: { value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value || "");
  return (
    <Input
      type="number"
      step="0.25"
      min="0.01"
      max="24"
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(text); }
        if (e.key === "Escape") onCancel();
      }}
      className="h-8 px-2 border-0 rounded-none"
    />
  );
}

function readCell(row: DraftRow, col: ColKey): string | boolean | undefined {
  switch (col) {
    case "date": return row.date;
    case "projectId": return row.projectId;
    case "allocationId": return row.allocationId;
    case "description": return row.description;
    case "hours": return row.hours;
    case "billable": return row.billable;
    case "milestoneId": return row.milestoneId;
  }
}

function DescriptionEditor(props: { row: DraftRow; rowIndex: number; updateCell: (r: number, c: ColKey, v: unknown) => void; onCommit: () => void; onCancel: () => void }) {
  const { row, rowIndex, updateCell, onCommit, onCancel } = props;
  const [text, setText] = useState(row.description || "");
  const [previousText, setPreviousText] = useState<string | null>(null);
  const { data: aiStatus } = useAIStatus();
  const rewrite = useRewriteTimeEntryDescription();
  const aiAvailable = !!aiStatus?.configured;

  const doRewrite = async () => {
    if (!text.trim()) return;
    try {
      const result = await rewrite.mutateAsync({
        description: text.trim(),
        projectId: row.projectId || undefined,
        hours: row.hours,
        date: row.date,
        billable: row.billable,
        milestoneId: row.milestoneId || undefined,
      });
      const next = (result.rewritten || "").trim();
      if (next) {
        setPreviousText(text);
        setText(next);
        console.log("[TIME-GRID] ai-rewrite");
      }
    } catch (e) {
      // fall through
    }
  };

  return (
    <Popover open onOpenChange={(o) => !o && (updateCell(rowIndex, "description", text), onCommit())}>
      <PopoverTrigger asChild>
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); updateCell(rowIndex, "description", text); onCommit(); }
            if (e.key === "Escape") onCancel();
          }}
          className="h-8 px-2 border-0 rounded-none"
        />
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3 space-y-2" align="start">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full text-sm border rounded p-2"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {previousText !== null && (
              <Button size="sm" variant="ghost" onClick={() => { setText(previousText); setPreviousText(null); }}>
                <Undo2 className="h-3 w-3 mr-1" /> Undo
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={doRewrite}
              disabled={!aiAvailable || !text.trim() || rewrite.isPending}
            >
              {rewrite.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Rewrite
            </Button>
          </div>
          <Button size="sm" onClick={() => { updateCell(rowIndex, "description", text); onCommit(); }}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ComboEditor({ items, value, onCommit, onCancel }: { items: { id: string; label: string }[]; value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return items.filter((i) => !s || i.label.toLowerCase().includes(s));
  }, [items, search]);
  return (
    <Popover open onOpenChange={(o) => !o && onCancel()}>
      <PopoverTrigger asChild><span /></PopoverTrigger>
      <PopoverContent className="p-0 w-[260px]" align="start">
        <Input autoFocus className="h-8 border-0 rounded-none" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} />
        <div className="max-h-[260px] overflow-auto">
          {filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              className={cn("block w-full text-left px-2 py-1.5 text-sm hover:bg-accent", i.id === value && "bg-accent")}
              onClick={() => onCommit(i.id)}
            >
              {i.label}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No matches</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Allocation editor + label component (queries by project + person)
interface Allocation { id: string; taskDescription?: string; role?: { name?: string }; hours?: string | number }
interface Milestone { id: string; name: string }

function useAllocations(projectId: string, personId: string) {
  return useQuery<Allocation[]>({
    queryKey: ["/api/projects", projectId, "allocations", personId],
    enabled: !!projectId && !!personId,
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch(`/api/projects/${projectId}/allocations?personId=${personId}`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

function useMilestones(projectId: string) {
  return useQuery<Milestone[]>({
    queryKey: ["/api/projects", projectId, "milestones"],
    enabled: !!projectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

function AllocationLabel({ allocationId, projectId, personId }: { allocationId: string; projectId: string; personId: string }) {
  const { data } = useAllocations(projectId, personId);
  const a = data?.find((x) => x.id === allocationId);
  return <>{a?.taskDescription || a?.role?.name || allocationId.slice(0, 6)}</>;
}

function MilestoneLabel({ milestoneId, projectId }: { milestoneId: string; projectId: string }) {
  const { data } = useMilestones(projectId);
  const m = data?.find((x) => x.id === milestoneId);
  return <>{m?.name || milestoneId.slice(0, 6)}</>;
}

function AllocationEditor(props: { projectId: string; personId: string; value: string; currentDescription: string; onCommit: (v: string, taskDescription?: string) => void; onCancel: () => void }) {
  const { projectId, personId, value, onCommit, onCancel } = props;
  const { data = [] } = useAllocations(projectId, personId);
  if (!projectId) {
    return <div className="px-2 py-1.5 text-xs text-muted-foreground">Choose a project first</div>;
  }
  const items = [
    { id: "", label: "— None —" },
    ...data.map((a) => ({ id: a.id, label: a.taskDescription || a.role?.name || `${a.hours}h` })),
  ];
  return (
    <ComboEditor
      items={items}
      value={value}
      onCommit={(id) => {
        const sel = data.find((a) => a.id === id);
        onCommit(id, sel?.taskDescription);
      }}
      onCancel={onCancel}
    />
  );
}

function MilestoneEditor(props: { projectId: string; value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const { projectId, value, onCommit, onCancel } = props;
  const { data = [] } = useMilestones(projectId);
  if (!projectId) return <div className="px-2 py-1.5 text-xs text-muted-foreground">Choose a project first</div>;
  const items = [{ id: "", label: "— None —" }, ...data.map((m) => ({ id: m.id, label: m.name }))];
  return <ComboEditor items={items} value={value} onCommit={onCommit} onCancel={onCancel} />;
}
