import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SynozurTextLogo } from "@/components/icons/synozur-logo";
import { SynozurAppSwitcher } from "@/components/synozur-app-switcher";
import { getRoleDisplayName } from "@/lib/auth";
import { Settings, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, setSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "./mobile-nav";
import { GlobalSearch } from "./global-search";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "./notification-bell";
import { CalendarMappingsManager } from "@/components/calendar-mappings-manager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Project, Client } from "@shared/schema";

type ProjectWithClient = Project & { client: Client };

interface UserSettings {
  receiveTimeReminders: boolean;
  calendarSuggestionsEnabled: boolean;
  calendarSuggestionsDaysBack: number;
  calendarDefaultProjectId: string | null;
}

interface DigestPreferences {
  weeklyDigestEnabled: boolean;
  weeklyDigestDay: number;
  weeklyDigestTime: string;
}

const DIGEST_DAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
];

const DIGEST_TIMES = [
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

export function Header() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      setSessionId(null);
      queryClient.clear();
      navigate("/login");
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    },
  });

  const reminderSettingsQuery = useQuery<UserSettings>({
    queryKey: ['/api/users', user?.id, 'reminder-settings'],
    enabled: !!user && settingsOpen,
  });

  const digestPreferencesQuery = useQuery<DigestPreferences>({
    queryKey: ["/api/me/digest-preferences"],
    queryFn: () => apiRequest("/api/me/digest-preferences"),
    enabled: !!user && settingsOpen,
  });

  const updateDigestPreferencesMutation = useMutation({
    mutationFn: (settings: DigestPreferences) =>
      apiRequest("/api/me/digest-preferences", {
        method: "PUT",
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/digest-preferences"] });
      toast({
        title: "Weekly digest updated",
        description: "Your weekly email preference has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't save weekly digest",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleRemindersMutation = useMutation({
    mutationFn: (receiveTimeReminders: boolean) => 
      apiRequest(`/api/users/${user?.id}/reminder-settings`, {
        method: "PATCH",
        body: JSON.stringify({ receiveTimeReminders }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'reminder-settings'] });
      toast({
        title: "Settings updated",
        description: "Your reminder preferences have been saved",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update reminder settings",
        variant: "destructive",
      });
    },
  });

  const projectsQuery = useQuery<ProjectWithClient[]>({
    queryKey: ['/api/projects'],
    enabled: !!user && settingsOpen,
  });

  const updateCalendarSettingsMutation = useMutation({
    mutationFn: (settings: { calendarSuggestionsEnabled?: boolean; calendarSuggestionsDaysBack?: number; calendarDefaultProjectId?: string | null }) =>
      apiRequest("/api/me/calendar-suggestions/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'reminder-settings'] });
      toast({
        title: "Settings updated",
        description: "Your calendar suggestion preferences have been saved",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update calendar settings",
        variant: "destructive",
      });
    },
  });

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const calendarEnabled = reminderSettingsQuery.data?.calendarSuggestionsEnabled ?? true;
  const daysBack = reminderSettingsQuery.data?.calendarSuggestionsDaysBack ?? 0;
  const calendarDefaultProjectId = reminderSettingsQuery.data?.calendarDefaultProjectId ?? null;
  const digestPreferences = digestPreferencesQuery.data ?? {
    weeklyDigestEnabled: true,
    weeklyDigestDay: 1,
    weeklyDigestTime: "08:00",
  };
  const activeProjects = (projectsQuery.data ?? []).filter((p: ProjectWithClient) => p.status === 'active');

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50" data-testid="header">
      <div className="flex items-center justify-between px-4 lg:px-6 py-4">
        <div className="flex items-center space-x-2 lg:space-x-6">
          <SynozurAppSwitcher currentApp="constellation" />
          <MobileNav />
          <SynozurTextLogo />
        </div>

        {/* Global Search */}
        <div className="flex-1 flex justify-center px-4">
          <GlobalSearch />
        </div>

        {/* User Menu */}
        <div className="flex items-center space-x-4">
          <TenantSwitcher />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title="Ask Constellation"
            aria-label="Ask Constellation"
            onClick={() => window.dispatchEvent(new Event("constellation:open-help-chat"))}
            data-testid="button-open-help-chat"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <NotificationBell />
          {user && (
            <>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium" data-testid="text-username">{user.name}</p>
                <p className="text-xs text-primary font-medium" data-testid="text-userrole">
                  {getRoleDisplayName(user.role)}
                </p>
              </div>
              <div className="w-8 h-8 synozur-gradient rounded-full flex items-center justify-center" data-testid="avatar-user">
                <span className="text-white text-sm font-medium">
                  {getUserInitials(user.name)}
                </span>
              </div>
            </>
          )}
          <ThemeToggle />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            data-testid="button-settings"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-lg"
          data-testid="dialog-settings"
        >
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Manage your account preferences
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-2 pr-1">
            <div className="flex items-start justify-between gap-4" data-testid="setting-time-reminders">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="time-reminders">Time Entry Reminders</Label>
                <p className="text-sm text-muted-foreground">
                  Receive weekly email reminders to submit your time entries
                </p>
              </div>
              <Switch
                id="time-reminders"
                data-testid="switch-time-reminders"
                className="shrink-0"
                checked={reminderSettingsQuery.data?.receiveTimeReminders ?? true}
                disabled={reminderSettingsQuery.isLoading || toggleRemindersMutation.isPending}
                onCheckedChange={(checked) => toggleRemindersMutation.mutate(checked)}
              />
            </div>

            <Separator />

            <div className="space-y-4" data-testid="setting-weekly-digest">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="weekly-digest">Weekly Digest Email</Label>
                  <p className="text-sm text-muted-foreground">
                    A personal weekly summary of your assignments, approvals, RAIDD items, milestones, and time activity.
                  </p>
                </div>
                <Switch
                  id="weekly-digest"
                  data-testid="switch-weekly-digest"
                  className="shrink-0"
                  checked={digestPreferences.weeklyDigestEnabled}
                  disabled={digestPreferencesQuery.isLoading || updateDigestPreferencesMutation.isPending}
                  onCheckedChange={(weeklyDigestEnabled) =>
                    updateDigestPreferencesMutation.mutate({ ...digestPreferences, weeklyDigestEnabled })
                  }
                />
              </div>

              {digestPreferences.weeklyDigestEnabled && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="weekly-digest-day">Delivery day</Label>
                    <Select
                      value={String(digestPreferences.weeklyDigestDay)}
                      onValueChange={(value) =>
                        updateDigestPreferencesMutation.mutate({
                          ...digestPreferences,
                          weeklyDigestDay: Number(value),
                        })
                      }
                      disabled={digestPreferencesQuery.isLoading || updateDigestPreferencesMutation.isPending}
                    >
                      <SelectTrigger id="weekly-digest-day" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIGEST_DAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="weekly-digest-time">Delivery time</Label>
                    <Select
                      value={digestPreferences.weeklyDigestTime}
                      onValueChange={(weeklyDigestTime) =>
                        updateDigestPreferencesMutation.mutate({ ...digestPreferences, weeklyDigestTime })
                      }
                      disabled={digestPreferencesQuery.isLoading || updateDigestPreferencesMutation.isPending}
                    >
                      <SelectTrigger id="weekly-digest-time" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIGEST_TIMES.map((time) => (
                          <SelectItem key={time.value} value={time.value}>{time.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4" data-testid="setting-calendar-suggestions">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="calendar-suggestions">Calendar Suggestions</Label>
                  <p className="text-sm text-muted-foreground">
                    Show Outlook calendar events as time entry suggestions on the time tracking page
                  </p>
                </div>
                <Switch
                  id="calendar-suggestions"
                  data-testid="switch-calendar-suggestions"
                  className="shrink-0"
                  checked={calendarEnabled}
                  disabled={reminderSettingsQuery.isLoading || updateCalendarSettingsMutation.isPending}
                  onCheckedChange={(checked) =>
                    updateCalendarSettingsMutation.mutate({ calendarSuggestionsEnabled: checked })
                  }
                />
              </div>

              {calendarEnabled && (
                <>
                  <div className="flex items-center justify-between pl-0" data-testid="setting-calendar-days-back">
                    <div className="space-y-0.5">
                      <Label htmlFor="calendar-days-back">Look back</Label>
                      <p className="text-sm text-muted-foreground">
                        How many days back to fetch suggestions
                      </p>
                    </div>
                    <Select
                      value={String(daysBack)}
                      onValueChange={(val) =>
                        updateCalendarSettingsMutation.mutate({ calendarSuggestionsDaysBack: parseInt(val) })
                      }
                      disabled={reminderSettingsQuery.isLoading || updateCalendarSettingsMutation.isPending}
                    >
                      <SelectTrigger className="w-36" id="calendar-days-back">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Today only</SelectItem>
                        <SelectItem value="1">Today + 1 day back</SelectItem>
                        <SelectItem value="3">Today + 3 days back</SelectItem>
                        <SelectItem value="7">Today + 7 days back</SelectItem>
                        <SelectItem value="14">Today + 14 days back</SelectItem>
                        <SelectItem value="30">Today + 30 days back</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2" data-testid="setting-calendar-default-project">
                    <div className="space-y-0.5">
                      <Label htmlFor="calendar-default-project">Default project</Label>
                      <p className="text-sm text-muted-foreground">
                        Used as a fallback when no meeting matches automatically
                      </p>
                    </div>
                    <Select
                      value={calendarDefaultProjectId ?? "__none__"}
                      onValueChange={(val) =>
                        updateCalendarSettingsMutation.mutate({
                          calendarDefaultProjectId: val === "__none__" ? null : val,
                        })
                      }
                      disabled={reminderSettingsQuery.isLoading || projectsQuery.isLoading || updateCalendarSettingsMutation.isPending}
                    >
                      <SelectTrigger className="w-full" id="calendar-default-project">
                        <SelectValue placeholder="None — show picker" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None — show picker</SelectItem>
                        {activeProjects.map((p: ProjectWithClient) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.client?.name ? ` · ${p.client.name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2" data-testid="setting-calendar-mappings">
                    <div className="space-y-0.5">
                      <Label>Saved event mappings</Label>
                      <p className="text-sm text-muted-foreground">
                        Recurring meetings you've matched to projects. Change or remove any to
                        improve future suggestions.
                      </p>
                    </div>
                    <CalendarMappingsManager />
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
