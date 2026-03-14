import { useMemo } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { EmbedLayout } from "@/components/layout/embed-layout";
import { EmbedProvider, useEmbed } from "@/hooks/use-embed";
import { Loader2, LogIn, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function EmbedAuthGate({ children }: { children: React.ReactNode }) {
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
              {authError?.includes("Sign in") ? (
                <LogIn className="w-12 h-12 text-muted-foreground" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-destructive" />
              )}
              <h2 className="text-xl font-semibold">
                {authError?.includes("Sign in") ? "Sign In Required" : "Authentication Error"}
              </h2>
              <p className="text-muted-foreground">
                {authError || "Unable to verify your identity. Please try again."}
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
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <LogIn className="w-12 h-12 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Sign In Required</h2>
              <p className="text-muted-foreground">
                Please sign in to Constellation to view this project.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

function EmbedProjectContent() {
  const { id } = useParams();
  const { isReadonly } = useEmbed();

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: [`/api/projects/${id}/analytics`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics?.project) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Project Not Found</h2>
            <p className="text-muted-foreground">
              The requested project could not be found or you don't have access to it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const project = analytics.project;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        <p className="text-muted-foreground">{project.clientName || "Project Overview"}</p>
      </div>
      <EmbedProjectTabs projectId={id!} analytics={analytics} isReadonly={isReadonly} />
    </div>
  );
}

function EmbedProjectTabs({ projectId, analytics, isReadonly }: { projectId: string; analytics: any; isReadonly: boolean }) {
  const searchString = useSearch();
  const tab = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("tab") || "overview";
  }, [searchString]);

  const project = analytics.project;
  const burnRate = analytics.burnRate;

  if (tab === "overview") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="text-2xl font-bold capitalize">{project.status}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Budget Used</div>
            <div className="text-2xl font-bold">
              {burnRate ? `${Math.round(burnRate.burnRatePercentage)}%` : "N/A"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Hours</div>
            <div className="text-2xl font-bold">
              {burnRate ? `${Math.round(burnRate.actualHours)} / ${Math.round(burnRate.estimatedHours)}` : "N/A"}
            </div>
          </CardContent>
        </Card>
        {project.description && (
          <Card className="md:col-span-3">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-2">Description</div>
              <p>{project.description}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 text-center text-muted-foreground">
        <p>Tab "{tab}" is available in the full Constellation application.</p>
      </CardContent>
    </Card>
  );
}

export default function EmbedProject() {
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
      <EmbedLayoutWrapper>
        <EmbedAuthGate>
          <EmbedProjectContent />
        </EmbedAuthGate>
      </EmbedLayoutWrapper>
    </EmbedProvider>
  );
}

function EmbedLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useEmbed();
  return <EmbedLayout theme={theme}>{children}</EmbedLayout>;
}
