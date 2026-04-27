import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAIStatus, useRewriteTimeEntryDescription, type TimeEntryRewriteParams } from "@/lib/ai";
import { cn } from "@/lib/utils";

type RewriteContext = Omit<TimeEntryRewriteParams, "description">;

interface TimeEntryDescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  testIdPrefix?: string;
  getRewriteContext?: () => RewriteContext;
  className?: string;
  textareaClassName?: string;
}

export function TimeEntryDescriptionField({
  value,
  onChange,
  placeholder = "Brief description of work performed...",
  disabled,
  testIdPrefix = "description",
  getRewriteContext,
  className,
  textareaClassName,
}: TimeEntryDescriptionFieldProps) {
  const { toast } = useToast();
  const { data: aiStatus } = useAIStatus();
  const rewriteMutation = useRewriteTimeEntryDescription();
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [justRewrote, setJustRewrote] = useState(false);

  const aiAvailable = aiStatus?.configured ?? false;
  const isRewriting = rewriteMutation.isPending;
  const trimmedValue = (value || "").trim();
  const canRewrite = aiAvailable && !disabled && !isRewriting && trimmedValue.length > 0;

  const handleRewrite = async () => {
    if (!canRewrite) return;
    const context = getRewriteContext ? getRewriteContext() : {};
    try {
      const result = await rewriteMutation.mutateAsync({
        description: trimmedValue,
        ...context,
      });
      const next = (result.rewritten || "").trim();
      if (!next) {
        toast({
          title: "Nothing to rewrite",
          description: "The AI did not return a rewritten description.",
          variant: "destructive",
        });
        return;
      }
      setPreviousValue(value);
      onChange(next);
      setJustRewrote(true);
    } catch (error: any) {
      toast({
        title: "Rewrite failed",
        description: error?.message || "Unable to rewrite description. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUndo = () => {
    if (previousValue === null) return;
    onChange(previousValue);
    setPreviousValue(null);
    setJustRewrote(false);
  };

  const handleAccept = () => {
    setJustRewrote(false);
    setPreviousValue(null);
  };

  const handleManualChange = (next: string) => {
    onChange(next);
    if (justRewrote) {
      setJustRewrote(false);
      setPreviousValue(null);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Textarea
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => handleManualChange(e.target.value)}
        disabled={disabled}
        data-testid={`textarea-${testIdPrefix}`}
        className={textareaClassName}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {justRewrote ? (
            <span data-testid={`${testIdPrefix}-rewrite-status`}>
              Rewritten with AI. Edit further or accept.
            </span>
          ) : !aiAvailable ? (
            <span className="text-muted-foreground/70">AI rewrite unavailable</span>
          ) : (
            <span className="text-muted-foreground/70">Tip: write quick notes, then rewrite with AI.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {justRewrote && previousValue !== null && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                data-testid={`button-${testIdPrefix}-undo`}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                Undo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAccept}
                data-testid={`button-${testIdPrefix}-accept`}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Keep
              </Button>
            </>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRewrite}
                    disabled={!canRewrite}
                    data-testid={`button-${testIdPrefix}-rewrite`}
                  >
                    {isRewriting ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                    )}
                    {isRewriting ? "Rewriting..." : "Rewrite with AI"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!aiAvailable
                  ? "AI is not configured for this environment"
                  : trimmedValue.length === 0
                    ? "Add some text to rewrite"
                    : "Polish this description for client-facing use"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
