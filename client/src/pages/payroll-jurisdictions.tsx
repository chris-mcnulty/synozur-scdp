import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

interface Jurisdiction {
  id: string;
  tenantId: string | null;
  code: string;
  name: string;
  level: string;
  rule: any;
  isActive: boolean;
}

/**
 * Tenant-scoped tax jurisdiction overrides. The list returned by the API
 * is the union of platform defaults (tenant_id IS NULL) + tenant overrides;
 * when a (tenant, code) pair has an override row, the engine uses that one.
 *
 * The focus of this page is SUTA experience-rate overrides — every state
 * SUTA seed comes with the new-employer rate, and tenants are expected to
 * replace it with the experience-rated percentage their state assigned.
 * Other jurisdiction shapes (state withholding brackets, local flat
 * percent, wage premiums) are visible but not editable here — those are
 * platform-managed today.
 */
export default function PayrollJurisdictions() {
  const { data: list, isLoading } = useQuery<Jurisdiction[]>({ queryKey: ["/api/payroll/jurisdictions"] });
  const { toast } = useToast();

  // Find the matching platform default for an SUTA code (e.g. SUTA-CA) so
  // we can show "new-employer default" vs. the tenant override clearly.
  const sutaRows = useMemo(() => {
    if (!list) return [];
    const grouped = new Map<string, { code: string; name: string; platform: Jurisdiction | null; tenant: Jurisdiction | null }>();
    for (const j of list) {
      if (j.rule?.kind !== 'suta') continue;
      const key = j.code;
      const slot = grouped.get(key) ?? { code: j.code, name: j.name, platform: null, tenant: null };
      if (j.tenantId === null) slot.platform = j;
      else slot.tenant = j;
      slot.name = j.name;
      grouped.set(key, slot);
    }
    return Array.from(grouped.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [list]);

  const upsert = useMutation({
    mutationFn: (body: any) => apiRequest("/api/payroll/jurisdictions", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/jurisdictions"] });
      toast({ title: "Override saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/payroll/jurisdictions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/jurisdictions"] });
      toast({ title: "Override removed", description: "State default will apply going forward." });
    },
  });

  const [draft, setDraft] = useState<Record<string, { rate: string; wageBase: string }>>({});

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">State unemployment (SUTA) overrides</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Every state seeds with the new-employer SUTA rate. Once your state assigns an experience-rated
            percentage (typically in the annual rate-notice letter), enter it below — the payroll engine
            uses tenant overrides ahead of the platform default. Delete the row to revert to the seed.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>State SUTA rates</CardTitle></CardHeader>
          <CardContent>
            {isLoading && <p>Loading…</p>}
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Code</th>
                  <th>State</th>
                  <th>Platform default</th>
                  <th>Your override</th>
                  <th>Wage base</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sutaRows.map(row => {
                  const platRate = row.platform?.rule?.ratePct;
                  const platBase = row.platform?.rule?.wageBaseCents;
                  const overrideRate = row.tenant?.rule?.ratePct;
                  const overrideBase = row.tenant?.rule?.wageBaseCents;
                  const draftKey = row.code;
                  const d = draft[draftKey] ?? { rate: '', wageBase: '' };
                  return (
                    <tr key={row.code} className="border-b last:border-0" data-testid={`row-suta-${row.code}`}>
                      <td className="py-2 font-mono">{row.code}</td>
                      <td>{row.name}</td>
                      <td>{platRate != null ? `${platRate}%` : '—'}</td>
                      <td>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            step="0.001"
                            placeholder={overrideRate != null ? `${overrideRate}` : 'e.g. 1.234'}
                            value={d.rate}
                            onChange={ev => setDraft(s => ({ ...s, [draftKey]: { ...d, rate: ev.target.value } }))}
                            className="w-28"
                            data-testid={`input-suta-rate-${row.code}`}
                          />
                          <span>%</span>
                        </div>
                        {overrideRate != null && <p className="text-xs text-muted-foreground mt-1">Override: {overrideRate}%</p>}
                      </td>
                      <td>
                        <Input
                          type="number"
                          placeholder={platBase != null ? `${(platBase / 100).toFixed(0)}` : '0'}
                          value={d.wageBase}
                          onChange={ev => setDraft(s => ({ ...s, [draftKey]: { ...d, wageBase: ev.target.value } }))}
                          className="w-32"
                          data-testid={`input-suta-base-${row.code}`}
                        />
                        {overrideBase != null && <p className="text-xs text-muted-foreground mt-1">Override: ${(overrideBase / 100).toFixed(0)}</p>}
                      </td>
                      <td className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!d.rate}
                          onClick={() => {
                            const rate = Number(d.rate);
                            if (!isFinite(rate) || rate < 0) {
                              toast({ title: "Bad rate", description: "Rate must be a positive number.", variant: "destructive" });
                              return;
                            }
                            // Wage base in cents; fall back to platform default
                            // when the admin hasn't supplied one. Many states
                            // don't change the wage base year-over-year so
                            // copying the seed is the right move.
                            const baseDollars = d.wageBase ? Number(d.wageBase) : (platBase != null ? platBase / 100 : 0);
                            const wageBaseCents = Math.round(baseDollars * 100);
                            const rule = {
                              ...(row.platform?.rule ?? row.tenant?.rule ?? { kind: 'suta' }),
                              kind: 'suta',
                              ratePct: rate,
                              wageBaseCents,
                            };
                            upsert.mutate({
                              code: row.code,
                              name: row.name,
                              level: row.platform?.level ?? row.tenant?.level ?? 'state',
                              rule,
                              isActive: true,
                            });
                            setDraft(s => { const next = { ...s }; delete next[draftKey]; return next; });
                          }}
                        >Save override</Button>
                        {row.tenant && (
                          <Button size="icon" variant="ghost" onClick={() => del.mutate(row.tenant!.id)} data-testid={`button-suta-revert-${row.code}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sutaRows.length === 0 && !isLoading && <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No SUTA jurisdictions seeded.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Other jurisdictions (read-only)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Code</th><th>Name</th><th>Level</th><th>Kind</th><th>Scope</th></tr>
              </thead>
              <tbody>
                {(list || []).filter(j => j.rule?.kind !== 'suta').map(j => (
                  <tr key={j.id} className="border-b last:border-0">
                    <td className="py-2 font-mono">{j.code}</td>
                    <td>{j.name}</td>
                    <td>{j.level}</td>
                    <td className="font-mono text-xs">{j.rule?.kind}</td>
                    <td>{j.tenantId ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">tenant override</span> : <span className="text-xs text-muted-foreground">platform</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Federal / FICA reference rates — hardcoded in the payroll engine */}
        <Card>
          <CardHeader>
            <CardTitle>Federal tax rates (platform-managed)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              These are the rates the payroll engine applies automatically. They are updated by Synozur when the IRS or SSA publishes new figures.
              No action is needed from you unless you receive a SUTA experience-rate notice from your state.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">FICA — Social Security</p>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Employee rate</td><td className="text-right font-medium">6.2%</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Employer rate</td><td className="text-right font-medium">6.2%</td></tr>
                    <tr><td className="py-1.5 text-muted-foreground">2025 wage base</td><td className="text-right font-medium">$176,100</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">FICA — Medicare</p>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Employee rate</td><td className="text-right font-medium">1.45%</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Employer rate</td><td className="text-right font-medium">1.45%</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Wage base</td><td className="text-right font-medium">No cap</td></tr>
                    <tr><td className="py-1.5 text-muted-foreground">Additional Medicare (employee only, &gt;$200k)</td><td className="text-right font-medium">+0.9%</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">FUTA — Federal unemployment</p>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Statutory rate</td><td className="text-right font-medium">6.0%</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Normal FUTA credit (state SUI paid)</td><td className="text-right font-medium">−5.4%</td></tr>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Effective net rate</td><td className="text-right font-medium">0.6%</td></tr>
                    <tr><td className="py-1.5 text-muted-foreground">2025 wage base</td><td className="text-right font-medium">$7,000</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Supplemental / bonus withholding</p>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5 text-muted-foreground">Federal flat rate (under $1M)</td><td className="text-right font-medium">22%</td></tr>
                    <tr><td className="py-1.5 text-muted-foreground">Federal flat rate (over $1M)</td><td className="text-right font-medium">37%</td></tr>
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-2">
                  Bonus runs use the supplemental flat rate for federal income tax withholding.
                  FICA and Medicare still apply normally.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
