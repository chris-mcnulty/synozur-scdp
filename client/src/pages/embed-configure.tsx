import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmbedLayout } from "@/components/layout/embed-layout";
import { EmbedProvider, useEmbed } from "@/hooks/use-embed";
import { useSearch } from "wouter";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EntityMode = "project" | "estimate";

function ConfigureContent() {
  const { isAuthenticating, authError, retryAuth } = useEmbed();
  const [mode, setMode] = useState<EntityMode>("project");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    enabled: !isAuthenticating && !authError && mode === "project",
  });

  const { data: estimates, isLoading: estimatesLoading } = useQuery<any[]>({
    queryKey: ["/api/estimates"],
    enabled: !isAuthenticating && !authError && mode === "estimate",
  });

  // Reset selection when mode changes
  useEffect(() => {
    setSelectedId(null);
  }, [mode]);

  useEffect(() => {
    const initTeamsConfig = async () => {
      try {
        const { pages } = await import("@microsoft/teams-js");
        pages.config.registerOnSaveHandler((saveEvent) => {
          if (!selectedId) {
            saveEvent.notifyFailure(`Please select a ${mode}`);
            return;
          }
          const baseUrl = window.location.origin;
          const embedPath = mode === "estimate" ? "estimates" : "projects";
          const webPath = mode === "estimate" ? "estimates" : "projects";
          pages.config.setConfig({
            suggestedDisplayName: mode === "estimate" ? "Constellation Estimate" : "Constellation Project",
            entityId: `constellation-${mode}-${selectedId}`,
            contentUrl: `${baseUrl}/embed/${embedPath}/${selectedId}?embed=true`,
            websiteUrl: `${baseUrl}/${webPath}/${selectedId}`,
          });
          saveEvent.notifySuccess();
          setSaved(true);
        });
      } catch (e) {
      }
    };
    initTeamsConfig();
  }, [selectedId, mode]);

  useEffect(() => {
    const updateValidity = async () => {
      try {
        const { pages } = await import("@microsoft/teams-js");
        pages.config.setValidityState(!!selectedId);
      } catch (e) {
      }
    };
    updateValidity();
  }, [selectedId]);

  const isLoading = mode === "project" ? projectsLoading : estimatesLoading;

  if (isAuthenticating || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Unable to authenticate with Teams SSO. Please ensure your Constellation account is linked to your Microsoft account, then try again.
            </p>
            <p className="text-xs text-muted-foreground">{authError}</p>
            <Button onClick={retryAuth} variant="outline" size="sm" className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <Check className="w-12 h-12 text-green-500" />
          <h2 className="text-xl font-semibold">Tab Configured</h2>
        </div>
      </div>
    );
  }

  const items = mode === "project" ? projects : estimates;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Configure Constellation Tab</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-sm mb-4">
            <button
              className={`flex-1 px-3 py-1.5 ${mode === "project" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"}`}
              onClick={() => setMode("project")}
            >
              Project
            </button>
            <button
              className={`flex-1 px-3 py-1.5 border-l ${mode === "estimate" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"}`}
              onClick={() => setMode("estimate")}
            >
              Estimate
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Choose which Constellation {mode} to display in this tab.
          </p>
          {items && items.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {items.map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id.toString())}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedId === item.id.toString()
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{item.name}</div>
                  {item.clientName && (
                    <div className="text-sm text-muted-foreground">{item.clientName}</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No {mode}s available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmbedConfigure() {
  const searchString = useSearch();
  const theme = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("theme") || undefined;
  }, [searchString]);

  return (
    <EmbedProvider theme={theme} readonly={false}>
      <EmbedLayoutInner>
        <ConfigureContent />
      </EmbedLayoutInner>
    </EmbedProvider>
  );
}

function EmbedLayoutInner({ children }: { children: React.ReactNode }) {
  const { theme } = useEmbed();
  return <EmbedLayout theme={theme}>{children}</EmbedLayout>;
}
