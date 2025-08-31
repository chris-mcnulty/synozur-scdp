import { useAuth } from "@/hooks/use-auth";
import { SynozurTextLogo } from "@/components/icons/synozur-logo";
import { getRoleDisplayName } from "@/lib/auth";
import { Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, setSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function Header() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center space-x-6">
          <SynozurTextLogo />
          
          {/* Quick Navigation */}
          <nav className="hidden md:flex space-x-4" data-testid="nav-quick">
            <a 
              href="/" 
              className="px-3 py-2 text-sm font-medium text-primary bg-accent/20 rounded-md"
              data-testid="link-dashboard"
            >
              Dashboard
            </a>
            <a 
              href="/projects" 
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors"
              data-testid="link-projects"
            >
              Projects
            </a>
            <a 
              href="/time" 
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors"
              data-testid="link-time"
            >
              Time
            </a>
            <a 
              href="/billing" 
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors"
              data-testid="link-billing"
            >
              Billing
            </a>
          </nav>
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
          <Button variant="ghost" size="sm" data-testid="button-settings">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
