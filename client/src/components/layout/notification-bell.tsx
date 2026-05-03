import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICONS: Record<string, string> = {
  expense_submitted: "💰",
  expense_approval_needed: "⏳",
  expense_approved: "✅",
  expense_rejected: "❌",
  project_health_alert: "⚠️",
  raidd_overdue: "🔔",
  status_report_due: "📋",
  ai_budget_alert: "🤖",
  general: "📢",
};

export function NotificationBell() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, refetch } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ["/api/notifications", "bell"],
    queryFn: () => apiRequest("/api/notifications?limit=10&unreadOnly=false"),
    enabled: !!user,
    refetchInterval: 30_000,
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
    },
  });

  const unreadCountForTitle = data?.unreadCount ?? 0;
  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");
    if (unreadCountForTitle > 0) {
      const prefix = unreadCountForTitle > 99 ? "99+" : String(unreadCountForTitle);
      document.title = `(${prefix}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
    return () => {
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, "");
    };
  }, [unreadCountForTitle]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleNotificationClick = (n: Notification) => {
    if (!n.readAt) {
      markReadMutation.mutate(n.id);
    }
    setOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        data-testid="button-notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">({unreadCount} unread)</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${
                    !n.readAt ? "bg-primary/5" : ""
                  }`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5 shrink-0">
                      {TYPE_ICONS[n.type] ?? "📢"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {!n.readAt && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                        <p className="text-sm font-medium truncate">{n.title}</p>
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline block text-center"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
