import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Bell, BellOff, Check, CheckCheck, Trash2, ExternalLink, Filter, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityRef: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  expense_submitted: "Expense Submitted",
  expense_approval_needed: "Approval Needed",
  expense_approved: "Expense Approved",
  expense_rejected: "Expense Rejected",
  project_health_alert: "Project Health",
  raidd_overdue: "RAIDD Overdue",
  status_report_due: "Status Report Due",
  ai_budget_alert: "AI Budget Alert",
  general: "General",
};

const TYPE_COLORS: Record<string, string> = {
  expense_submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  expense_approval_needed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  expense_approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  expense_rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  project_health_alert: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  raidd_overdue: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  status_report_due: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  ai_budget_alert: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const NOTIFICATION_TYPES = [
  { value: "expense_submitted", label: "Expense Submitted" },
  { value: "expense_approval_needed", label: "Approval Needed" },
  { value: "expense_approved", label: "Expense Approved" },
  { value: "expense_rejected", label: "Expense Rejected" },
  { value: "project_health_alert", label: "Project Health" },
  { value: "raidd_overdue", label: "RAIDD Overdue" },
  { value: "status_report_due", label: "Status Report Due" },
  { value: "ai_budget_alert", label: "AI Budget Alert" },
  { value: "general", label: "General" },
];

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryParams = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(unreadOnly && { unreadOnly: "true" }),
    ...(typeFilter !== "all" && { type: typeFilter }),
    ...(entityFilter.trim() && { entityRef: entityFilter.trim() }),
  });

  const { data, isLoading } = useQuery<{
    notifications: Notification[];
    unreadCount: number;
  }>({
    queryKey: ["/api/notifications", { unreadOnly, typeFilter, entityFilter, page }],
    queryFn: () => apiRequest(`/api/notifications?${queryParams}`),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const dismissAllReadMutation = useMutation({
    mutationFn: () => apiRequest("/api/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Read notifications cleared" });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markSelectedRead = async () => {
    await Promise.all(Array.from(selected).map((id) => markReadMutation.mutateAsync(id)));
    setSelected(new Set());
    toast({ title: `${selected.size} notification(s) marked as read` });
  };

  const dismissSelected = async () => {
    await Promise.all(Array.from(selected).map((id) => dismissMutation.mutateAsync(id)));
    setSelected(new Set());
    toast({ title: `${selected.size} notification(s) dismissed` });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={markSelectedRead}>
                  <Check className="w-4 h-4 mr-1" />
                  Mark Read ({selected.size})
                </Button>
                <Button variant="outline" size="sm" onClick={dismissSelected}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Dismiss ({selected.size})
                </Button>
              </>
            )}
            {unreadCount > 0 && selected.size === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck className="w-4 h-4 mr-1" />
                Mark All Read
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => dismissAllReadMutation.mutate()}
              disabled={dismissAllReadMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear Read
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Button
            variant={unreadOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setUnreadOnly(!unreadOnly);
              setPage(0);
            }}
          >
            <BellOff className="w-3 h-3 mr-1" />
            Unread Only
          </Button>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44 h-8">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {NOTIFICATION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Input
              placeholder="Filter by entity ref…"
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(0);
              }}
              className="h-8 w-52 pr-7 text-sm"
            />
            {entityFilter && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => { setEntityFilter(""); setPage(0); }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Notification List */}
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground text-lg">No notifications</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {unreadOnly ? "You're all caught up!" : "Notifications will appear here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((n) => (
              <Card
                key={n.id}
                className={`transition-colors ${
                  !n.readAt ? "border-primary/30 bg-primary/5" : "opacity-75"
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(n.id)}
                      onCheckedChange={() => toggleSelect(n.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            TYPE_COLORS[n.type] ?? TYPE_COLORS.general
                          }`}
                        >
                          {TYPE_LABELS[n.type] ?? n.type}
                        </span>
                        {!n.readAt && (
                          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{n.title}</p>
                      {n.body && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {n.link && (
                        <Link href={n.link}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Open">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      )}
                      {!n.readAt && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Mark as read"
                          onClick={() => markReadMutation.mutate(n.id)}
                          disabled={markReadMutation.isPending}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Dismiss"
                        onClick={() => dismissMutation.mutate(n.id)}
                        disabled={dismissMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={notifications.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}

        {/* Preferences Link */}
        <div className="mt-8 text-center">
          <Link href="/notifications/preferences">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Manage notification preferences
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
