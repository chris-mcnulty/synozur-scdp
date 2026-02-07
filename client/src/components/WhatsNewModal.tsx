import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Sparkles, X, ExternalLink, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Highlight {
  icon: string;
  title: string;
  description: string;
}

interface WhatsNewData {
  showModal: boolean;
  version?: string;
  summary?: string;
  highlights?: Highlight[];
}

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, setLocation] = useLocation();

  const { data } = useQuery<WhatsNewData>({
    queryKey: ["/api/changelog/whats-new"],
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.showModal && !dismissed) {
      setOpen(true);
    }
  }, [data?.showModal, dismissed]);

  const dismissMutation = useMutation({
    mutationFn: async (version: string) => {
      await apiRequest("/api/changelog/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/changelog/whats-new"] });
    },
  });

  const handleDismiss = () => {
    if (dismissed || dismissMutation.isPending) return;
    setDismissed(true);
    if (data?.version) {
      dismissMutation.mutate(data.version);
    }
    setOpen(false);
  };

  const handleViewChangelog = () => {
    if (!dismissed && !dismissMutation.isPending && data?.version) {
      setDismissed(true);
      dismissMutation.mutate(data.version);
    }
    setOpen(false);
    setLocation("/changelog");
  };

  if (!data?.showModal) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleDismiss();
    }}>
      <DialogContent
        className="sm:max-w-[500px] max-h-[85vh] p-0 gap-0 max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-w-full max-sm:max-h-[80vh]"
        data-testid="whats-new-modal"
      >
        <div className="relative overflow-hidden rounded-t-lg bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 pb-4">
          <div className="absolute top-3 right-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-8 w-8 rounded-full"
              data-testid="whats-new-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                What's New
              </DialogTitle>
            </div>
            {data.version && (
              <p className="text-sm text-muted-foreground ml-10">
                Version {data.version}
              </p>
            )}
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[50vh] px-6 py-4">
          {data.summary && (
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {data.summary}
            </p>
          )}

          {data.highlights && data.highlights.length > 0 && (
            <div className="space-y-3">
              {data.highlights.map((highlight, index) => (
                <div
                  key={index}
                  className="flex gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors"
                >
                  <span className="text-xl flex-shrink-0 mt-0.5" role="img" aria-label={highlight.title}>
                    {highlight.icon}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium leading-tight">
                      {highlight.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {highlight.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(!data.highlights || data.highlights.length === 0) && !data.summary && (
            <p className="text-sm text-muted-foreground text-center py-4">
              New updates are available! Check the changelog for details.
            </p>
          )}
        </ScrollArea>

        <div className="flex flex-col sm:flex-row gap-2 p-4 pt-2 border-t">
          <Button
            variant="outline"
            onClick={handleViewChangelog}
            className="flex-1 min-h-[44px] gap-2"
            data-testid="whats-new-view-changelog"
          >
            <ExternalLink className="h-4 w-4" />
            View Full Changelog
          </Button>
          <Button
            onClick={handleDismiss}
            className="flex-1 min-h-[44px] gap-2"
            data-testid="whats-new-got-it"
          >
            Got It
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
