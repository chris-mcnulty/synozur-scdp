import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SynozurTextLogo } from "@/components/icons/synozur-logo";
import { SynozurAppSwitcher } from "@/components/synozur-app-switcher";
import { getRoleDisplayName } from "@/lib/auth";
import { Settings, LogOut } from "lucide-react";
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

interface UserSettings {
  receiveTimeReminders: boolean;
  calendarSuggestionsEnabled: boolean;
  calendarSuggestionsDaysBack: number;
}

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

  const updateCalendarSettingsMutation = useMutation({
    mutationFn: (settings: { calendarSuggestionsEnabled?: boolean; calendarSuggestionsDaysBack?: number }) =>
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
        <DialogContent className="sm:max-w-md" data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Manage your account preferences
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between" data-testid="setting-time-reminders">
              <div className="space-y-0.5">
                <Label htmlFor="time-reminders">Time Entry Reminders</Label>
                <p className="text-sm text-muted-foreground">
                  Receive weekly email reminders to submit your time entries
                </p>
              </div>
              <Switch
                id="time-reminders"
                data-testid="switch-time-reminders"
                checked={reminderSettingsQuery.data?.receiveTimeReminders ?? true}
                disabled={reminderSettingsQuery.isLoading || toggleRemindersMutation.isPending}
                onCheckedChange={(checked) => toggleRemindersMutation.mutate(checked)}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between" data-testid="setting-calendar-suggestions">
                <div className="space-y-0.5">
                  <Label htmlFor="calendar-suggestions">Calendar Suggestions</Label>
                  <p className="text-sm text-muted-foreground">
                    Show Outlook calendar events as time entry suggestions on the time tracking page
                  </p>
                </div>
                <Switch
                  id="calendar-suggestions"
                  data-testid="switch-calendar-suggestions"
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
                        <SelectItem value="1">Today + 1 day</SelectItem>
                        <SelectItem value="3">Today + 3 days</SelectItem>
                        <SelectItem value="7">Today + 7 days</SelectItem>
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
