import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";

type PrefRow = {
  notificationType: string;
  inApp: boolean;
  email: boolean;
  teams: boolean;
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

export default function NotificationPreferencesPage() {
  const { toast } = useToast();

  const { data: savedPrefs, isLoading } = useQuery<PrefRow[]>({
    queryKey: ["/api/me/notification-preferences"],
    queryFn: () => apiRequest("/api/me/notification-preferences"),
  });

  const [prefs, setPrefs] = useState<Record<string, { inApp: boolean; email: boolean; teams: boolean }>>({});
  const [dirty, setDirty] = useState(false);

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

  const toggle = (type: string, channel: "inApp" | "email" | "teams") => {
    setPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type]?.[channel] },
    }));
    setDirty(true);
  };

  if (isLoading) {
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
