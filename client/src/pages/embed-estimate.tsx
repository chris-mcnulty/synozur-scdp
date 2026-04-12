import { useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { EmbedProvider, useEmbed } from "@/hooks/use-embed";
import { Loader2, LogIn, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EstimateDetail from "@/pages/estimate-detail";
import { EmbedNavDrawer } from "@/components/layout/embed-nav-drawer";

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
                Please sign in to Constellation to view this estimate.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default function EmbedEstimate() {
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
      <EmbedNavDrawer />
      <EmbedAuthGate>
        <EstimateDetail />
      </EmbedAuthGate>
    </EmbedProvider>
  );
}
