import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BookOpenCheck, ChevronDown, CircleHelp, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import type { EstimateComparable, EstimateIntelligenceReview, IntelligenceMetric } from "@shared/estimate-intelligence";

type EstimateIntelligencePanelProps = {
  estimateId: string;
};

function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function metricValue(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function costValue(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "Not available";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function MetricTable({ metric, label, costCurrency }: {
  metric: IntelligenceMetric;
  label: string;
  costCurrency?: string;
}) {
  const format = costCurrency
    ? (value: number | null) => costValue(value, costCurrency)
    : (value: number | null) => metricValue(value, " hrs");

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <h5 className="text-sm font-semibold">{label}</h5>
        {costCurrency && <span className="text-xs text-muted-foreground">Currency: {costCurrency}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Estimated</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{format(metric.estimated)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Actual</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{format(metric.actual)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Delta</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{format(metric.delta)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Variance</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{metricValue(metric.variancePercent, "%")}</dd>
        </div>
      </dl>
    </div>
  );
}

function SourceLink({ href, children }: { href?: string; children: string }) {
  const safe = safeHref(href);
  if (!safe) return <span className="text-sm text-muted-foreground">{children} unavailable</span>;
  return (
    <a
      href={safe}
      target={safe.startsWith("/") ? undefined : "_blank"}
      rel={safe.startsWith("/") ? undefined : "noreferrer"}
      className="inline-flex min-h-8 items-center gap-1 rounded px-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}

function ComparableResult({ comparable, showCost }: { comparable: EstimateComparable; showCost: boolean }) {
  return (
    <article className="rounded-xl border border-border/80 bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Comparable project</p>
          <h4 className="mt-1 break-words text-base font-semibold">{comparable.projectName}</h4>
          <p className="mt-1 text-sm text-muted-foreground">Baseline: <span className="text-foreground">{comparable.baseline}</span></p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
          <Activity aria-hidden="true" className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Match score</span>
          <strong className="tabular-nums">{metricValue(comparable.score)}</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-border/60 py-2">
        <SourceLink href={comparable.projectUrl}>Open source project</SourceLink>
        <SourceLink href={comparable.estimateUrl}>Open source estimate</SourceLink>
      </div>

      <div className="mt-4 space-y-3">
        <MetricTable metric={comparable.effort} label="Effort" />
        {showCost && comparable.cost && <MetricTable metric={comparable.cost} label="Time-linked service cost" costCurrency={comparable.cost.currency} />}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it matches</h5>
          {comparable.matchingReasons.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {comparable.matchingReasons.map((reason, index) => (
                <li key={`${index}-${reason}`} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span className="break-words">{reason}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">No matching reasons supplied.</p>}
        </div>
        {comparable.limitations.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence limitations</h5>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {comparable.limitations.map((limitation, index) => (
                <li key={`${index}-${limitation}`} className="break-words">{limitation}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

export function EstimateIntelligencePanel({ estimateId }: EstimateIntelligencePanelProps) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<EstimateIntelligenceReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestSequence.current += 1;
      activeRequest.current?.abort();
    };
  }, [estimateId]);

  const requestReview = async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setReview(null);
    try {
      const result = await apiRequest(`/api/estimates/${encodeURIComponent(estimateId)}/intelligence`, {
        method: "POST",
        body: "{}",
        signal: controller.signal,
      }) as EstimateIntelligenceReview;
      if (sequence === requestSequence.current) setReview(result);
    } catch (requestError) {
      if (sequence === requestSequence.current && !controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "The review could not be loaded.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  const projectById = new Map((review?.comparables ?? []).map((item) => [item.projectId, item]));

  return (
    <Card className="mb-4 overflow-hidden border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpenCheck aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-lg">Historical estimate intelligence</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Review comparable delivery evidence from completed work. Advisory only — this never changes estimate pricing.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              aria-expanded={open}
              aria-controls="estimate-intelligence-panel"
              onClick={() => setOpen((current) => !current)}
            >
              {open ? "Close review" : "Open intelligence review"}
              <ChevronDown aria-hidden="true" className={`ml-2 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
            {open && (
              <Button type="button" onClick={requestReview} disabled={loading}>
                {loading ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : review || error ? <RotateCw aria-hidden="true" className="mr-2 h-4 w-4" /> : <Activity aria-hidden="true" className="mr-2 h-4 w-4" />}
                {loading ? "Reviewing…" : review || error ? "Refresh evidence" : "Review historical evidence"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent
        id="estimate-intelligence-panel"
        role="region"
        aria-label="Historical estimate intelligence review"
        hidden={!open}
        className="space-y-5 border-t bg-muted/15 pt-5"
      >
          {!review && !loading && !error && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-background/70 p-5 sm:flex-row sm:items-center">
              <CircleHelp aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Request a one-time review to see the historical projects that provide the closest available evidence.</p>
            </div>
          )}

          {loading && (
            <div role="status" aria-live="polite" className="space-y-3 rounded-xl border bg-background p-5">
              <div className="h-4 w-44 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full max-w-2xl animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
              <span className="sr-only">Reviewing historical evidence…</span>
            </div>
          )}

          {error && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-semibold">Evidence review failed</p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={requestReview} disabled={loading} className="shrink-0">
                <RotateCw aria-hidden="true" className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          )}

          {review && (
            <>
              <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{review.status === "evidence_available" ? "Historical evidence available" : "Not enough comparable evidence"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {metricValue(review.sampleSize)} usable effort comparisons · {metricValue(review.comparableCount)} comparable{review.comparableCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                  No automatic repricing
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-xl border bg-background p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Method</h3>
                  <p className="mt-2 break-words text-sm">{review.method || "Not available"}</p>
                </section>
                <section className="rounded-xl border bg-background p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Advisory</h3>
                  <p className="mt-2 break-words text-sm">{review.advisory || "Not available"}</p>
                </section>
              </div>

              {review.status === "insufficient_evidence" && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                  <p className="font-medium">There is not enough historical evidence for a reliable comparison.</p>
                  <p className="mt-1 text-sm text-muted-foreground">No baseline or repricing recommendation is inferred from the available records.</p>
                </div>
              )}

              {review.comparables.length > 0 && (
                <section aria-labelledby="intelligence-comparables-title" className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id="intelligence-comparables-title" className="font-semibold">Comparable delivery records</h3>
                    <span className="text-xs text-muted-foreground">{review.comparables.length} shown</span>
                  </div>
                  {review.comparables.map((comparable, index) => (
                    <ComparableResult
                      key={`${comparable.projectId}-${comparable.estimateId ?? index}`}
                      comparable={comparable}
                      showCost={review.costVisible && !!comparable.cost}
                    />
                  ))}
                </section>
              )}

              {review.risks.length > 0 && (
                <section aria-labelledby="intelligence-risks-title" className="space-y-3">
                  <h3 id="intelligence-risks-title" className="flex items-center gap-2 font-semibold">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600" /> Evidence signals
                  </h3>
                  <div className="space-y-2">
                    {review.risks.map((risk, index) => (
                      <article key={`${risk.kind}-${index}`} className="rounded-lg border bg-background p-4">
                        <h4 className="font-medium">{risk.title}</h4>
                        <p className="mt-1 break-words text-sm text-muted-foreground">{risk.detail}</p>
                        {risk.projectIds.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                            {risk.projectIds.map((projectId) => {
                              const source = projectById.get(projectId);
                              return source
                                ? <SourceLink key={projectId} href={source.projectUrl}>{source.projectName}</SourceLink>
                                : <span key={projectId} className="text-sm text-muted-foreground">Source project unavailable</span>;
                            })}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {review.limitations.length > 0 && (
                <section className="rounded-xl border bg-background p-4">
                  <h3 className="font-semibold">Review limitations</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {review.limitations.map((limitation, index) => (
                      <li key={`${index}-${limitation}`} className="break-words">{limitation}</li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <CircleHelp aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Use this review as supporting context alongside professional judgment. It is deterministic historical analysis, not an estimate edit.
              </p>
            </>
          )}
      </CardContent>
    </Card>
  );
}

