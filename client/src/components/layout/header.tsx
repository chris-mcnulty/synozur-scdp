import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SynozurTextLogo } from "@/components/icons/synozur-logo";
import { getRoleDisplayName } from "@/lib/auth";
import { Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, setSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "./mobile-nav";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const reminderSettingsQuery = useQuery<{ receiveTimeReminders: boolean }>({
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

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50" data-testid="header">
      <div className="flex items-center justify-between px-4 lg:px-6 py-4">
        <div className="flex items-center space-x-2 lg:space-x-6">
          <MobileNav />
          <SynozurTextLogo />
        </div>
        
        {/* User Menu */}
        <div className="flex items-center space-x-4">
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
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
