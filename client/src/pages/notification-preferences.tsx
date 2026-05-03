import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Bell, Save, Mail, Send, Loader2, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribedForCurrentTenant,
} from "@/lib/push-notifications";

type PrefRow = {
  notificationType: string;
  inApp: boolean;
  email: boolean;
  teams: boolean;
};

type DigestPrefs = {
  weeklyDigestEnabled: boolean;
  weeklyDigestDay: number;
  weeklyDigestTime: string;
};

const NOTIFICATION_TYPES = [
  {
    value: "expense_submitted",
    label: "Expense Submitted",
    description: "When you submit an expense report for approval",
    category: "Expenses",
  },
  {
    value: "expense_approval_needed",
    label: "Approval Needed",
    description: "When an expense report requires your approval",
    category: "Expenses",
  },
  {
    value: "expense_approved",
    label: "Expense Approved",
    description: "When your expense report is approved",
    category: "Expenses",
  },
  {
    value: "expense_rejected",
    label: "Expense Rejected",
    description: "When your expense report is rejected or needs revision",
    category: "Expenses",
  },
  {
    value: "project_health_alert",
    label: "Project Health Alert",
    description: "When a project's health status changes to At Risk or Over Budget",
    category: "Projects",
  },
  {
    value: "raidd_overdue",
    label: "RAIDD Item Overdue",
    description: "When a RAIDD item passes its due date without resolution",
    category: "Projects",
  },
  {
    value: "status_report_due",
    label: "Status Report Due",
    description: "When a project has not had a status report in 14+ days",
    category: "Projects",
  },
  {
    value: "ai_budget_alert",
    label: "AI Budget Alert",
    description: "When AI token usage reaches a configured threshold",
    category: "Platform",
  },
  {
    value: "general",
    label: "General",
    description: "Other platform notifications",
    category: "Platform",
  },
];

const DEFAULTS: Record<string, { inApp: boolean; email: boolean; teams: boolean }> = {
  expense_submitted:        { inApp: true, email: true,  teams: false },
  expense_approval_needed:  { inApp: true, email: true,  teams: false },
  expense_approved:         { inApp: true, email: true,  teams: false },
  expense_rejected:         { inApp: true, email: true,  teams: false },
  project_health_alert:     { inApp: true, email: false, teams: true  },
  raidd_overdue:            { inApp: true, email: false, teams: true  },
  status_report_due:        { inApp: true, email: false, teams: true  },
  ai_budget_alert:          { inApp: true, email: true,  teams: false },
  general:                  { inApp: true, email: false, teams: false },
};

const CATEGORIES = ["Expenses", "Projects", "Platform"];

const DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const TIME_OPTIONS = [
  { value: "06:00", label: "6:00 AM" },
  { value: "07:00", label: "7:00 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "17:00", label: "5:00 PM" },
];

export default function NotificationPreferencesPage() {
  const { toast } = useToast();

  const { data: savedPrefs, isLoading } = useQuery<PrefRow[]>({
    queryKey: ["/api/me/notification-preferences"],
    queryFn: () => apiRequest("/api/me/notification-preferences"),
  });

  const { data: digestPrefsData, isLoading: digestLoading } = useQuery<DigestPrefs>({
    queryKey: ["/api/me/digest-preferences"],
    queryFn: () => apiRequest("/api/me/digest-preferences"),
  });

  const [prefs, setPrefs] = useState<Record<string, { inApp: boolean; email: boolean; teams: boolean }>>({});
  const [dirty, setDirty] = useState(false);

  const [digestPrefs, setDigestPrefs] = useState<DigestPrefs>({
    weeklyDigestEnabled: true,
    weeklyDigestDay: 1,
    weeklyDigestTime: "08:00",
  });
  const [digestDirty, setDigestDirty] = useState(false);

  const pushSupported = isPushSupported();
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    getNotificationPermission()
  );

  useEffect(() => {
    let cancelled = false;
    if (pushSupported) {
      // Reconciles the browser's PushSubscription with the server's
      // tenant-scoped subscription record so the toggle reflects this
      // workspace's opt-in state, not just the device's.
      isSubscribedForCurrentTenant().then((sub) => {
        if (!cancelled) setPushSubscribed(sub);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [pushSupported]);

  const handlePushToggle = async (enable: boolean) => {
    if (!pushSupported) return;
    setPushBusy(true);
    try {
      if (enable) {
        const result = await subscribeToPush();
        setPushPermission(getNotificationPermission());
        if (result.ok) {
          setPushSubscribed(true);
          toast({ title: "Browser notifications enabled" });
        } else {
          toast({
            title: "Couldn't enable browser notifications",
            description: result.reason,
            variant: "destructive",
          });
        }
      } else {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        toast({ title: "Browser notifications disabled" });
      }
    } catch (err: any) {
      toast({
        title: "Browser notifications error",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    const base: Record<string, { inApp: boolean; email: boolean; teams: boolean }> = {};
    for (const nt of NOTIFICATION_TYPES) {
      base[nt.value] = { ...(DEFAULTS[nt.value] ?? { inApp: true, email: false, teams: false }) };
    }
    if (savedPrefs) {
      for (const p of savedPrefs) {
        base[p.notificationType] = { inApp: p.inApp, email: p.email, teams: p.teams };
      }
    }
    setPrefs(base);
    setDirty(false);
  }, [savedPrefs]);

  useEffect(() => {
    if (digestPrefsData) {
      setDigestPrefs(digestPrefsData);
      setDigestDirty(false);
    }
  }, [digestPrefsData]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = Object.entries(prefs).map(([notificationType, channels]) => ({
        notificationType,
        ...channels,
      }));
      return apiRequest("/api/me/notification-preferences", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notification-preferences"] });
      toast({ title: "Preferences saved" });
      setDirty(false);
    },
    onError: () => {
      toast({ title: "Failed to save preferences", variant: "destructive" });
    },
  });

  const saveDigestMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/me/digest-preferences", {
        method: "PUT",
        body: JSON.stringify(digestPrefs),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/digest-preferences"] });
      toast({ title: "Digest preferences saved" });
      setDigestDirty(false);
    },
    onError: () => {
      toast({ title: "Failed to save digest preferences", variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/me/digest/preview", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (data: any) => {
      if (data?.status === "sent") {
        toast({ title: "Preview digest sent", description: "Check your inbox." });
      } else if (data?.status === "skipped") {
        toast({ title: "Nothing to send", description: data.reason || "No actionable items this week." });
      } else {
        toast({ title: "Digest send failed", description: data?.reason, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to send preview", variant: "destructive" });
    },
  });

  const toggle = (type: string, channel: "inApp" | "email" | "teams") => {
    setPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type]?.[channel] },
    }));
    setDirty(true);
  };

  if (isLoading || digestLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto py-6 px-4">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Notification Preferences</h1>
              <p className="text-sm text-muted-foreground">
                Choose which channels receive each type of notification
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/notifications">
              <Button variant="outline" size="sm">
                View Notifications
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              <Save className="w-4 h-4 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {CATEGORIES.map((category) => {
          const types = NOTIFICATION_TYPES.filter((t) => t.category === category);
          return (
            <Card key={category} className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left font-medium py-2 pr-4 w-full">Type</th>
                        <th className="text-center font-medium py-2 px-4 whitespace-nowrap">In-App</th>
                        <th className="text-center font-medium py-2 px-4 whitespace-nowrap">Email</th>
                        <th className="text-center font-medium py-2 px-4 whitespace-nowrap">Teams</th>
                      </tr>
                    </thead>
                    <tbody>
                      {types.map((t) => (
                        <tr key={t.value} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-sm">{t.label}</p>
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                          </td>
                          <td className="text-center py-3 px-4">
                            <Checkbox
                              checked={prefs[t.value]?.inApp ?? true}
                              onCheckedChange={() => toggle(t.value, "inApp")}
                            />
                          </td>
                          <td className="text-center py-3 px-4">
                            <Checkbox
                              checked={prefs[t.value]?.email ?? false}
                              onCheckedChange={() => toggle(t.value, "email")}
                            />
                          </td>
                          <td className="text-center py-3 px-4">
                            <Checkbox
                              checked={prefs[t.value]?.teams ?? false}
                              onCheckedChange={() => toggle(t.value, "teams")}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Separator className="my-6" />

        {/* Browser Push Notifications */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base">Browser Notifications</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Get critical alerts like expense approvals and project health warnings even when Constellation isn't the active tab.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="push-enabled" className="font-medium">
                  Enable browser notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  {!pushSupported
                    ? "Your browser doesn't support push notifications."
                    : pushPermission === "denied"
                      ? "Notifications are blocked in your browser settings. Allow notifications for this site to enable."
                      : pushSubscribed
                        ? "Push notifications are active on this device."
                        : "You'll be asked for permission, then this device will receive push alerts."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pushBusy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="push-enabled"
                  checked={pushSubscribed}
                  disabled={!pushSupported || pushBusy || pushPermission === "denied"}
                  onCheckedChange={handlePushToggle}
                  data-testid="switch-browser-notifications"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Digest */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base">Weekly Digest Email</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  A personalised summary of your open assignments, approvals, RAIDD items, milestones, and more — delivered once a week.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="digest-enabled" className="font-medium">Enable weekly digest</Label>
                <p className="text-xs text-muted-foreground">Receive a weekly HTML email summarising your Constellation activity</p>
              </div>
              <Switch
                id="digest-enabled"
                checked={digestPrefs.weeklyDigestEnabled}
                onCheckedChange={(checked) => {
                  setDigestPrefs((p) => ({ ...p, weeklyDigestEnabled: checked }));
                  setDigestDirty(true);
                }}
              />
            </div>

            {digestPrefs.weeklyDigestEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-sm">Delivery day</Label>
                  <Select
                    value={String(digestPrefs.weeklyDigestDay)}
                    onValueChange={(v) => {
                      setDigestPrefs((p) => ({ ...p, weeklyDigestDay: Number(v) }));
                      setDigestDirty(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Delivery time</Label>
                  <Select
                    value={digestPrefs.weeklyDigestTime}
                    onValueChange={(v) => {
                      setDigestPrefs((p) => ({ ...p, weeklyDigestTime: v }));
                      setDigestDirty(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Send className="w-4 h-4 mr-2" />}
                {previewMutation.isPending ? "Sending..." : "Send me a preview"}
              </Button>
              <Button
                size="sm"
                onClick={() => saveDigestMutation.mutate()}
                disabled={!digestDirty || saveDigestMutation.isPending}
              >
                <Save className="w-4 h-4 mr-1" />
                {saveDigestMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {dirty && (
          <div className="fixed bottom-6 right-6">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
