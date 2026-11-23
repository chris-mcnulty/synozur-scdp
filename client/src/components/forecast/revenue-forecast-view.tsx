import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { AlertCircle, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Database, ExternalLink, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { monthAt, type ForecastResult, type ForecastSource, type ForecastTiming } from "@shared/revenue-forecast";

const FORECAST_PREFIX = "/api/analytics/revenue-forecast";
const monthNow = () => new Date().toISOString().slice(0, 7);
const formatMonth = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";
const money = (amount: number | null, currency: string | null) => amount == null ? "—" : currency
  ? new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  : `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (currency unknown)`;
const sourceKind = (kind: ForecastSource["kind"]) => ({ sow: "SOW", estimate: "Estimate", project: "Project", deal: "CRM deal" })[kind];

interface EditorState {
  start: string;
  end: string;
  serviceAmount: string;
  note: string;
}

function initialEditor(source: ForecastSource): EditorState {
  return {
    start: source.assumption?.deliveryStart ?? source.deliveryStart ?? "",
    end: source.assumption?.deliveryEnd ?? source.deliveryEnd ?? "",
    serviceAmount: source.assumption?.serviceAmount == null ? "" : String(source.assumption.serviceAmount),
    note: source.assumption?.note ?? "",
  };
}

export function RevenueForecastView() {
  const { user } = useAuth();
  const identity = user as (typeof user & { tenantId?: string; tenant?: { id?: string } }) | undefined;
  const queryClient = useQueryClient();
  const [start, setStart] = useState(monthNow);
  const [end, setEnd] = useState(() => monthAt(monthNow(), 11));
  const [clientId, setClientId] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editors, setEditors] = useState<Record<string, EditorState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const params = new URLSearchParams({ start, end });
  if (clientId !== "all") params.set("clientId", clientId);
  const url = `${FORECAST_PREFIX}?${params.toString()}`;
  const validWindow = /^\d{4}-(0[1-9]|1[0-2])$/.test(start) && /^\d{4}-(0[1-9]|1[0-2])$/.test(end) && end >= start;
  const query = useQuery<ForecastResult>({
    queryKey: [url, identity?.tenantId ?? identity?.primaryTenantId ?? identity?.tenant?.id ?? null, identity?.id ?? null],
    queryFn: () => apiRequest(url),
    enabled: validWindow,
  });
  const mutation = useMutation({
    mutationFn: async ({ source, values }: { source: ForecastSource; values: EditorState }) => {
      const amount = values.serviceAmount.trim() === "" ? null : Number(values.serviceAmount);
      if (!values.start || !values.end || values.end < values.start) throw new Error("Enter a valid inclusive delivery period.");
      if (!values.note.trim()) throw new Error("Add an assumption note for the audit trail.");
      if (values.serviceAmount.trim() !== "" && (!Number.isFinite(amount) || amount! < 0)) throw new Error("Enter a valid service-only amount.");
      if (source.kind === "deal" && amount == null) throw new Error("Confirm a service-only amount before including this CRM deal.");
      const sourceCeiling = source.sourceAmount ?? source.amount;
      if (amount != null && sourceCeiling != null && amount > sourceCeiling) throw new Error("Service amount cannot exceed the source amount.");
      const body: ForecastTiming = { deliveryStart: values.start, deliveryEnd: values.end, serviceAmount: amount, note: values.note.trim() };
      return apiRequest(`${FORECAST_PREFIX}/assumptions/${encodeURIComponent(source.kind)}/${encodeURIComponent(source.id)}`, { method: "PUT", body: JSON.stringify(body) });
    },
    onSuccess: async (_data, variables) => {
      setErrors(prev => ({ ...prev, [variables.source.key]: "" }));
      await queryClient.invalidateQueries({ queryKey: [FORECAST_PREFIX] });
      await queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith(`${FORECAST_PREFIX}?`) });
    },
    onError: (error, variables) => setErrors(prev => ({ ...prev, [variables.source.key]: error instanceof Error ? error.message : "Could not save the assumption." })),
  });
  const resetMutation = useMutation({
    mutationFn: (source: ForecastSource) => apiRequest(`${FORECAST_PREFIX}/assumptions/${encodeURIComponent(source.kind)}/${encodeURIComponent(source.id)}`, { method: "DELETE" }),
    onSuccess: async (_data, source) => {
      setEditors(prev => { const next = { ...prev }; delete next[source.key]; return next; });
      setErrors(prev => ({ ...prev, [source.key]: "" }));
      await queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith(`${FORECAST_PREFIX}?`) });
    },
    onError: (error, source) => setErrors(prev => ({ ...prev, [source.key]: error instanceof Error ? error.message : "Could not reset the assumption." })),
  });
  const result = query.data;
  const sources = useMemo(() => result?.sources ?? [], [result]);
  const eligible = sources.filter(source => !source.excludedReason);
  const excluded = sources.filter(source => source.excludedReason);

  const editorFor = (source: ForecastSource) => editors[source.key] ?? initialEditor(source);
  const changeEditor = (source: ForecastSource, key: keyof EditorState, value: string) => {
    setEditors(prev => ({ ...prev, [source.key]: { ...editorFor(source), [key]: value } }));
    setErrors(prev => ({ ...prev, [source.key]: "" }));
  };
  const saveAssumption = (source: ForecastSource) => {
    const values = editorFor(source);
    if (source.kind === "deal" && values.serviceAmount.trim() === "") {
      setErrors(prev => ({ ...prev, [source.key]: "CRM amount can include pass-through expenses. Confirm the service-only amount to forecast this deal." }));
      return;
    }
    mutation.mutate({ source, values });
  };

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-6 text-foreground sm:px-6 lg:px-9">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><span className="h-px w-7 bg-primary" />Finance / Planning</div>
            <h1 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">Revenue forecast</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">An auditable forward view of consulting commitments and opportunity-weighted pipeline.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 text-right text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{!result ? (query.isFetching ? "Loading sources" : "Sources unavailable") : result.crm.status === "connected" ? "CRM connected" : result.crm.status === "error" ? "CRM needs attention" : "CRM disconnected"}</div>
              <div>{result?.crm.fetchedAt ? `Sources fetched ${formatDate(result.crm.fetchedAt)}` : "Sources not fetched"}</div>
            </div>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching || !validWindow} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />{query.isFetching ? "Refreshing" : "Refresh sources"}
            </Button>
          </div>
        </header>

        <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_minmax(210px,1.2fr)_auto] md:items-end">
          <div className="space-y-2"><Label htmlFor="forecast-start">Forecast from</Label><Input id="forecast-start" type="month" value={start} onChange={event => setStart(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="forecast-end">Through</Label><Input id="forecast-end" type="month" value={end} min={start} onChange={event => setEnd(event.target.value)} /></div>
          <div className="space-y-2"><Label>Client</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="All clients" /></SelectTrigger><SelectContent><SelectItem value="all">All clients</SelectItem>{result?.clients.map(client => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="pb-2 text-xs text-muted-foreground"><SlidersHorizontal className="mr-1 inline h-3.5 w-3.5" />{result ? `${eligible.length} included · ${excluded.length} excluded` : "Choose a window"}</div>
        </section>

        {!validWindow && <p role="alert" className="text-sm text-destructive">Choose valid start and end months, with the end on or after the start.</p>}
        {result?.crm.status !== "connected" && result && (
          <div role="status" className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${result.crm.status === "error" ? "border-destructive/30 bg-destructive/5" : "border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/20"}`}>
            <Database className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">{result.crm.status === "error" ? "CRM source unavailable" : "CRM is not connected"}</div><div className="mt-0.5 text-muted-foreground">{result.crm.message || "CRM opportunities are not included until the connection is available."}</div></div>
          </div>
        )}

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold">Monthly planning view</h2><p className="text-xs text-muted-foreground">Delivery allocation and booking value are shown separately.</p></div>
            {result && <span className="text-xs text-muted-foreground">Last source refresh {formatDate(result.refreshedAt)}</span>}
          </div>
          {query.isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> :
            query.isError ? <div role="alert" className="m-5 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4"><AlertCircle className="mt-0.5 h-4 w-4 text-destructive" /><div className="flex-1"><div className="font-medium">Forecast could not be loaded</div><p className="mt-1 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : "Check your connection and try again."}</p></div><Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button></div> :
            !result || result.months.length === 0 || result.months.every(row => row.committed === 0 && row.weightedPipeline === 0 && row.committedBookings === 0 && row.weightedBookings === 0) ?
              <div className="px-6 py-12 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><CircleHelp className="h-5 w-5" /></div><h3 className="font-medium">No forecast value in this window</h3><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Try another date range or client, or review the source list below for missing timing and excluded items.</p></div> :
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/40"><TableHead className="sticky left-0 min-w-[150px] bg-muted/90">Month / currency</TableHead><TableHead className="text-right">Committed delivery</TableHead><TableHead className="text-right">Weighted pipeline delivery</TableHead><TableHead className="text-right font-semibold">Total delivery</TableHead><TableHead className="text-right">Committed bookings</TableHead><TableHead className="text-right">Weighted bookings</TableHead></TableRow></TableHeader>
                  <TableBody>{result.months.map(row => <TableRow key={`${row.currency}-${row.month}`} className="tabular-nums">
                    <TableCell className="sticky left-0 bg-card font-medium">{formatMonth(row.month)} <span className="ml-1 text-xs text-muted-foreground">{row.currency}</span></TableCell>
                    <TableCell className="text-right">{money(row.committed, row.currency)}</TableCell><TableCell className="text-right">{money(row.weightedPipeline, row.currency)}</TableCell><TableCell className="text-right font-semibold">{money(row.total, row.currency)}</TableCell><TableCell className="text-right text-muted-foreground">{money(row.committedBookings, row.currency)}</TableCell><TableCell className="text-right text-muted-foreground">{money(row.weightedBookings, row.currency)}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
                <div className="border-t border-border bg-muted/20 px-4 py-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Window totals · no currency conversion</div>
                  <div className="flex flex-wrap gap-x-8 gap-y-2">{result.totals.map(total => <div key={total.currency} className="flex flex-wrap items-center gap-x-3 text-xs"><Badge variant="outline">{total.currency}</Badge><span>Delivery <strong>{money(total.total, total.currency)}</strong></span><span className="text-muted-foreground">Committed {money(total.committed, total.currency)}</span><span className="text-muted-foreground">Pipeline {money(total.weightedPipeline, total.currency)}</span><span className="text-muted-foreground">Committed bookings {money(total.committedBookings, total.currency)}</span><span className="text-muted-foreground">Weighted bookings {money(total.weightedBookings, total.currency)}</span></div>)}</div>
                </div>
              </div>
          }
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold">Forecast sources</h2><p className="text-sm text-muted-foreground">Expand any source to inspect the basis or save a documented timing assumption.</p></div><Badge variant="secondary">{sources.length} records</Badge></div>
            {query.isLoading ? <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div> :
              !query.isError && sources.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><Database className="mx-auto mb-3 h-5 w-5 text-muted-foreground" /><div className="font-medium">No source records found</div><p className="mt-1 text-sm text-muted-foreground">There are no eligible commitments or opportunities for this filter.</p></div> :
              sources.map(source => {
                const isOpen = expanded === source.key;
                const editor = editorFor(source);
                const isExcluded = Boolean(source.excludedReason);
                const dealNeedsServiceAmount = source.kind === "deal" && source.assumption?.serviceAmount == null;
                return <article key={source.key} data-source-key={source.key} className={`overflow-hidden rounded-lg border ${isExcluded ? "border-border/70 bg-muted/20" : "border-border bg-card"}`}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : source.key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{source.name}</span><Badge variant={source.bucket === "committed" ? "default" : "secondary"}>{source.bucket === "committed" ? "Committed" : "Pipeline"}</Badge><Badge variant="outline">{sourceKind(source.kind)}</Badge>{isExcluded && <Badge variant="destructive">Excluded</Badge>}</div><div className="mt-1 truncate text-xs text-muted-foreground">{source.clientName || "Unassigned client"} · {source.timingBasis || "Timing basis unavailable"}</div></div>
                    <div className="hidden text-right sm:block"><div className="font-medium tabular-nums">{money(source.amount ?? source.sourceAmount ?? null, source.currency)}</div><div className="text-xs text-muted-foreground">{source.currency || "Currency missing"}</div></div>
                  </button>
                  {isOpen && <div className="border-t border-border px-4 py-4">
                    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                      <Detail label="Raw source amount" value={money(source.sourceAmount ?? source.amount, source.currency)} />
                      <Detail label="Effective service amount" value={money(source.amount, source.currency)} />
                      <Detail label="Probability" value={source.probability == null ? "Unknown" : `${(source.probability * 100).toFixed(1)}%`} />
                      <Detail label="Booking month" value={source.bookingMonth ? formatMonth(source.bookingMonth) : "Not set"} />
                      <Detail label="Delivery period" value={source.deliveryStart && source.deliveryEnd ? `${formatMonth(source.deliveryStart)} – ${formatMonth(source.deliveryEnd)}` : "Timing needed"} />
                      <Detail label="Timing basis" value={source.timingBasis || "Not available"} />
                      <Detail label="Assumption audit" value={source.assumption ? `${source.assumption.updatedBy} · ${formatDate(source.assumption.updatedAt)}` : "No saved assumption"} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={source.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">Open source <ExternalLink className="h-3.5 w-3.5" /></a>
                      {source.excludedReason && <div className="w-full rounded bg-destructive/5 px-3 py-2 text-sm text-destructive">Excluded: {source.excludedReason}</div>}
                      {source.warnings.map((warning, index) => <div key={index} className="w-full rounded bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="mr-2 inline h-3.5 w-3.5" />{warning}</div>)}
                    </div>
                    <div className="mt-5 rounded-md border bg-muted/20 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Forecast assumption</h3><p className="mt-0.5 text-xs text-muted-foreground">Changes planning only; the commercial source remains untouched.</p></div>{source.assumption && <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Saved</span>}</div>
                      {dealNeedsServiceAmount && <p className="mb-3 rounded border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">CRM source amounts may include pass-through expenses. Confirm the service-only amount below; the raw deal amount remains visible until then.</p>}
                      {source.kind === "deal" && <div className="mb-3 text-xs text-muted-foreground">Raw CRM amount: <strong className="text-foreground">{money(source.sourceAmount ?? source.amount, source.currency)}</strong></div>}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label className="text-xs">Delivery starts</Label><Input type="month" value={editor.start} onChange={event => changeEditor(source, "start", event.target.value)} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Delivery ends</Label><Input type="month" min={editor.start} value={editor.end} onChange={event => changeEditor(source, "end", event.target.value)} /></div>
                        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">{source.kind === "deal" ? "Confirmed service-only amount" : "Service-only amount (optional)"}</Label><Input type="number" min="0" step="0.01" placeholder={source.kind === "deal" ? "Required to confirm CRM amount" : "Use source amount"} value={editor.serviceAmount} onChange={event => changeEditor(source, "serviceAmount", event.target.value)} /><p className="text-[11px] text-muted-foreground">Must not exceed the source value. Leave blank to retain source amount where permitted.</p></div>
                        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Audit note <span className="text-destructive">*</span></Label><textarea value={editor.note} onChange={event => changeEditor(source, "note", event.target.value)} placeholder="Why is this timing or service value appropriate?" maxLength={1000} className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
                      </div>
                      {errors[source.key] && <p role="alert" className="mt-2 text-xs text-destructive">{errors[source.key]}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => saveAssumption(source)} disabled={mutation.isPending || resetMutation.isPending}><Save className="mr-1.5 h-3.5 w-3.5" />{mutation.isPending && mutation.variables?.source.key === source.key ? "Saving…" : "Save assumption"}</Button>{source.assumption && <Button variant="outline" size="sm" onClick={() => resetMutation.mutate(source)} disabled={resetMutation.isPending}>Reset to source</Button>}{mutation.isSuccess && mutation.variables?.source.key === source.key && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" />Saved and refreshed</span>}</div>
                    </div>
                  </div>}
                </article>;
              })
            }
          </div>
          <aside className="h-fit rounded-lg border border-border bg-card p-4 lg:sticky lg:top-6">
            <div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="font-semibold">How to read this</h2></div>
            <ul className="space-y-3 text-xs leading-5 text-muted-foreground">
              <li><strong className="text-foreground">Delivery view:</strong> contract value is spread evenly across inclusive service months. It is the whole contract, not a remaining balance; historical portions are not moved forward.</li>
              <li><strong className="text-foreground">Booking view:</strong> booking month records commitment or probability-weighted opportunity value. Payment milestones are billing dates, not delivery dates.</li>
              <li><strong className="text-foreground">Not accounting:</strong> this is not revenue recognition or a cash forecast. There is no FX conversion; currencies stay separate.</li>
              <li><strong className="text-foreground">Source precedence:</strong> an approved SOW supersedes estimates linked to it. Lost and duplicate deals are excluded.</li>
              <li><strong className="text-foreground">Assumptions:</strong> saved dates and service-only values affect this forecast only. Notes, editor, and save time stay attached for audit.</li>
            </ul>
            {result && <div className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">{result.crm.status === "connected" ? "CRM source refresh is available." : "CRM pipeline may be incomplete."}</div>}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm">{value}</div></div>;
}
