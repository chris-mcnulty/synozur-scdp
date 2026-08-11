import { useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest, queryClient, getSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney, fmtDate } from "@/lib/payroll-format";
import { ArrowLeft, Download, DollarSign, RotateCcw, AlertTriangle } from "lucide-react";
import { ManualTransferSheet, type TransferRecipient } from "@/components/payroll/manual-transfer-sheet";
import { TaxDepositSummary } from "@/components/payroll/tax-deposit-summary";

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/payroll/runs", id] });
  const { data: employees } = useQuery<any[]>({ queryKey: ["/api/payroll/employees"] });
  const empMap = new Map((employees || []).map(e => [e.id, e]));

  // Per-employee bonus override amounts (dollar strings, converted to cents on preview)
  const [bonusOverrides, setBonusOverrides] = useState<Record<string, string>>({});

  const preview = useMutation({
    mutationFn: () => {
      const overrides: Record<string, { bonusCents: number }> = {};
      for (const [empId, dollarStr] of Object.entries(bonusOverrides)) {
        const dollars = parseFloat(dollarStr);
        if (isFinite(dollars) && dollars > 0) {
          overrides[empId] = { bonusCents: Math.round(dollars * 100) };
        }
      }
      const body = Object.keys(overrides).length > 0 ? { overrides } : {};
      return apiRequest(`/api/payroll/runs/${id}/preview`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (result: any) => {
      // Immediately populate the cache with the preview result so items
      // appear without waiting for a round-trip refetch. We merge in the
      // existing reimbursements from the current cache since the preview
      // endpoint doesn't return them.
      queryClient.setQueryData(["/api/payroll/runs", id], (prev: any) => ({
        run: result.run,
        items: result.items,
        reimbursements: prev?.reimbursements ?? [],
      }));
      // Also invalidate so the next background refetch picks up any
      // reimbursement-line changes that preview may have written.
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs", id] });
      toast({ title: "Preview computed", description: `${result.items?.length ?? 0} employee(s) computed.` });
    },
    onError: (e: any) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });
  const approve = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/runs/${id}/approve`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs", id] }); toast({ title: "Approved" }); },
    onError: (e: any) => toast({ title: "Approve failed", description: e.message, variant: "destructive" }),
  });
  const finalize = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/runs/${id}/finalize`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs", id] }); toast({ title: "Finalized" }); },
    onError: (e: any) => toast({ title: "Finalize failed", description: e.message, variant: "destructive" }),
  });

  const reopen = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/runs/${id}/reopen`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs", id] }); toast({ title: "Run reopened", description: "Status reset to Approved. You can now update the pay date and re-export the NACHA file." }); },
    onError: (e: any) => toast({ title: "Reopen failed", description: e.message, variant: "destructive" }),
  });

  // NACHA export dialog state
  const [nachaDlg, setNachaDlg] = useState(false);
  // Default effective date = tomorrow (Chase requires T+1 minimum)
  const tomorrowIso = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const [nachaDate, setNachaDate] = useState(tomorrowIso);
  const [nachaLoading, setNachaLoading] = useState(false);

  // QuickBooks GL push: post a finalized run's GL export as a QBO Journal Entry.
  const { data: qboStatus } = useQuery<{ connected: boolean; isEnabled: boolean }>({
    queryKey: ["/api/accounting/quickbooks/status"],
  });
  const qboReady = !!(qboStatus?.connected && qboStatus?.isEnabled);
  const { data: qboMappings } = useQuery<any[]>({
    queryKey: ["/api/accounting/quickbooks/mappings?type=payroll_run"],
    enabled: qboReady,
  });
  const qboJournal = (qboMappings || []).find((m) => m.localObjectId === id && m.status === "active");

  const pushJournal = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/runs/${id}/push-qbo`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/quickbooks/mappings?type=payroll_run"] });
      toast({ title: "Posted to QuickBooks", description: "A journal entry was created in QuickBooks Online." });
    },
    onError: (e: any) => toast({ title: "QuickBooks push failed", description: e.message, variant: "destructive" }),
  });
  const cancelJournal = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/runs/${id}/qbo-cancel`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/quickbooks/mappings?type=payroll_run"] });
      toast({ title: "QuickBooks journal entry removed", description: "You can re-push this run." });
    },
    onError: (e: any) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) return <Layout><div className="p-6">Loading…</div></Layout>;
  const r = data.run;
  const items = data.items as any[];
  const reimbursements = (data.reimbursements ?? []) as Array<{
    id: string; employeeId: string; employeeName: string; expenseId: string;
    amountCents: number; category: string; description: string | null;
  }>;
  const reimbursementTotal = reimbursements.reduce((s, x) => s + x.amountCents, 0);

  const isBonus = r.runType === 'bonus';
  const canEdit = r.status !== 'finalized' && r.status !== 'voided';
  // For bonus runs, the target employees come from the run itself
  const targetEmpIds: string[] = r.targetEmployeeIds ?? [];

  const transferRecipients: TransferRecipient[] = items
    .filter(it => it.netPayCents > 0)
    .map(it => {
      const emp = empMap.get(it.employeeId);
      return {
        id: it.id,
        name: emp ? `${emp.firstName} ${emp.lastName}` : it.employeeId,
        email: emp?.email ?? null,
        amountCents: it.netPayCents,
      };
    });

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <Link href="/payroll/runs"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button></Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Payroll run · {fmtDate(r.payDate)}</h1>
            <p className="text-sm text-muted-foreground">
              Period {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)} · status <span className="font-medium">{r.status}</span>
              {isBonus && <span className="ml-2 px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Bonus / off-cycle</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending} data-testid="button-preview">
                {preview.isPending ? 'Computing…' : 'Preview'}
              </Button>
            )}
            {r.status === 'previewed' && <Button onClick={() => approve.mutate()} disabled={approve.isPending} data-testid="button-approve">Approve</Button>}
            {r.status === 'approved' && <Button onClick={() => finalize.mutate()} disabled={finalize.isPending} data-testid="button-finalize">Finalize</Button>}
            {r.status === 'finalized' && (
              <Button variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={() => { if (confirm('Reopen this run? It will return to Approved status so you can correct the pay date and re-export the NACHA file. YTD accumulators will remain intact.')) reopen.mutate(); }} disabled={reopen.isPending} data-testid="button-reopen">
                <RotateCcw className="h-4 w-4 mr-2" />{reopen.isPending ? 'Reopening…' : 'Reopen Run'}
              </Button>
            )}
            <Button variant="outline" onClick={async () => {
              try {
                const sid = getSessionId();
                const res = await fetch(`/api/payroll/runs/${id}/gl-export?format=csv`, {
                  headers: sid ? { 'x-session-id': sid } : {},
                  credentials: 'include',
                });
                if (!res.ok) {
                  const msg = await res.text();
                  throw new Error(msg || res.statusText);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `payroll-gl-${id}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e: any) {
                toast({ title: 'GL export failed', description: e.message, variant: 'destructive' });
              }
            }} data-testid="button-gl-csv">
              <Download className="h-4 w-4 mr-2" />GL CSV
            </Button>
            {(r.status === 'approved' || r.status === 'finalized') && (
              <Button variant="outline" onClick={() => {
                // Default to tomorrow when opening the dialog
                setNachaDate(tomorrowIso);
                setNachaDlg(true);
              }} data-testid="button-ach-file">
                <Download className="h-4 w-4 mr-2" />NACHA file
              </Button>
            )}
            {qboReady && r.status === 'finalized' && !qboJournal && (
              <Button variant="outline" onClick={() => pushJournal.mutate()} disabled={pushJournal.isPending} data-testid="button-push-qbo">
                {pushJournal.isPending ? 'Posting…' : 'Post GL to QuickBooks'}
              </Button>
            )}
            {qboReady && qboJournal && (
              <Button variant="outline" className="text-orange-600" onClick={() => cancelJournal.mutate()} disabled={cancelJournal.isPending} data-testid="button-cancel-qbo">
                {cancelJournal.isPending ? 'Removing…' : 'Remove QBO Journal'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Gross</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{fmtMoney(r.totalGrossCents)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Employee tax</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{fmtMoney(r.totalEmployeeTaxCents)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Employer tax</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{fmtMoney(r.totalEmployerTaxCents)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Deductions</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{fmtMoney(r.totalDeductionsCents)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Net pay</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{fmtMoney(r.totalNetCents)}</div></CardContent></Card>
        </div>

        {/* Bonus run: per-employee payment amounts */}
        {isBonus && canEdit && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Bonus amounts per person</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the gross bonus dollar amount for each person. Leave blank to use their normal compensation for this period.
                Click <strong>Preview</strong> above once amounts are set — the engine will compute withholding on top of these figures.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {targetEmpIds.map(empId => {
                  const emp = empMap.get(empId);
                  const name = emp ? `${emp.firstName} ${emp.lastName}` : empId;
                  // After first preview, show what was computed alongside the input
                  const computedItem = items.find(it => it.employeeId === empId);
                  return (
                    <div key={empId} className="flex flex-col gap-1 border rounded-lg p-3">
                      <Label className="font-medium">{name}</Label>
                      {emp && <p className="text-xs text-muted-foreground">{emp.jobTitle ?? emp.status}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={bonusOverrides[empId] ?? ''}
                          onChange={e => setBonusOverrides(prev => ({ ...prev, [empId]: e.target.value }))}
                          className="w-36"
                          data-testid={`input-bonus-${empId}`}
                        />
                        {computedItem && (
                          <span className="text-xs text-muted-foreground">→ net {fmtMoney(computedItem.netPayCents)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {targetEmpIds.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-3">No target employees on this run.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Total entered: {fmtMoney(
                  targetEmpIds.reduce((sum, id) => {
                    const v = parseFloat(bonusOverrides[id] ?? '0');
                    return sum + (isFinite(v) ? Math.round(v * 100) : 0);
                  }, 0)
                )} gross · taxes and deductions will be computed on Preview.
              </p>
            </CardContent>
          </Card>
        )}

        {reimbursements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Expense reimbursements bundled into this run</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Constellation-approved reimbursable expenses paid through payroll (accountable plan — not taxable). Total {fmtMoney(reimbursementTotal)} across {reimbursements.length} {reimbursements.length === 1 ? 'expense' : 'expenses'}.
              </p>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr><th className="py-2">Employee</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {reimbursements.map(rb => (
                    <tr key={rb.id} className="border-b last:border-0" data-testid={`row-reimbursement-${rb.id}`}>
                      <td className="py-2">{rb.employeeName}</td>
                      <td><span className="px-2 py-0.5 text-xs rounded bg-accent">{rb.category}</span></td>
                      <td className="text-muted-foreground">{rb.description ?? '—'}</td>
                      <td className="text-right font-medium">{fmtMoney(rb.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Per-employee breakdown</CardTitle></CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {isBonus
                  ? 'Enter bonus amounts above, then click Preview to compute withholding and net pay.'
                  : 'No items yet — click Preview to compute.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr><th className="py-2">Employee</th><th className="text-right">Gross</th><th className="text-right">Pre-tax ded.</th><th className="text-right">Emp tax</th><th className="text-right">Empr tax</th><th className="text-right">Post-tax ded.</th><th className="text-right">Net</th>{r.status === 'finalized' && <th></th>}</tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const emp = empMap.get(it.employeeId);
                    return (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2">{emp ? `${emp.firstName} ${emp.lastName}` : it.employeeId}</td>
                        <td className="text-right">{fmtMoney(it.grossCents)}</td>
                        <td className="text-right">{fmtMoney(it.preTaxDeductionCents)}</td>
                        <td className="text-right">{fmtMoney(it.employeeTaxCents)}</td>
                        <td className="text-right">{fmtMoney(it.employerTaxCents)}</td>
                        <td className="text-right">{fmtMoney(it.postTaxDeductionCents)}</td>
                        <td className="text-right font-medium">{fmtMoney(it.netPayCents)}</td>
                        {r.status === 'finalized' && (
                          <td className="text-right pl-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              title="Download paystub PDF"
                              data-testid={`button-paystub-pdf-${it.employeeId}`}
                              onClick={async () => {
                                try {
                                  const sid = getSessionId();
                                  const res = await fetch(`/api/payroll/runs/${id}/employees/${it.employeeId}/paystub.pdf`, {
                                    headers: sid ? { 'x-session-id': sid } : {},
                                    credentials: 'include',
                                  });
                                  if (!res.ok) throw new Error(await res.text() || res.statusText);
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1] ?? `paystub-${it.employeeId}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                } catch (e: any) {
                                  toast({ title: 'PDF download failed', description: e.message, variant: 'destructive' });
                                }
                              }}
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />PDF
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {transferRecipients.length > 0 && (
          <ManualTransferSheet
            recipients={transferRecipients}
            title="Manual transfer sheet — net pay"
            description="After-tax net amounts to send each employee. Email addresses are Zelle-compatible. Copy individual amounts or export CSV. Check each row as you send."
          />
        )}

        <TaxDepositSummary items={items} payDate={r.payDate ? fmtDate(r.payDate) : undefined} />
      </div>

      {/* ── NACHA export dialog ── */}
      <Dialog open={nachaDlg} onOpenChange={(o) => { if (!o) setNachaDlg(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Download NACHA / ACH File</DialogTitle>
            <DialogDescription>
              Choose the ACH settlement (effective entry) date. Chase requires at least
              1 business day in the future — same-day dates are rejected with error 50100.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-md border p-3 bg-muted/40 space-y-1">
              <div><span className="text-muted-foreground">Payroll period</span> — <span className="font-medium">{r.periodStart} → {r.periodEnd}</span></div>
              <div><span className="text-muted-foreground">Pay date (record)</span> — <span className="font-medium">{r.payDate}</span></div>
              <div><span className="text-muted-foreground">Run status</span> — <span className="font-medium capitalize">{r.status}</span></div>
            </div>
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                The settlement date below is stamped in the NACHA file as the <strong>Effective Entry Date</strong>.
                It does not change the payroll record's pay date. Set it to the date you want Chase to
                settle the ACH credits (weekdays only, T+1 minimum).
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nacha-date">ACH settlement date *</Label>
              <Input
                id="nacha-date"
                type="date"
                value={nachaDate}
                min={tomorrowIso}
                onChange={(e) => setNachaDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNachaDlg(false)}>Cancel</Button>
            <Button
              disabled={!nachaDate || nachaLoading}
              onClick={async () => {
                setNachaLoading(true);
                try {
                  const sid = getSessionId();
                  const res = await fetch(
                    `/api/payroll/runs/${id}/ach-export?effectiveDate=${nachaDate}`,
                    { headers: sid ? { 'x-session-id': sid } : {}, credentials: 'include' },
                  );
                  if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || res.statusText);
                  }
                  const entryCount = res.headers.get('X-Ach-Entry-Count');
                  const dateUsed = res.headers.get('X-Ach-Effective-Date') ?? nachaDate;
                  const wasAdvanced = res.headers.get('X-Ach-Date-Advanced') === '1';
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `payroll-${r.periodEnd}.ach`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  setNachaDlg(false);
                  toast({
                    title: 'NACHA file downloaded',
                    description: [
                      entryCount ? `${entryCount} direct-deposit entr${entryCount === '1' ? 'y' : 'ies'} included.` : '',
                      `Settlement date: ${dateUsed}.`,
                      wasAdvanced ? 'Date was auto-advanced to next business day.' : '',
                    ].filter(Boolean).join(' '),
                  });
                } catch (e: any) {
                  toast({ title: 'NACHA export failed', description: e.message, variant: 'destructive' });
                } finally {
                  setNachaLoading(false);
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Download ACH File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
