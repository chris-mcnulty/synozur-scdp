import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmbedLayout } from "@/components/layout/embed-layout";
import { EmbedProvider, useEmbed } from "@/hooks/use-embed";
import { useSearch } from "wouter";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ConfigureContent() {
  const { isAuthenticating, authError, retryAuth } = useEmbed();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: projects, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    enabled: !isAuthenticating && !authError,
  });

  useEffect(() => {
    const initTeamsConfig = async () => {
      try {
        const { pages } = await import("@microsoft/teams-js");
        pages.config.registerOnSaveHandler((saveEvent) => {
          if (!selectedProjectId) {
            saveEvent.notifyFailure("Please select a project");
            return;
          }
          const baseUrl = window.location.origin;
          pages.config.setConfig({
            suggestedDisplayName: "Constellation Project",
            entityId: selectedProjectId,
            contentUrl: `${baseUrl}/embed/projects/${selectedProjectId}?embed=true`,
            websiteUrl: `${baseUrl}/projects/${selectedProjectId}`,
          });
          saveEvent.notifySuccess();
          setSaved(true);
        });
      } catch (e) {
      }
    };
    initTeamsConfig();
  }, [selectedProjectId]);

  useEffect(() => {
    const updateValidity = async () => {
      try {
        const { pages } = await import("@microsoft/teams-js");
        pages.config.setValidityState(!!selectedProjectId);
      } catch (e) {
      }
    };
    updateValidity();
  }, [selectedProjectId]);

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

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Select a Project</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which Constellation project to display in this tab.
          </p>
          {projects && projects.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {projects.map((project: any) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id.toString())}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedProjectId === project.id.toString()
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{project.name}</div>
                  {project.clientName && (
                    <div className="text-sm text-muted-foreground">{project.clientName}</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No projects available.</p>
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
