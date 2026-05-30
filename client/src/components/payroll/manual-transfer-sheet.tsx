import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney } from "@/lib/payroll-format";
import { Copy, Download, Send, CheckCheck } from "lucide-react";

export interface TransferRecipient {
  id: string;
  name: string;
  email?: string | null;
  amountCents: number;
  note?: string;
}

interface ManualTransferSheetProps {
  recipients: TransferRecipient[];
  title?: string;
  description?: string;
}

export function ManualTransferSheet({ recipients, title = "Manual transfer sheet", description }: ManualTransferSheetProps) {
  const { toast } = useToast();
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const total = recipients.reduce((s, r) => s + r.amountCents, 0);
  const allSent = recipients.length > 0 && recipients.every(r => sent[r.id]);

  function toggleSent(id: string) {
    setSent(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function copyAmount(r: TransferRecipient) {
    const dollars = (r.amountCents / 100).toFixed(2);
    navigator.clipboard.writeText(dollars).then(() => {
      toast({ title: "Copied", description: `${dollars} copied to clipboard` });
    });
  }

  function copyAll() {
    const lines = recipients.map(r => {
      const dollars = (r.amountCents / 100).toFixed(2);
      const contact = r.email ? ` — ${r.email}` : "";
      return `${r.name}${contact} — $${dollars}`;
    });
    lines.push(`TOTAL — $${(total / 100).toFixed(2)}`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Copied all", description: "Paste into Venmo, Zelle, or a spreadsheet." });
    });
  }

  function exportCsv() {
    const rows = [["Name", "Email", "Amount (USD)", "Sent?"]];
    for (const r of recipients) {
      rows.push([
        r.name,
        r.email ?? "",
        (r.amountCents / 100).toFixed(2),
        sent[r.id] ? "yes" : "no",
      ]);
    }
    rows.push(["TOTAL", "", (total / 100).toFixed(2), ""]);
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transfer-sheet.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (recipients.length === 0) return null;

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              {title}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {description ?? "ACH originator not yet registered — use these amounts to pay each recipient via Venmo, Zelle, wire, or check. Check each row as you send."}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={copyAll} data-testid="button-copy-all">
              <Copy className="h-3.5 w-3.5 mr-1.5" />Copy all
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2 w-6">
                <Checkbox
                  checked={allSent}
                  onCheckedChange={checked => {
                    const next: Record<string, boolean> = {};
                    recipients.forEach(r => { next[r.id] = !!checked; });
                    setSent(next);
                  }}
                  aria-label="Mark all sent"
                  data-testid="check-all-sent"
                />
              </th>
              <th className="py-2">Recipient</th>
              <th className="py-2">Zelle / contact</th>
              {recipients.some(r => r.note) && <th className="py-2">Note</th>}
              <th className="text-right py-2">Amount</th>
              <th className="py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {recipients.map(r => (
              <tr
                key={r.id}
                className={`border-b last:border-0 transition-colors ${sent[r.id] ? "opacity-50" : ""}`}
                data-testid={`transfer-row-${r.id}`}
              >
                <td className="py-2.5">
                  <Checkbox
                    checked={!!sent[r.id]}
                    onCheckedChange={() => toggleSent(r.id)}
                    aria-label={`Mark ${r.name} as sent`}
                    data-testid={`check-sent-${r.id}`}
                  />
                </td>
                <td className="py-2.5 font-medium">
                  {sent[r.id] && <CheckCheck className="h-3.5 w-3.5 inline mr-1.5 text-green-600" />}
                  {r.name}
                </td>
                <td className="py-2.5 text-muted-foreground">
                  {r.email ? (
                    <span className="font-mono text-xs bg-accent px-1.5 py-0.5 rounded select-all">{r.email}</span>
                  ) : (
                    <span className="text-xs italic">no email on file</span>
                  )}
                </td>
                {recipients.some(x => x.note) && (
                  <td className="py-2.5 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                )}
                <td className="py-2.5 text-right font-semibold tabular-nums">
                  {fmtMoney(r.amountCents)}
                </td>
                <td className="py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => copyAmount(r)}
                    title="Copy dollar amount"
                    data-testid={`button-copy-${r.id}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={2} className="py-2.5">
                Total · {recipients.filter(r => sent[r.id]).length}/{recipients.length} sent
              </td>
              <td />
              {recipients.some(r => r.note) && <td />}
              <td className="text-right py-2.5 tabular-nums">{fmtMoney(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}
