import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmbedLayout } from "@/components/layout/embed-layout";
import { EmbedProvider, useEmbed } from "@/hooks/use-embed";
import { useSearch, useLocation } from "wouter";
import { Loader2, LogIn, AlertTriangle, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticating, authError, retryAuth, isTeams } = useEmbed();

  const { data: user, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !isAuthenticating,
  });

  if (isAuthenticating || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-lg text-muted-foreground">
            {isTeams ? "Authenticating with Teams..." : "Loading..."}
          </div>
        </div>
      </div>
    );
  }

  if (authError || (!user && userError)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <LogIn className="w-12 h-12 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Sign In Required</h2>
              <p className="text-muted-foreground">
                {authError || "Sign in required to view this content."}
              </p>
              <Button onClick={retryAuth} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <LogIn className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold">Sign In Required</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

function DashboardContent() {
  const [, setLocation] = useLocation();

  const { data: projects, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Projects</h2>
            <p className="text-muted-foreground">
              You don't have any projects assigned yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">My Projects</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project: any) => (
          <Card
            key={project.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setLocation(`/embed/projects/${project.id}`)}
          >
            <CardContent className="pt-6">
              <div className="font-semibold mb-1">{project.name}</div>
              {project.clientName && (
                <div className="text-sm text-muted-foreground mb-2">{project.clientName}</div>
              )}
              <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                {project.status || "active"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function EmbedDashboard() {
  const searchString = useSearch();
  const { theme, readonly } = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return {
      theme: params.get("theme") || undefined,
      readonly: params.get("readonly") === "true",
    };
  }, [searchString]);

  return (
    <EmbedProvider theme={theme} readonly={readonly}>
      <EmbedLayoutInner>
        <DashboardAuthGate>
          <DashboardContent />
        </DashboardAuthGate>
      </EmbedLayoutInner>
    </EmbedProvider>
  );
}

function EmbedLayoutInner({ children }: { children: React.ReactNode }) {
  const { theme } = useEmbed();
  return <EmbedLayout theme={theme}>{children}</EmbedLayout>;
}
