import { useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney, fmtDate } from "@/lib/payroll-format";
import { ArrowLeft, Download, DollarSign } from "lucide-react";

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs", id] }); toast({ title: "Preview computed" }); },
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
            <a href={`/api/payroll/runs/${id}/gl-export?format=csv`}><Button variant="outline"><Download className="h-4 w-4 mr-2" />GL CSV</Button></a>
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
                  <tr><th className="py-2">Employee</th><th className="text-right">Gross</th><th className="text-right">Pre-tax ded.</th><th className="text-right">Emp tax</th><th className="text-right">Empr tax</th><th className="text-right">Post-tax ded.</th><th className="text-right">Net</th></tr>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
