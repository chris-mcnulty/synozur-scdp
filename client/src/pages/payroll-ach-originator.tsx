import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Info, CheckCircle } from "lucide-react";

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 mt-1">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

export default function PayrollAchOriginator() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/payroll/ach-originator"] });
  const { toast } = useToast();

  const [form, setForm] = useState({
    companyName: "",
    companyId: "",
    originatingDfi: "",
    immediateOriginName: "",
    immediateOrigin: "",
    immediateDestinationName: "",
    immediateDestination: "",
  });

  useEffect(() => {
    if (data) setForm({
      companyName: data.companyName ?? "",
      companyId: data.companyId ?? "",
      originatingDfi: data.originatingDfi ?? "",
      immediateOriginName: data.immediateOriginName ?? "",
      immediateOrigin: data.immediateOrigin ?? "",
      immediateDestinationName: data.immediateDestinationName ?? "",
      immediateDestination: data.immediateDestination ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (body: any) => apiRequest("/api/payroll/ach-originator", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/ach-originator"] });
      toast({ title: "ACH originator profile saved", description: "Direct deposit and NACHA file generation will use these values." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // Derive a routing number preview from the originatingDfi field
  const einPreview = form.companyId
    ? form.companyId.replace(/^1/, '').replace(/(\d{2})(\d{7})/, '$1-$2')
    : null;

  const isConfigured = !!data?.companyName;

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold">ACH originator profile</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            When you send direct deposit payments, your bank needs to know who is sending the money.
            These credentials come from your bank's ACH enrollment paperwork — call their treasury or
            cash management team if you don't have them.
          </p>
        </div>

        {isConfigured && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Profile is configured — direct deposit and NACHA file generation are enabled.
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        <Card>
          <CardHeader>
            <CardTitle>Company identity</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              This identifies your company in every NACHA file your bank receives.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Company name</Label>
                <Input
                  value={form.companyName}
                  onChange={e => setForm({ ...form, companyName: e.target.value.slice(0, 16) })}
                  maxLength={16}
                  placeholder="Synozur LLC"
                  data-testid="input-company-name"
                />
                <HelpText>
                  Your legal company name. Maximum 16 characters (NACHA limit) — abbreviate if needed.
                  {form.companyName && form.companyName.length >= 14 && (
                    <span className="text-amber-700"> {16 - form.companyName.length} characters left.</span>
                  )}
                </HelpText>
              </div>

              <div>
                <Label>Company ID (EIN with leading 1)</Label>
                <Input
                  value={form.companyId}
                  onChange={e => setForm({ ...form, companyId: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  maxLength={10}
                  placeholder="1123456789"
                  data-testid="input-company-id"
                />
                <HelpText>
                  Your 10-digit ACH company ID. For most US companies this is your EIN with a "1" prepended
                  — so if your EIN is 12-3456789, enter <strong>1123456789</strong>.
                  {einPreview && <span> (EIN preview: {einPreview})</span>}
                </HelpText>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank / routing information</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              These come from your bank's ACH origination enrollment. Ask for the "NACHA file header values"
              or "ACH originator credentials" when you call your treasury team.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Originating DFI (your bank's routing prefix)</Label>
              <Input
                value={form.originatingDfi}
                onChange={e => setForm({ ...form, originatingDfi: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                maxLength={8}
                placeholder="12345678"
                className="max-w-xs"
                data-testid="input-originating-dfi"
              />
              <HelpText>
                The first 8 digits of your bank's routing number (drop the last check digit).
                For example, if your routing number is 121000358, enter <strong>12100035</strong>.
              </HelpText>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <Label>Immediate origin name</Label>
                <Input
                  value={form.immediateOriginName}
                  onChange={e => setForm({ ...form, immediateOriginName: e.target.value.slice(0, 23) })}
                  maxLength={23}
                  placeholder="Synozur LLC"
                  data-testid="input-immediate-origin-name"
                />
                <HelpText>Usually your company name. Max 23 characters. Your bank will confirm the exact value.</HelpText>
              </div>

              <div>
                <Label>Immediate origin</Label>
                <Input
                  value={form.immediateOrigin}
                  onChange={e => setForm({ ...form, immediateOrigin: e.target.value.slice(0, 10) })}
                  maxLength={10}
                  placeholder="1123456789"
                  data-testid="input-immediate-origin"
                />
                <HelpText>Usually your 10-digit Company ID again (same as the field above). Some banks use a space + 9-digit EIN.</HelpText>
              </div>

              <div>
                <Label>Immediate destination name</Label>
                <Input
                  value={form.immediateDestinationName}
                  onChange={e => setForm({ ...form, immediateDestinationName: e.target.value.slice(0, 23) })}
                  maxLength={23}
                  placeholder="Wells Fargo"
                  data-testid="input-immediate-destination-name"
                />
                <HelpText>Your bank's name as it appears in NACHA files. Max 23 characters. Your bank will tell you.</HelpText>
              </div>

              <div>
                <Label>Immediate destination (routing number)</Label>
                <Input
                  value={form.immediateDestination}
                  onChange={e => setForm({ ...form, immediateDestination: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  maxLength={10}
                  placeholder="0121000358"
                  data-testid="input-immediate-destination"
                />
                <HelpText>
                  Your bank's full 9-digit routing number, left-padded with a zero to make 10 digits.
                  For example, routing 121000358 → enter <strong>0121000358</strong>.
                </HelpText>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-4">
          <Button
            onClick={() => save.mutate(form)}
            disabled={save.isPending || !form.companyName || !form.companyId || !form.originatingDfi}
            data-testid="button-save-ach"
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Not sure what to enter? Call your bank and ask for your "ACH originator credentials" or "NACHA file header values."
          </p>
        </div>
      </div>
    </Layout>
  );
}
