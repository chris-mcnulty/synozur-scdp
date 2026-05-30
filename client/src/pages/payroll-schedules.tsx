import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtDate } from "@/lib/payroll-format";
import { Info } from "lucide-react";

const FREQUENCIES: { value: string; label: string; description: string; example: string }[] = [
  {
    value: "weekly",
    label: "Weekly",
    description: "52 pay periods per year.",
    example: "e.g. every Friday",
  },
  {
    value: "biweekly",
    label: "Biweekly (every 2 weeks)",
    description: "26 pay periods per year. Most common for hourly staff.",
    example: "e.g. every other Friday",
  },
  {
    value: "semimonthly",
    label: "Semi-monthly (twice a month)",
    description: "24 pay periods per year, always on the same dates (e.g. 1st and 15th).",
    example: "e.g. 1st and 15th of each month",
  },
  {
    value: "monthly",
    label: "Monthly",
    description: "12 pay periods per year. Common for salaried staff.",
    example: "e.g. last day of each month",
  },
  {
    value: "quarterly",
    label: "Quarterly",
    description: "4 pay periods per year. Typical for profit-sharing or owner distributions run through payroll.",
    example: "e.g. end of March, June, September, December",
  },
];

function frequencyLabel(f: string) {
  return FREQUENCIES.find(x => x.value === f)?.label ?? f;
}

export default function PayrollSchedules() {
  const { data: schedules } = useQuery<any[]>({ queryKey: ["/api/payroll/schedules"] });
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    name: '',
    frequency: 'biweekly',
    anchorPeriodStart: today,
    payDateOffsetDays: 5,
    isActive: true,
  });

  const selectedFreq = FREQUENCIES.find(f => f.value === form.frequency);

  const create = useMutation({
    mutationFn: (b: any) => apiRequest("/api/payroll/schedules", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/schedules"] });
      toast({ title: "Schedule created" });
      setForm({ name: '', frequency: 'biweekly', anchorPeriodStart: today, payDateOffsetDays: 5, isActive: true });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // Compute a human-readable example pay date from the anchor + offset
  function payDateExample(): string {
    try {
      const anchor = new Date(form.anchorPeriodStart + 'T00:00:00Z');
      const freqDays: Record<string, number> = {
        weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91,
      };
      const periodDays = freqDays[form.frequency] ?? 14;
      const periodEnd = new Date(anchor.getTime() + periodDays * 86400000 - 86400000);
      const payDate = new Date(periodEnd.getTime() + Number(form.payDateOffsetDays) * 86400000);
      return payDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    } catch {
      return '—';
    }
  }

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold">Pay schedules</h1>
          <p className="text-sm text-muted-foreground">
            A pay schedule defines how often payroll runs and when employees get paid. You can have multiple
            schedules — for example, one biweekly schedule for hourly staff and one monthly schedule for salaried employees.
          </p>
        </div>

        {/* Existing schedules */}
        <Card>
          <CardHeader><CardTitle>Your schedules</CardTitle></CardHeader>
          <CardContent>
            {(!schedules || schedules.length === 0) ? (
              <p className="text-sm text-muted-foreground">No schedules yet — create one below.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>How often</th>
                    <th>First period starts</th>
                    <th>Days to pay after period ends</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td>{frequencyLabel(s.frequency)}</td>
                      <td>{fmtDate(s.anchorPeriodStart)}</td>
                      <td>+{s.payDateOffsetDays} days after period ends</td>
                      <td>{s.isActive ? <span className="text-green-700">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Create new schedule */}
        <Card>
          <CardHeader>
            <CardTitle>New schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name */}
            <div className="max-w-sm">
              <Label>Schedule name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Salaried Monthly, Hourly Biweekly"
              />
            </div>

            {/* Frequency */}
            <div className="max-w-sm">
              <Label>How often do you run payroll?</Label>
              <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFreq && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedFreq.description} <span className="italic">{selectedFreq.example}</span>
                </p>
              )}
            </div>

            {/* Anchor + offset side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label>When does your first pay period start?</Label>
                <Input
                  type="date"
                  value={form.anchorPeriodStart}
                  onChange={e => setForm({ ...form, anchorPeriodStart: e.target.value })}
                />
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Pick the start date of any pay period you've already used — past or present.
                    The system uses this as a reference point to calculate all future period boundaries automatically.
                    For a new company, today's date is fine.
                  </span>
                </div>
              </div>

              <div>
                <Label>How many days after a period ends do employees get paid?</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={form.payDateOffsetDays}
                    onChange={e => setForm({ ...form, payDateOffsetDays: Number(e.target.value) })}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    This is processing time — how long it takes to run payroll and send the ACH transfer after the work period closes.
                    5 days is a safe default. If your bank is faster, you can lower it.
                  </span>
                </div>
                {form.anchorPeriodStart && (
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-2">
                    Example: with these settings, the first pay date would be around <strong>{payDateExample()}</strong>.
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={() => create.mutate(form)}
              disabled={create.isPending || !form.name}
            >
              {create.isPending ? 'Creating…' : 'Create schedule'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
